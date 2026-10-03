// nightstrix-mcp: a small, read-only MCP server that exposes narrowly scoped NightStrix
// camera capabilities to an MCP client (e.g. the "Worf" home/security agent).
//
// It is a CONSTRAINED FACADE over go2rtc: it never proxies arbitrary go2rtc API calls,
// never returns credentials or RTSP URLs, and only ever acts on camera ids drawn from the
// existing NightStrix inventory (web/cams.js). See README "MCP Integration".

import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { loadCameras } from './inventory.js';
import { createGo2rtcClient } from './go2rtc.js';
import { buildTools } from './tools.js';

// --- Config (all via env; no secrets, no camera credentials here) ---------------------
// The inventory comes from CONFIG_DIR/cameras.json (manifest) or CONFIG_DIR/cams.js (legacy).
const CONFIG_DIR = process.env.CONFIG_DIR || '/config';
const GO2RTC_URL = process.env.GO2RTC_URL || 'http://go2rtc:1984';
const PORT = Number(process.env.MCP_PORT || 8390);
const BIND = process.env.MCP_BIND || '0.0.0.0';
const TIMEOUT_MS = Number(process.env.GO2RTC_TIMEOUT_MS || 6000);
// Optional bearer token. Unset => open on the LAN (see README security notes). Setting it
// is the clean hook for adding real authorization without touching the tool logic.
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || '';

let cameras = [];
try {
  const loaded = loadCameras(CONFIG_DIR);
  cameras = loaded.cameras;
  console.error(`[nightstrix-mcp] loaded ${cameras.length} cameras from ${CONFIG_DIR}/${loaded.source}`);
} catch (err) {
  console.error(`[nightstrix-mcp] WARNING: could not load cameras from ${CONFIG_DIR}: ${err.message}`);
}

const go2rtc = createGo2rtcClient({ baseUrl: GO2RTC_URL, timeoutMs: TIMEOUT_MS });
const tools = buildTools({ cameras, go2rtc });

// --- MCP wiring -----------------------------------------------------------------------
// Structured results are returned both as `structuredContent` and as pretty JSON text so
// clients that don't parse structured content still get readable output.
function jsonResult(obj) {
  const isError = typeof obj === 'object' && obj !== null && 'error' in obj;
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }], structuredContent: obj, isError };
}

function makeServer() {
  const server = new McpServer({ name: 'nightstrix-mcp', version: '0.1.0' });

  server.registerTool(
    'list_cameras',
    {
      title: 'List cameras',
      description: 'List the cameras NightStrix knows about, with evidence-based status. `configured` only means the camera is set up; it does NOT mean the camera is online. `streaming_now` means video is being received right now. `last_seen` is when NightStrix last observed live video from it (null = not observed since NightStrix started). To check whether a camera is online now, call get_snapshot (this wakes battery cameras, so do not poll). No credentials or stream URLs are returned.',
      inputSchema: {},
    },
    async () => jsonResult(await tools.listCameras()),
  );

  server.registerTool(
    'camera_status',
    {
      title: 'Camera status',
      description: 'Read-only status for one camera without contacting it: `configured`, `streaming_now`, and `last_seen` (see list_cameras). `configured` does NOT mean online. Use get_snapshot to verify the camera is reachable right now.',
      inputSchema: { camera_id: z.string().describe('A known camera id from list_cameras (e.g. "front_door").') },
    },
    async ({ camera_id }) => jsonResult(await tools.cameraStatus(camera_id)),
  );

  server.registerTool(
    'get_snapshot',
    {
      title: 'Get camera snapshot',
      description: 'Capture a current still image (JPEG) from one camera, returned as real image content for multimodal reasoning. Uses the low-res sub stream. Never exposes the underlying RTSP URL.',
      inputSchema: { camera_id: z.string().describe('A known camera id from list_cameras (e.g. "front_door").') },
    },
    async ({ camera_id }) => {
      const result = await tools.getSnapshot(camera_id);
      if (result.error) return jsonResult(result);
      return {
        content: [
          { type: 'image', data: result.bytes.toString('base64'), mimeType: result.mimeType },
          { type: 'text', text: `Snapshot of "${result.camera_id}" observed at ${result.observed_at} (${result.mimeType}, ${result.bytes.length} bytes).` },
        ],
      };
    },
  );

  return server;
}

// --- HTTP (Streamable HTTP transport, stateless) --------------------------------------
const app = express();
app.use(express.json({ limit: '256kb' }));

// Optional auth hook. LAN != authorization; this makes adding a token trivial.
app.use((req, res, next) => {
  if (!AUTH_TOKEN || req.path === '/health') return next();
  const header = req.get('authorization') || '';
  if (header === `Bearer ${AUTH_TOKEN}`) return next();
  res.status(401).json({ error: 'unauthorized' });
});

app.get('/health', (_req, res) => res.json({ ok: true, cameras: cameras.length }));

app.post('/mcp', async (req, res) => {
  // Stateless: a fresh server + transport per request (no cross-request session state).
  const server = makeServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[nightstrix-mcp] request error:', err);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
  }
});

// This server is stateless; session GET/DELETE are not supported.
const methodNotAllowed = (_req, res) =>
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
app.get('/mcp', methodNotAllowed);
app.delete('/mcp', methodNotAllowed);

app.listen(PORT, BIND, () => {
  console.error(`[nightstrix-mcp] listening on http://${BIND}:${PORT}/mcp  (go2rtc: ${GO2RTC_URL}, auth: ${AUTH_TOKEN ? 'on' : 'off'})`);
});
