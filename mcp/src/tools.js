// The three read-only camera capabilities, as pure logic (no MCP/HTTP here, so they are
// easy to unit-test with a mocked go2rtc client). Every tool:
//   - accepts only a `camera_id` the caller picks from the known inventory,
//   - validates it (format + allowlist) before doing anything,
//   - resolves the logical id to a go2rtc stream NAME internally (via the manifest),
//   - returns structured results / structured errors,
//   - never returns credentials, RTSP URLs, go2rtc stream names, or the internal `provider`.
//
// Status is deliberately evidence-based. A camera being configured in go2rtc says nothing
// about whether it is online (a battery camera can be dead while its stream is still
// configured), so status reports three separate facts:
//   - configured:    go2rtc has at least one of the camera's streams configured,
//   - streaming_now: go2rtc is receiving video for it right now (someone is viewing it),
//   - last_seen:     when NightStrix last OBSERVED live video from it (a successful snapshot
//                    or an active stream), or null if never observed since this process
//                    started.
// Status checks never wake a camera: they only read go2rtc's stream list. Only get_snapshot
// connects to the camera.

import { isValidCameraId, primaryStream } from './inventory.js';
import { Go2rtcError } from './go2rtc.js';

function go2rtcErrorInfo(err) {
  if (err instanceof Go2rtcError) {
    if (err.kind === 'timeout') return { error: 'timeout', message: 'go2rtc did not respond in time.' };
    return { error: 'go2rtc_unavailable', message: 'go2rtc is currently unavailable.' };
  }
  return { error: 'internal_error', message: 'An unexpected error occurred.' };
}

// go2rtc reports an idle producer as just its source; a connected one carries connection
// info including bytes_recv. Only that counter is read here, never the source/url fields.
function isReceiving(streamInfo) {
  const producers = streamInfo && Array.isArray(streamInfo.producers) ? streamInfo.producers : [];
  return producers.some((p) => p && Number(p.bytes_recv) > 0);
}

export function buildTools({ cameras, go2rtc, now = () => new Date() }) {
  const byId = new Map(cameras.map((c) => [c.id, c]));
  const lastSeen = new Map(); // camera id -> ISO timestamp of the last observed live video

  function reject(camera_id) {
    if (!isValidCameraId(camera_id)) {
      return { error: 'invalid_camera_id', message: 'camera_id must be a known camera identifier (letters, digits, "_" or "-").' };
    }
    if (!byId.has(camera_id)) {
      return { camera_id, error: 'unknown_camera', message: 'No camera with that id is configured in NightStrix.' };
    }
    return null;
  }

  // Status facts for one camera from a go2rtc stream list (null if go2rtc was unreachable).
  // Records an active stream as an observation, so viewing a camera on the wall counts.
  function statusFor(cam, streams) {
    const names = Object.values(cam.streams);
    const known = streams && typeof streams === 'object' ? streams : {};
    const has = (n) => Object.prototype.hasOwnProperty.call(known, n);
    const configured = names.some(has);
    const streaming_now = names.some((n) => has(n) && isReceiving(known[n]));
    if (streaming_now) lastSeen.set(cam.id, now().toISOString());
    return { configured, streaming_now, last_seen: lastSeen.get(cam.id) || null };
  }

  return {
    // list_cameras(): logical cameras with capabilities and evidence-based status.
    // Never exposes provider or stream names.
    async listCameras() {
      let streams = null;
      try {
        streams = await go2rtc.listStreams();
      } catch {
        /* go2rtc down -> nothing configured or streaming; last_seen is still reported */
      }
      return {
        cameras: cameras.map((c) => ({
          id: c.id,
          name: c.name,
          capabilities: c.capabilities,
          ...statusFor(c, streams),
        })),
      };
    },

    // camera_status(camera_id): read-only facts NightStrix/go2rtc can determine without
    // contacting the camera.
    async cameraStatus(camera_id) {
      const r = reject(camera_id);
      if (r) return { configured: false, streaming_now: false, last_seen: null, ...r };
      let streams;
      try {
        streams = await go2rtc.listStreams();
      } catch (err) {
        return { camera_id, configured: false, streaming_now: false, last_seen: lastSeen.get(camera_id) || null, ...go2rtcErrorInfo(err) };
      }
      return { camera_id, ...statusFor(byId.get(camera_id), streams) };
    },

    // get_snapshot(camera_id): a current JPEG for the camera as real bytes. Resolves the
    // logical id to a go2rtc stream name internally (prefers the light sub stream).
    // A successful snapshot is the strongest evidence the camera is online right now.
    async getSnapshot(camera_id) {
      const r = reject(camera_id);
      if (r) return r;
      const streamName = primaryStream(byId.get(camera_id)); // internal go2rtc handle, never returned
      try {
        const { mimeType, bytes } = await go2rtc.getFrame(streamName);
        const observed_at = now().toISOString();
        lastSeen.set(camera_id, observed_at);
        return { camera_id, mimeType, bytes, observed_at };
      } catch (err) {
        if (err instanceof Go2rtcError && err.kind === 'bad_status') {
          return { camera_id, error: 'snapshot_unavailable', message: 'Could not capture a snapshot. The camera may be asleep or offline.' };
        }
        return { camera_id, ...go2rtcErrorInfo(err) };
      }
    },
  };
}
