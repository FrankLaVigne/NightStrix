// The three read-only camera capabilities, as pure logic (no MCP/HTTP here, so they are
// easy to unit-test with a mocked go2rtc client). Every tool:
//   - accepts only a `camera_id` the caller picks from the known inventory,
//   - validates it (format + allowlist) before doing anything,
//   - returns structured results / structured errors,
//   - never returns credentials, RTSP URLs, or go2rtc config.

import { isValidCameraId } from './inventory.js';
import { Go2rtcError } from './go2rtc.js';

// Map a low-level go2rtc failure to a stable, non-leaky error code + message.
function go2rtcErrorInfo(err) {
  if (err instanceof Go2rtcError) {
    if (err.kind === 'timeout') return { error: 'timeout', message: 'go2rtc did not respond in time.' };
    return { error: 'go2rtc_unavailable', message: 'go2rtc is currently unavailable.' };
  }
  return { error: 'internal_error', message: 'An unexpected error occurred.' };
}

export function buildTools({ cameras, go2rtc }) {
  const byId = new Map(cameras.map((c) => [c.id, c]));

  // Format ok first, then allowlist. Returns null when fine, or a structured error.
  function rejectId(camera_id) {
    if (!isValidCameraId(camera_id)) {
      return { error: 'invalid_camera_id', message: 'camera_id must be a known camera identifier (letters, digits, "_" or "-").' };
    }
    if (!byId.has(camera_id)) {
      return { camera_id, error: 'unknown_camera', message: 'No camera with that id is configured in NightStrix.' };
    }
    return null;
  }

  return {
    // list_cameras(): the cameras NightStrix knows about, with go2rtc-configured availability.
    async listCameras() {
      let configured = new Set();
      try {
        const streams = await go2rtc.listStreams();
        if (streams && typeof streams === 'object') configured = new Set(Object.keys(streams));
      } catch {
        // If go2rtc is down we still list the cameras, just marked unavailable.
      }
      return {
        cameras: cameras.map((c) => ({ id: c.id, name: c.name, available: configured.has(c.id) })),
      };
    },

    // camera_status(camera_id): read-only facts NightStrix/go2rtc can actually determine.
    //   available        -> the id is a known NightStrix camera AND go2rtc has the stream.
    //   stream_available -> go2rtc has the stream registered (i.e. it will serve it on demand).
    // Note: this does NOT probe the camera, so it does not claim a battery cam is awake right
    // now — use get_snapshot for a live frame.
    async cameraStatus(camera_id) {
      const rejected = rejectId(camera_id);
      if (rejected) return { available: false, stream_available: false, ...rejected };

      let streams;
      try {
        streams = await go2rtc.listStreams();
      } catch (err) {
        return { camera_id, available: false, stream_available: false, ...go2rtcErrorInfo(err) };
      }
      const hasStream = !!(streams && typeof streams === 'object' && Object.prototype.hasOwnProperty.call(streams, camera_id));
      return { camera_id, available: hasStream, stream_available: hasStream };
    },

    // get_snapshot(camera_id): a current JPEG for the camera, as real bytes (not a description).
    // Returns { camera_id, mimeType, bytes } on success, or a structured error.
    async getSnapshot(camera_id) {
      const rejected = rejectId(camera_id);
      if (rejected) return rejected;

      try {
        const { mimeType, bytes } = await go2rtc.getFrame(camera_id);
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
