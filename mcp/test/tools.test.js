// Unit tests for the MCP tool logic. These run with the built-in Node test runner
// (`node --test`) and require NO real cameras, NO home network, and NO npm install:
// they exercise the pure tools with a mocked go2rtc client.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCameras, isValidCameraId } from '../src/inventory.js';
import { buildTools } from '../src/tools.js';
import { Go2rtcError } from '../src/go2rtc.js';

const CAMERAS = normalizeCameras([
  { name: 'Front Door', id: 'front_door' },
  { name: 'Driveway', id: 'driveway' },
]);

// A recording mock go2rtc client. Behaviour is configured per test.
function mockGo2rtc({ streams = { front_door: {}, driveway: {} }, frame, listError, frameError } = {}) {
  const calls = { listStreams: 0, getFrame: [] };
  return {
    calls,
    async listStreams() {
      calls.listStreams++;
      if (listError) throw listError;
      return streams;
    },
    async getFrame(id) {
      calls.getFrame.push(id);
      if (frameError) throw frameError;
      return frame || { mimeType: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) };
    },
  };
}

const badIds = ['rtsp://user:pass@192.168.1.163:554/ch0_1.264', '../api/streams', 'api/streams', 'front door', 'front/door', 'front.door', '', '*', 'a'.repeat(100)];

test('list_cameras returns configured cameras with availability from go2rtc', async () => {
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mockGo2rtc({ streams: { front_door: {} } }) });
  const res = await tools.listCameras();
  assert.deepEqual(res.cameras, [
    { id: 'front_door', name: 'Front Door', available: true },
    { id: 'driveway', name: 'Driveway', available: false }, // not in go2rtc streams
  ]);
});

test('list_cameras still lists cameras (unavailable) when go2rtc is down', async () => {
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mockGo2rtc({ listError: new Go2rtcError('unavailable', 'down') }) });
  const res = await tools.listCameras();
  assert.equal(res.cameras.length, 2);
  assert.ok(res.cameras.every((c) => c.available === false));
});

test('camera_status: known + configured stream is available', async () => {
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mockGo2rtc() });
  const res = await tools.cameraStatus('driveway');
  assert.deepEqual(res, { camera_id: 'driveway', available: true, stream_available: true });
});

test('camera_status: configured-but-missing stream is unavailable', async () => {
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mockGo2rtc({ streams: { front_door: {} } }) });
  const res = await tools.cameraStatus('driveway');
  assert.equal(res.available, false);
  assert.equal(res.stream_available, false);
});

test('camera_status: unknown camera id is rejected', async () => {
  const mock = mockGo2rtc();
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mock });
  const res = await tools.cameraStatus('kitchen');
  assert.equal(res.error, 'unknown_camera');
  assert.equal(res.available, false);
});

test('camera_status: malformed ids are rejected without touching go2rtc', async () => {
  const mock = mockGo2rtc();
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mock });
  for (const id of badIds) {
    const res = await tools.cameraStatus(id);
    assert.equal(res.error, 'invalid_camera_id', `expected invalid_camera_id for ${JSON.stringify(id)}`);
  }
  assert.equal(mock.calls.listStreams, 0, 'go2rtc must not be called for malformed ids');
});

test('camera_status: go2rtc unavailable returns a structured error', async () => {
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mockGo2rtc({ listError: new Go2rtcError('unavailable', 'down') }) });
  const res = await tools.cameraStatus('driveway');
  assert.equal(res.error, 'go2rtc_unavailable');
});

test('get_snapshot: returns real image bytes for a known camera', async () => {
  const jpeg = { mimeType: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0x00, 0x11, 0xff, 0xd9]) };
  const mock = mockGo2rtc({ frame: jpeg });
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mock });
  const res = await tools.getSnapshot('front_door');
  assert.equal(res.camera_id, 'front_door');
  assert.equal(res.mimeType, 'image/jpeg');
  assert.ok(Buffer.isBuffer(res.bytes) && res.bytes.length > 0);
  assert.deepEqual(mock.calls.getFrame, ['front_door'], 'exactly the validated id is passed to go2rtc');
});

test('get_snapshot: unknown camera is rejected without touching go2rtc', async () => {
  const mock = mockGo2rtc();
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mock });
  const res = await tools.getSnapshot('kitchen');
  assert.equal(res.error, 'unknown_camera');
  assert.equal(mock.calls.getFrame.length, 0);
});

test('get_snapshot: an RTSP URL / go2rtc path cannot be supplied as the id', async () => {
  const mock = mockGo2rtc();
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mock });
  for (const id of badIds) {
    const res = await tools.getSnapshot(id);
    assert.equal(res.error, 'invalid_camera_id', `expected invalid_camera_id for ${JSON.stringify(id)}`);
  }
  assert.equal(mock.calls.getFrame.length, 0, 'go2rtc.getFrame must never be called for malformed ids');
});

test('get_snapshot: sleeping/offline camera -> snapshot_unavailable', async () => {
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mockGo2rtc({ frameError: new Go2rtcError('bad_status', 'no frame', 500) }) });
  const res = await tools.getSnapshot('driveway');
  assert.equal(res.error, 'snapshot_unavailable');
});

test('get_snapshot: go2rtc timeout -> timeout error', async () => {
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mockGo2rtc({ frameError: new Go2rtcError('timeout', 'slow') }) });
  const res = await tools.getSnapshot('driveway');
  assert.equal(res.error, 'timeout');
});

test('no secrets (rtsp urls, passwords, hub ip) appear in list/status responses', async () => {
  const tools = buildTools({ cameras: CAMERAS, go2rtc: mockGo2rtc() });
  const blob = JSON.stringify(await tools.listCameras()) + JSON.stringify(await tools.cameraStatus('front_door'));
  for (const secret of ['rtsp://', 'password', '888888', '@192.168', ':554/']) {
    assert.ok(!blob.includes(secret), `response must not contain ${secret}`);
  }
});

test('isValidCameraId blocks injection-shaped ids', () => {
  assert.ok(isValidCameraId('front_door'));
  assert.ok(isValidCameraId('cam-1'));
  for (const id of badIds) assert.ok(!isValidCameraId(id), `should reject ${JSON.stringify(id)}`);
});

test('normalizeCameras drops entries with unsafe ids and dedupes', () => {
  const cams = normalizeCameras([
    { name: 'OK', id: 'ok_cam' },
    { name: 'Bad', id: 'rtsp://x' }, // unsafe id -> dropped
    { name: 'Dup', id: 'ok_cam' }, // duplicate id -> dropped
    { id: 'no_name' }, // missing name -> falls back to id
  ]);
  assert.deepEqual(cams, [
    { id: 'ok_cam', name: 'OK' },
    { id: 'no_name', name: 'no_name' },
  ]);
});
