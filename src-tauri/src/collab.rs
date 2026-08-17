//! Peer-to-peer transport for collaborative editing.
//!
//! Deliberately dumb: this module moves opaque byte frames between peers over
//! iroh-gossip and knows nothing about CRDTs. The Yjs sync and awareness
//! protocols live entirely in the frontend (`src/collab/yjsProtocol.ts`), so
//! there is exactly one implementation of them rather than one per language.
//!
//! Discovery is mDNS only and the endpoint uses the `Minimal` preset — no
//! relay, no rendezvous server, no accounts. Two machines on the same network
//! sync with the internet unplugged; peers on different networks do not
//! connect at all (that needs a relay, which is a later step).

use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use data_encoding::HEXLOWER;
use iroh::{endpoint::presets, Endpoint, EndpointId, SecretKey};
use iroh_gossip::{
    api::{Event, GossipSender},
    net::{Gossip, GOSSIP_ALPN},
    proto::TopicId,
};
use iroh_mdns_address_lookup::MdnsAddressLookup;
use n0_future::StreamExt;
use tauri::ipc::Channel;
use tokio::sync::Mutex;

/// A live session on one document.
struct Session {
    /// Which document this session is for. Frames submitted for any other
    /// document are refused — see `collab_send`.
    doc_id: String,
    sender: GossipSender,
    /// Kept alive for the duration of the session; dropping it stops serving.
    _router: iroh::protocol::Router,
    task: tokio::task::JoinHandle<()>,
}

#[derive(Default)]
pub struct CollabState {
    session: Arc<Mutex<Option<Session>>>,
}

/// Derive the gossip topic from the document id.
///
/// Anyone who knows the document id can join the topic, so the id is the
/// capability — treat it like a secret link, not a public name.
fn topic_for(doc_id: &str) -> TopicId {
    let digest = blake3::hash(doc_id.as_bytes());
    TopicId::from(*digest.as_bytes())
}

/// A stable identity for this installation, so peers recognise us across
/// restarts and IP changes instead of appearing as a stranger each time.
fn load_or_create_secret(app: &tauri::AppHandle) -> Result<SecretKey> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_local_data_dir()
        .context("no app data dir")?;
    std::fs::create_dir_all(&dir).ok();
    let path = dir.join("iroh-endpoint.key");

    if let Ok(text) = std::fs::read_to_string(&path) {
        if let Ok(bytes) = HEXLOWER.decode(text.trim().as_bytes()) {
            if let Ok(arr) = <[u8; 32]>::try_from(bytes.as_slice()) {
                return Ok(SecretKey::from_bytes(&arr));
            }
        }
    }

    let secret = SecretKey::generate();
    // Best effort: a session with an ephemeral key still works, peers just
    // won't recognise this machine next time.
    let _ = std::fs::write(&path, HEXLOWER.encode(&secret.to_bytes()));
    Ok(secret)
}

/// Join the swarm for `doc_id` and stream every received frame to the frontend.
///
/// `bootstrap` is the peer ids from a share ticket, if any. Empty is normal and
/// means "wait to be contacted" — the sharer has nobody to dial yet. The joiner
/// supplies the sharer's id from the ticket, mDNS resolves it to an address on
/// the LAN, and gossip dials it; the sharer then learns the joiner through that
/// connection. mDNS resolves and advertises addresses, but it does not by
/// itself put anyone into a topic, so a peer with no bootstrap ids stays alone
/// until someone dials in.
///
/// Subscription deliberately does not wait for a peer to appear
/// (`subscribe`, not `subscribe_and_join`) — the sharer would wait forever.
#[tauri::command]
pub async fn collab_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, CollabState>,
    doc_id: String,
    bootstrap: Vec<String>,
    on_frame: Channel<Vec<u8>>,
) -> Result<String, String> {
    collab_start_inner(app, state, doc_id, bootstrap, on_frame)
        .await
        .map_err(|e| e.to_string())
}

/// Everything needed to talk on one document's topic.
struct Transport {
    endpoint_id: EndpointId,
    sender: GossipSender,
    receiver: iroh_gossip::api::GossipReceiver,
    router: iroh::protocol::Router,
    /// Only the tests read this, to hand one peer's address to the other
    /// without going through discovery.
    #[cfg_attr(not(test), allow(dead_code))]
    endpoint: Endpoint,
}

