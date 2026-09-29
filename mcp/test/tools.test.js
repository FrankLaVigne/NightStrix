// Unit tests for the MCP tool logic + camera normalization. Run with `node --test`.
// No real cameras, no home network, no npm install: pure logic with a mocked go2rtc client.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeManifest, normalizeLegacyCams, isValidCameraId, primaryStream,
} from '../src/inventory.js';
import { buildTools } from '../src/tools.js';
import { Go2rtcError } from '../src/go2rtc.js';

// A Night Owl camera (sub + main) and a GENERIC RTSP camera (single stream) — proving the
// model is vendor-neutral. Note: go2rtc stream names differ from the logical ids.
const CAMERAS = normalizeManifest({
  cameras: [
    { id: 'front_door', display_name: 'Front Door', provider: 'nightowl',
      capabilities: ['video', 'snapshot', 'sub_stream', 'high_res'],
      streams: { sub: 'fd_sub', main: 'fd_main' } },
    { id: 'driveway', display_name: 'Driveway', provider: 'rtsp',
      capabilities: ['video', 'snapshot'], streams: { main: 'dw_main' } },
  ],
});

function mockGo2rtc({ streams = { fd_sub: {}, fd_main: {}, dw_main: {} }, frame, listError, frameError } = {}) {
  const calls = { listStreams: 0, getFrame: [] };
  return {
    calls,
    async listStreams() { calls.listStreams++; if (listError) throw listError; return streams; },
    async getFrame(name) { calls.getFrame.push(name); if (frameError) throw frameError; return frame || { mimeType: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }; },
  };
}

const badIds = ['rtsp://user:pass@192.168.1.163:554/ch0_1.264', '../api/streams', 'api/streams', 'fd_sub/x', 'front.door', '', '*', 'a'.repeat(100)];
const forbidden = ['provider', 'nightowl', 'rtsp', 'fd_sub', 'fd_main', 'dw_main', 'streams', '192.168', 'password', '@', ':554/'];

function assertNoLeak(obj) {
  const blob = JSON.stringify(obj);
  for (const s of forbidden) assert.ok(!blob.includes(s), `response leaked "${s}": ${blob}`);
}

test('list_cameras: logical cameras with capabilities + availability; no provider/streams leak', async () => {
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mockGo2rtc({ streams: { fd_sub: {}, fd_main: {} } }) });
  const res = await tools.listCameras();
  assert.deepEqual(res.cameras, [
    { id: 'front_door', name: 'Front Door', capabilities: ['video', 'snapshot', 'sub_stream', 'high_res'], available: true },
    { id: 'driveway', name: 'Driveway', capabilities: ['video', 'snapshot'], available: false }, // dw_main not in go2rtc
  ]);
  assertNoLeak(res);
});

test('list_cameras: go2rtc down -> all unavailable, still listed', async () => {
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mockGo2rtc({ listError: new Go2rtcError('unavailable', 'down') }) });
  const res = await tools.listCameras();
  assert.equal(res.cameras.length, 2);
  assert.ok(res.cameras.every((c) => c.available === false));
});

test('camera_status: known camera available; unknown/malformed rejected; no leak', async () => {
  const mock = mockGo2rtc();
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mock });
  assert.deepEqual(await tools.cameraStatus('front_door'), { camera_id: 'front_door', available: true, stream_available: true });
  assert.equal((await tools.cameraStatus('kitchen')).error, 'unknown_camera');
  for (const id of badIds) assert.equal((await tools.cameraStatus(id)).error, 'invalid_camera_id', `for ${JSON.stringify(id)}`);
  assert.equal(mock.calls.listStreams, 1, 'go2rtc only queried for the one valid known camera');
  assertNoLeak(await tools.cameraStatus('front_door'));
});

test('camera_status: go2rtc unavailable -> structured error', async () => {
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mockGo2rtc({ listError: new Go2rtcError('timeout', 'slow') }) });
  assert.equal((await tools.cameraStatus('front_door')).error, 'timeout');
});

