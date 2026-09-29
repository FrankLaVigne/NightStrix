// The three read-only camera capabilities, as pure logic (no MCP/HTTP here, so they are
// easy to unit-test with a mocked go2rtc client). Every tool:
//   - accepts only a `camera_id` the caller picks from the known inventory,
//   - validates it (format + allowlist) before doing anything,
//   - resolves the logical id to a go2rtc stream NAME internally (via the manifest),
//   - returns structured results / structured errors,
//   - never returns credentials, RTSP URLs, go2rtc stream names, or the internal `provider`.

import { isValidCameraId, primaryStream } from './inventory.js';
import { Go2rtcError } from './go2rtc.js';

function go2rtcErrorInfo(err) {
  if (err instanceof Go2rtcError) {
    if (err.kind === 'timeout') return { error: 'timeout', message: 'go2rtc did not respond in time.' };
    return { error: 'go2rtc_unavailable', message: 'go2rtc is currently unavailable.' };
  }
  return { error: 'internal_error', message: 'An unexpected error occurred.' };
}

export function buildTools({ cameras, go2rtc }) {
  const byId = new Map(cameras.map((c) => [c.id, c]));

  function reject(camera_id) {
    if (!isValidCameraId(camera_id)) {
      return { error: 'invalid_camera_id', message: 'camera_id must be a known camera identifier (letters, digits, "_" or "-").' };
    }
    if (!byId.has(camera_id)) {
      return { camera_id, error: 'unknown_camera', message: 'No camera with that id is configured in NightStrix.' };
    }
    return null;
  }

  // Is the go2rtc stream that backs this camera currently configured in go2rtc?
  async function streamConfigured(cam) {
    const streams = await go2rtc.listStreams();
    if (!streams || typeof streams !== 'object') return false;
    // Available if ANY of the camera's stream names is known to go2rtc.
    for (const name of Object.values(cam.streams)) {
      if (Object.prototype.hasOwnProperty.call(streams, name)) return true;
    }
    return false;
  }

  return {
    // list_cameras(): logical cameras with capabilities and go2rtc-configured availability.
    // Never exposes provider or stream names.
    async listCameras() {
      let configured = new Set();
      try {
        const streams = await go2rtc.listStreams();
        if (streams && typeof streams === 'object') configured = new Set(Object.keys(streams));
      } catch {
        /* go2rtc down -> everything marked unavailable */
      }
      return {
        cameras: cameras.map((c) => ({
          id: c.id,
          name: c.name,
          capabilities: c.capabilities,
          available: Object.values(c.streams).some((n) => configured.has(n)),
        })),
      };
    },

    // camera_status(camera_id): read-only facts NightStrix/go2rtc can determine.
    async cameraStatus(camera_id) {
      const r = reject(camera_id);
      if (r) return { available: false, stream_available: false, ...r };
      let ok;
      try {
        ok = await streamConfigured(byId.get(camera_id));
      } catch (err) {
        return { camera_id, available: false, stream_available: false, ...go2rtcErrorInfo(err) };
      }
      return { camera_id, available: ok, stream_available: ok };
    },

    // get_snapshot(camera_id): a current JPEG for the camera as real bytes. Resolves the
    // logical id to a go2rtc stream name internally (prefers the light sub stream).
    async getSnapshot(camera_id) {
      const r = reject(camera_id);
      if (r) return r;
      const streamName = primaryStream(byId.get(camera_id)); // internal go2rtc handle, never returned
      try {
        const { mimeType, bytes } = await go2rtc.getFrame(streamName);
        return { camera_id, mimeType, bytes };
      } catch (err) {
        if (err instanceof Go2rtcError && err.kind === 'bad_status') {
          return { camera_id, error: 'snapshot_unavailable', message: 'Could not capture a snapshot. The camera may be asleep or offline.' };
        }
        return { camera_id, ...go2rtcErrorInfo(err) };
      }
    },
  };
}