/// Bind an endpoint and join `doc_id`'s topic.
///
/// Split out from the Tauri command so the transport can be exercised without a
/// running app — see the tests at the bottom of this file.
///
/// `seed_addrs` supplies peer addresses already known out of band, skipping
/// discovery. Production passes none and relies on mDNS; the loopback test uses
/// it so that it exercises the gossip pipe rather than the host's multicast
/// configuration. It is also where addresses would go if tickets ever carried
/// them, which would make joining work on networks that filter mDNS.
async fn open_transport(
    secret: SecretKey,
    doc_id: &str,
    bootstrap: &[String],
    seed_addrs: Vec<iroh::EndpointAddr>,
) -> Result<Transport> {
    let endpoint = Endpoint::builder(presets::Minimal)
        .secret_key(secret)
        .bind()
        .await
        .map_err(|e| anyhow!("bind endpoint: {e}"))?;

    let lookups = endpoint
        .address_lookup()
        .map_err(|e| anyhow!("address lookup unavailable: {e}"))?;

    // Local-network discovery. Not a default feature of iroh — without this
    // there is nothing to find peers with when no relay is configured.
    let mdns = MdnsAddressLookup::builder()
        .build(endpoint.id())
        .map_err(|e| anyhow!("start mdns: {e}"))?;
    lookups.add(mdns);

    if !seed_addrs.is_empty() {
        let memory = iroh::address_lookup::memory::MemoryLookup::new();
        for addr in seed_addrs {
            memory.add_endpoint_info(addr);
        }
        lookups.add(memory);
    }

    let gossip = Gossip::builder().spawn(endpoint.clone());
    let endpoint_id = endpoint.id();
    let endpoint_for_addr = endpoint.clone();
    let router = iroh::protocol::Router::builder(endpoint)
        .accept(GOSSIP_ALPN, gossip.clone())
        .spawn();

    let peers: Vec<EndpointId> = bootstrap
        .iter()
        .filter_map(|p| p.parse::<EndpointId>().ok())
        .collect();

    let topic = gossip
        .subscribe(topic_for(doc_id), peers)
        .await
        .map_err(|e| anyhow!("subscribe: {e}"))?;
    let (sender, receiver) = topic.split();

    Ok(Transport {
        endpoint_id,
        sender,
        receiver,
        router,
        endpoint: endpoint_for_addr,
    })
}

