// Minimal, constrained go2rtc client.
//
// This is the ONLY place the MCP talks to go2rtc, and it exposes exactly two operations:
//   - listStreams(): GET /api/streams   (which streams go2rtc has configured)
//   - getFrame(id):  GET /api/frame.jpeg?src=<id>   (a current JPEG for one stream)
//
// It deliberately does NOT offer a generic "call any go2rtc path" method. `id` is always
// URL-encoded and is expected to have been validated against the inventory by the caller,
// so it cannot change the request path or reach the go2rtc admin API.

export class Go2rtcError extends Error {
  // kind: 'timeout' | 'unavailable' | 'bad_status'
  constructor(kind, message, status) {
    super(message);
    this.name = 'Go2rtcError';
    this.kind = kind;
    this.status = status;
  }
}

export function createGo2rtcClient({ baseUrl, timeoutMs = 5000, fetchImpl = fetch }) {
  const base = String(baseUrl).replace(/\/+$/, '');

  async function request(path, accept) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(base + path, {
        method: 'GET',
        signal: controller.signal,
        headers: accept ? { Accept: accept } : undefined,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new Go2rtcError('timeout', `go2rtc request timed out after ${timeoutMs}ms`);
      }
      throw new Go2rtcError('unavailable', `go2rtc is unreachable: ${err && err.message}`);
    } finally {
      clearTimeout(timer);
    }
    return res;
  }

  return {
    async listStreams() {
      const res = await request('/api/streams', 'application/json');
      if (!res.ok) throw new Go2rtcError('bad_status', `go2rtc /api/streams returned ${res.status}`, res.status);
      return res.json();
    },

    // `id` MUST already be a validated, known camera id. It is URL-encoded regardless.
    async getFrame(id) {
      const res = await request('/api/frame.jpeg?src=' + encodeURIComponent(id), 'image/jpeg');
      if (!res.ok) throw new Go2rtcError('bad_status', `go2rtc frame for "${id}" returned ${res.status}`, res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Go2rtcError('bad_status', `go2rtc returned an empty frame for "${id}"`);
      const mimeType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
      return { mimeType, bytes: buf };
    },
  };
}
