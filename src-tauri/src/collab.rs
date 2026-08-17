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
/// `bootstrap` is the peer ids from a share ticket, if any. It can be empty:
/// on a local network mDNS finds peers on its own, which is the case that
/// needs no infrastructure whatsoever.
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
    let endpoint = Endpoint::builder(presets::Minimal)
        .secret_key(secret)
        .bind()
        .await
        .map_err(|e| anyhow!("bind endpoint: {e}"))?;

    // Local-network discovery. Not a default feature of iroh — without this
    // there is nothing to find peers with when no relay is configured.
    let mdns = MdnsAddressLookup::builder()
        .build(endpoint.id())
        .map_err(|e| anyhow!("start mdns: {e}"))?;
    endpoint
        .address_lookup()
        .map_err(|e| anyhow!("address lookup unavailable: {e}"))?
        .add(mdns);

    let gossip = Gossip::builder().spawn(endpoint.clone());
    let endpoint_id = endpoint.id();
    let router = iroh::protocol::Router::builder(endpoint)
        .accept(GOSSIP_ALPN, gossip.clone())
        .spawn();

    let peers: Vec<EndpointId> = bootstrap
        .iter()
        .filter_map(|p| p.parse::<EndpointId>().ok())
        .collect();

    let topic = gossip
        .subscribe(topic_for(&doc_id), peers)
        .await
        .map_err(|e| anyhow!("subscribe: {e}"))?;
    let (sender, mut receiver) = topic.split();

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
        sender,
        _router: router,
        task,
    });

    Ok(endpoint_id.to_string())
}

/// Broadcast one frame to every peer on the topic.
#[tauri::command]
pub async fn collab_send(
    state: tauri::State<'_, CollabState>,
    frame: Vec<u8>,
) -> Result<(), String> {
    let guard = state.session.lock().await;
    let Some(session) = guard.as_ref() else {
        return Ok(()) // not connected — dropping the frame is correct
    };
    session
        .sender
        .broadcast(frame.into())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn collab_stop(state: tauri::State<'_, CollabState>) -> Result<(), String> {
    stop_session(&state).await;
    Ok(())
}

async fn stop_session(state: &tauri::State<'_, CollabState>) {
    if let Some(session) = state.session.lock().await.take() {
        session.task.abort();
    }
}