async fn collab_start_inner(
    app: tauri::AppHandle,
    state: tauri::State<'_, CollabState>,
    doc_id: String,
    bootstrap: Vec<String>,
    on_frame: Channel<Vec<u8>>,
) -> Result<String> {
    // Restarting on the same document should replace the old session, not
    // stack a second one on top of it.
    stop_session(&state).await;

    let secret = load_or_create_secret(&app)?;
    let Transport {
        endpoint_id,
        sender,
        mut receiver,
        router,
        ..
    } = open_transport(secret, &doc_id, &bootstrap, Vec::new()).await?;

    // Pump received frames to the frontend. Gossip is best-effort, which is
    // fine: the frontend re-requests missing updates periodically, and the Yjs
    // exchange is idempotent.
    let task = tokio::spawn(async move {
        while let Some(event) = receiver.next().await {
            match event {
                Ok(Event::Received(msg)) => {
                    if on_frame.send(msg.content.to_vec()).is_err() {
                        break; // frontend went away
                    }
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
    });

    *state.session.lock().await = Some(Session {
        doc_id,
        sender,
        _router: router,
        task,
    });

    Ok(endpoint_id.to_string())
}

/// Broadcast one frame to every peer on the topic.
///
/// `doc_id` names the document the caller believes it is sending for, and a
/// mismatch drops the frame. Switching projects tears one provider down while
/// standing the next one up, so a frame from the old document can still be in
/// flight when the new session is already live — without this check it would be
/// broadcast to the new document's peers, who would apply one document's
/// updates to another.
#[tauri::command]
pub async fn collab_send(
    state: tauri::State<'_, CollabState>,
    doc_id: String,
    frame: Vec<u8>,
) -> Result<(), String> {
    let guard = state.session.lock().await;
    let Some(session) = guard.as_ref() else {
        return Ok(()) // not connected — dropping the frame is correct
    };
    if session.doc_id != doc_id {
        return Ok(()) // late frame from a document we already left
    }
    session
        .sender
        .broadcast(frame.into())
        .await
        .map_err(|e| e.to_string())
}

/// Leave the swarm for `doc_id`.
///
/// Scoped to a document for the same reason as `collab_send`: teardown of the
/// old provider races the startup of the new one, so an unscoped stop could
/// arrive after the next document is already connected and silently kill it.
#[tauri::command]
pub async fn collab_stop(
    state: tauri::State<'_, CollabState>,
    doc_id: String,
) -> Result<(), String> {
    let mut guard = state.session.lock().await;
    if guard.as_ref().is_some_and(|s| s.doc_id == doc_id) {
        if let Some(session) = guard.take() {
            session.task.abort();
        }
    }
    Ok(())
}

/// Unconditionally drop any live session. Only for `collab_start`, which is
/// replacing whatever was there.
async fn stop_session(state: &tauri::State<'_, CollabState>) {
    if let Some(session) = state.session.lock().await.take() {
        session.task.abort();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use n0_future::time::Duration;

    /// The same document id must give the same topic on every machine —
    /// otherwise two peers "sharing" a document would sit in separate swarms.
    #[test]
    fn topic_is_derived_from_the_document_id() {
        assert_eq!(topic_for("doc-abc"), topic_for("doc-abc"));
        assert_ne!(topic_for("doc-abc"), topic_for("doc-abd"));
    }

    /// Read frames until one arrives, or give up.
    ///
    /// Gossip emits membership events alongside data, so a test cannot assume
    /// the first event is the message it is waiting for.
    async fn next_frame(
        receiver: &mut iroh_gossip::api::GossipReceiver,
    ) -> Option<Vec<u8>> {
        let deadline = Duration::from_secs(20);
        n0_future::time::timeout(deadline, async {
            while let Some(event) = receiver.next().await {
                if let Ok(Event::Received(msg)) = event {
                    return Some(msg.content.to_vec());
                }
            }
            None
        })
        .await
        .ok()
        .flatten()
    }

    /// Two endpoints on this machine, the second bootstrapped from the first's
    /// id exactly as a share ticket does it, must exchange frames both ways.
    ///
    /// The host's address is handed over directly rather than discovered, so a
    /// failure here means the topic derivation, dial path or byte pipe is wrong
    /// — not that this machine filters multicast. mDNS discovery is what the
    /// two-machine test on a real network covers.
    #[tokio::test]
    async fn two_peers_exchange_frames_in_both_directions() {
        // A distinct topic per run, so a concurrent test or a stray app on the
        // network cannot join this swarm and perturb it. The host's own fresh
        // key is already random, so it doubles as the nonce.
        let host_secret = SecretKey::generate();
        let doc_id = format!(
            "test-doc-{}",
            HEXLOWER.encode(&host_secret.public().as_bytes()[..8])
        );

        let host = open_transport(host_secret, &doc_id, &[], Vec::new())
            .await
            .expect("host binds");
        let host_id = host.endpoint_id.to_string();

        // Bind-time address enumeration is not instant, and an address with no
        // transports is useless to the guest.
        let mut host_addr = host.endpoint.addr();
        for _ in 0..50 {
            if !host_addr.addrs.is_empty() {
                break;
            }
            n0_future::time::sleep(Duration::from_millis(100)).await;
            host_addr = host.endpoint.addr();
        }
        assert!(
            !host_addr.addrs.is_empty(),
            "host never reported a reachable address"
        );

        let guest = open_transport(SecretKey::generate(), &doc_id, &[host_id], vec![host_addr])
            .await
            .expect("guest binds");

        let Transport {
            sender: host_tx,
            receiver: mut host_rx,
            router: host_router,
            ..
        } = host;
        let Transport {
            sender: guest_tx,
            receiver: mut guest_rx,
            router: guest_router,
            ..
        } = guest;

        // Guest dialled the host, so the host is reachable first. Sending until
        // it lands covers the window before the connection is established —
        // gossip drops broadcasts that have nobody to go to yet.
        let to_guest = b"host-to-guest".to_vec();
        let pump = tokio::spawn({
            let host_tx = host_tx.clone();
            let payload = to_guest.clone();
            async move {
                for _ in 0..40 {
                    let _ = host_tx.broadcast(payload.clone().into()).await;
                    n0_future::time::sleep(Duration::from_millis(250)).await;
                }
            }
        });
        assert_eq!(
            next_frame(&mut guest_rx).await.as_deref(),
            Some(to_guest.as_slice()),
            "guest never received the host's frame"
        );
        pump.abort();

        // The reverse direction shares the now-established connection.
        let to_host = b"guest-to-host".to_vec();
        guest_tx
            .broadcast(to_host.clone().into())
            .await
            .expect("guest broadcasts");
        assert_eq!(
            next_frame(&mut host_rx).await.as_deref(),
            Some(to_host.as_slice()),
            "host never received the guest's frame"
        );

        host_router.shutdown().await.ok();
        guest_router.shutdown().await.ok();
    }
}
