// Camera inventory for the MCP server.
//
// Source of truth is NightStrix's existing `web/cams.js` (window.CAMS = [{name, id}]),
// so the MCP never maintains a second camera list that could drift. `cams.js` contains
// only display names and stream ids — NO credentials — and is mounted read-only.
//
// A camera `id` is also the go2rtc sub-stream name. It is the only thing a caller may
// select; NightStrix resolves it internally. Ids are strictly validated so a caller can
// never smuggle an RTSP URL, a go2rtc API path, or a path-traversal string through it.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Allow only safe, opaque identifiers: letters, digits, underscore, hyphen. This blocks
// "rtsp://…", "/api/…", "..", spaces, "@", "?", etc. before any lookup happens.
export const CAMERA_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidCameraId(id) {
  return typeof id === 'string' && CAMERA_ID_RE.test(id);
}

// Normalize a raw CAMS array into [{ id, name }], dropping anything with an unsafe id.
export function normalizeCameras(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const id = entry.id;
    if (!isValidCameraId(id) || seen.has(id)) continue;
    seen.add(id);
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name : id;
    out.push({ id, name });
  }
  return out;
}

// Load window.CAMS from a cams.js file by evaluating it in an isolated VM sandbox with a
// stubbed `window`. No network, no filesystem, no require inside the sandbox.
export function loadCamerasFromFile(path) {
  const code = readFileSync(path, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { timeout: 1000, filename: 'cams.js' });
  return normalizeCameras(sandbox.window && sandbox.window.CAMS);
}
