// Camera inventory for the MCP server — the normalized, vendor-neutral camera model.
//
// Source of truth is NightStrix's camera manifest `cameras.json` (see cameras.example.json):
//   { id, display_name, provider, capabilities[], streams{role->go2rtc name}, metadata }
// A logical `id` (e.g. "backyard") is all a consumer selects; NightStrix resolves it to a
// go2rtc stream name internally. The manifest contains NO credentials and NO URLs — only
// go2rtc stream NAMES. Credentials live solely in go2rtc.yaml.
//
// For backward compatibility, a legacy `cams.js` (window.CAMS = [{name, id}]) is still
// accepted and mapped onto the same model (streams: { sub: id, main: id+"_hd" }).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

// Safe, opaque identifiers/stream names: letters, digits, underscore, hyphen. Blocks
// "rtsp://…", "/api/…", "..", spaces, "@", "?", etc. before any lookup or go2rtc call.
export const CAMERA_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidCameraId(id) {
  return typeof id === 'string' && CAMERA_ID_RE.test(id);
}

// Keep only role->name entries whose values are safe stream names.
function cleanStreams(streams) {
  const out = {};
  if (streams && typeof streams === 'object') {
    for (const [role, name] of Object.entries(streams)) {
      if (isValidCameraId(role) && isValidCameraId(name)) out[role] = name;
    }
  }
  return out;
}

// Normalize one manifest entry into the internal model. Returns null if unusable.
export function normalizeManifestCamera(entry) {
  if (!entry || typeof entry !== 'object' || !isValidCameraId(entry.id)) return null;
  const streams = cleanStreams(entry.streams);
  // Fall back to a stream named like the id if none were given (legacy-friendly).
  if (Object.keys(streams).length === 0) streams.main = entry.id;
  const caps = Array.isArray(entry.capabilities)
    ? entry.capabilities.filter((c) => typeof c === 'string')
    : ['video', 'snapshot'];
  return {
    id: entry.id,
    name: typeof entry.display_name === 'string' && entry.display_name.trim() ? entry.display_name : entry.id,
    provider: typeof entry.provider === 'string' ? entry.provider : 'unknown', // internal only
    capabilities: [...new Set(caps)],
    streams,
    metadata: entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {},
  };
}

// Map a legacy cams.js entry ({name, id}) onto the model (sub = id, main = id_hd).
function normalizeLegacyCamera(entry) {
  if (!entry || typeof entry !== 'object' || !isValidCameraId(entry.id)) return null;
  return normalizeManifestCamera({
    id: entry.id,
    display_name: entry.name,
    provider: 'nightowl',
    capabilities: ['video', 'audio_input', 'snapshot', 'sub_stream', 'high_res'],
    streams: { sub: entry.id, main: `${entry.id}_hd` },
  });
}

function normalizeList(list, mapper) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of list) {
    const cam = mapper(entry);
    if (cam && !seen.has(cam.id)) { seen.add(cam.id); out.push(cam); }
  }
  return out;
}

export function normalizeManifest(obj) {
  const list = obj && Array.isArray(obj.cameras) ? obj.cameras : Array.isArray(obj) ? obj : [];
  return normalizeList(list, normalizeManifestCamera);
}

export function normalizeLegacyCams(list) {
  return normalizeList(list, normalizeLegacyCamera);
}

// Load the inventory from a config directory: prefer cameras.json (manifest), then cams.js.
export function loadCameras(configDir) {
  try {
    const raw = readFileSync(join(configDir, 'cameras.json'), 'utf8');
    return { source: 'cameras.json', cameras: normalizeManifest(JSON.parse(raw)) };
  } catch (e) {
    if (e.code !== 'ENOENT') throw e; // real parse/permission error should surface
  }
  try {
    const code = readFileSync(join(configDir, 'cams.js'), 'utf8');
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { timeout: 1000, filename: 'cams.js' });
    return { source: 'cams.js', cameras: normalizeLegacyCams(sandbox.window && sandbox.window.CAMS) };
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return { source: 'none', cameras: [] };
}

// Which go2rtc stream backs a snapshot / availability check for a camera.
// Prefer the light sub stream; fall back to main, then any stream, then the id.
export function primaryStream(cam) {
  return cam.streams.sub || cam.streams.main || Object.values(cam.streams)[0] || cam.id;
}
