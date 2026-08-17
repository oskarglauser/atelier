import { describe, expect, it } from 'vitest'
import {
  decodeTicket,
  encodeTicket,
  extractTicketCode,
  ticketAppUrl,
  ticketWebUrl,
} from './ticket'

const KEY_A = 'a'.repeat(64)
const KEY_B = '0123456789abcdef'.repeat(4)

describe('share tickets', () => {
  it('round-trips a document id and its peers', () => {
    const ticket = { docId: 'V1StGXR8Z5jd', peers: [KEY_A, KEY_B] }
    expect(decodeTicket(encodeTicket(ticket))).toEqual(ticket)
  })

  it('round-trips with no peers', () => {
    const ticket = { docId: 'V1StGXR8Z5jd', peers: [] }
    expect(decodeTicket(encodeTicket(ticket))).toEqual(ticket)
  })

  it('survives a document id with multi-byte characters', () => {
    // Ids are generated ASCII, but one adopted from a ticket is whatever the
    // sender had, and the length prefix counts bytes rather than characters.
    const ticket = { docId: 'proj-Ünïcødé-✓', peers: [KEY_A] }
    expect(decodeTicket(encodeTicket(ticket))).toEqual(ticket)
  })

  it('stays short enough to paste into a chat message', () => {
    const code = encodeTicket({ docId: 'V1StGXR8Z5jd', peers: [KEY_A] })
    // The old base64-of-JSON encoding of the same ticket ran ~135 characters.
    expect(code.length).toBeLessThanOrEqual(64)
  })

  it('produces a code safe to drop into a URL unescaped', () => {
    const code = encodeTicket({ docId: 'V1StGXR8Z5jd', peers: [KEY_A] })
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(encodeURIComponent(code)).toBe(code)
  })

  it('drops peers that are not 32-byte keys rather than emitting a corrupt ticket', () => {
    const ticket = { docId: 'V1StGXR8Z5jd', peers: ['abc', KEY_A, 'zz'.repeat(32)] }
    expect(decodeTicket(encodeTicket(ticket))).toEqual({
      docId: 'V1StGXR8Z5jd',
      peers: [KEY_A],
    })
  })

  it('refuses a ticket with no document id', () => {
    expect(encodeTicket({ docId: '', peers: [KEY_A] })).toBe('')
  })

  describe('accepts whatever the user pasted', () => {
    const ticket = { docId: 'V1StGXR8Z5jd', peers: [KEY_A] }
    const code = encodeTicket(ticket)

    it('the bare code', () => {
      expect(decodeTicket(code)).toEqual(ticket)
    })

    it('the code with surrounding whitespace', () => {
      expect(decodeTicket(`  ${code}\n`)).toEqual(ticket)
    })

    it('an app deep link', () => {
      expect(decodeTicket(ticketAppUrl(code))).toEqual(ticket)
    })

    it('a web link', () => {
      expect(decodeTicket(ticketWebUrl(code))).toEqual(ticket)
    })
  })

  it('keeps the code in the fragment of a web link, so it never reaches the server', () => {
    const code = encodeTicket({ docId: 'V1StGXR8Z5jd', peers: [KEY_A] })
    const url = new URL(ticketWebUrl(code))
    expect(url.hash).toContain(code)
    expect(url.pathname + url.search).not.toContain(code)
  })

  describe('rejects input that is not a ticket', () => {
    const cases: Record<string, string> = {
      empty: '',
      'not base64': '!!!!',
      'random text': 'hello there',
      'truncated body': encodeTicket({ docId: 'V1StGXR8Z5jd', peers: [KEY_A] }).slice(0, 6),
      'a link with no code': 'https://example.com/join/',
    }
    for (const [name, input] of Object.entries(cases)) {
      it(name, () => {
        expect(decodeTicket(input)).toBeNull()
      })
    }

    it('a future format version', () => {
      const code = encodeTicket({ docId: 'V1StGXR8Z5jd', peers: [KEY_A] })
      const bytes = Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
        c.charCodeAt(0)
      )
      bytes[0] = 99
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      const future = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      expect(decodeTicket(future)).toBeNull()
    })

    it('trailing bytes that are not a whole key', () => {
      const ticket = { docId: 'V1StGXR8Z5jd', peers: [KEY_A] }
      const code = encodeTicket(ticket)
      const bytes = Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
        c.charCodeAt(0)
      )
      const short = bytes.subarray(0, bytes.length - 1)
      let binary = ''
      for (const byte of short) binary += String.fromCharCode(byte)
      const truncated = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      expect(decodeTicket(truncated)).toBeNull()
    })
  })

  it('pulls the code out of a link', () => {
    expect(extractTicketCode('atelier://join/AbC-123_x')).toBe('AbC-123_x')
    expect(extractTicketCode('https://x.dev/#/join/AbC-123_x')).toBe('AbC-123_x')
    expect(extractTicketCode('AbC-123_x')).toBe('AbC-123_x')
  })
})