test('get_snapshot: resolves logical id -> go2rtc SUB stream name (not the id)', async () => {
  const mock = mockGo2rtc();
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mock });
  const res = await tools.getSnapshot('front_door');
  assert.equal(res.camera_id, 'front_door');
  assert.ok(Buffer.isBuffer(res.bytes) && res.bytes.length > 0);
  assert.deepEqual(mock.calls.getFrame, ['fd_sub'], 'snapshot uses the SUB stream name, resolved internally');
});

test('get_snapshot: single-stream (generic RTSP) camera falls back to main', async () => {
  const mock = mockGo2rtc();
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mock });
  await tools.getSnapshot('driveway');
  assert.deepEqual(mock.calls.getFrame, ['dw_main']);
});

test('get_snapshot: unknown / RTSP-URL / path ids never reach go2rtc', async () => {
  const mock = mockGo2rtc();
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mock });
  assert.equal((await tools.getSnapshot('kitchen')).error, 'unknown_camera');
  for (const id of badIds) assert.equal((await tools.getSnapshot(id)).error, 'invalid_camera_id', `for ${JSON.stringify(id)}`);
  assert.equal(mock.calls.getFrame.length, 0, 'go2rtc.getFrame must never be called for unknown/malformed ids');
});

test('get_snapshot: sleeping/offline -> snapshot_unavailable; timeout -> timeout', async () => {
  const asleep = buildTools({ cameras: CAMERAS, go2rtc: mockGo2rtc({ frameError: new Go2rtcError('bad_status', 'no frame', 500) }) });
  assert.equal((await asleep.getSnapshot('front_door')).error, 'snapshot_unavailable');
  const slow = buildTools({ cameras: CAMERAS, go2rtc: mockGo2rtc({ frameError: new Go2rtcError('timeout', 'slow') }) });
  assert.equal((await slow.getSnapshot('front_door')).error, 'timeout');
});

test('provider and internal stream names never appear in any tool response', async () => {
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mockGo2rtc() });
  assertNoLeak(await tools.listCameras());
  assertNoLeak(await tools.cameraStatus('front_door'));
  const snap = await tools.getSnapshot('front_door');
  assertNoLeak({ camera_id: snap.camera_id, mimeType: snap.mimeType }); // bytes excluded (binary image)
});

test('primaryStream: prefers sub, then main, then id', () => {
  assert.equal(primaryStream({ id: 'a', streams: { sub: 's', main: 'm' } }), 's');
  assert.equal(primaryStream({ id: 'a', streams: { main: 'm' } }), 'm');
  assert.equal(primaryStream({ id: 'a', streams: {} }), 'a');
});

test('normalizeManifest: drops bad ids, dedupes, cleans unsafe stream names, defaults streams', () => {
  const cams = normalizeManifest({ cameras: [
    { id: 'ok', display_name: 'OK', streams: { sub: 'ok_sub', bad: 'rtsp://x' } },
    { id: 'rtsp://x', display_name: 'Bad', streams: { main: 'm' } },       // unsafe id -> dropped
    { id: 'ok', display_name: 'Dup' },                                     // duplicate id -> dropped
    { id: 'nostream' },                                                    // no streams -> {main:id}
  ]});
  assert.equal(cams.length, 2);
  assert.deepEqual(cams[0].streams, { sub: 'ok_sub' });                    // unsafe stream "bad" dropped
  assert.deepEqual(cams[1].streams, { main: 'nostream' });
  assert.equal(cams[0].provider, 'unknown');
});

test('normalizeLegacyCams: {name,id} -> model with sub=id, main=id_hd, nightowl provider', () => {
  const cams = normalizeLegacyCams([{ name: 'Back Yard', id: 'backyard' }]);
  assert.deepEqual(cams[0].streams, { sub: 'backyard', main: 'backyard_hd' });
  assert.equal(cams[0].name, 'Back Yard');
  assert.equal(cams[0].provider, 'nightowl');
});

test('isValidCameraId blocks injection-shaped ids', () => {
  assert.ok(isValidCameraId('front_door') && isValidCameraId('cam-1'));
  for (const id of badIds) assert.ok(!isValidCameraId(id), `should reject ${JSON.stringify(id)}`);
});
