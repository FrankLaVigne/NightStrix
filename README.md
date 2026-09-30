<p align="center">
  <img src="docs/nightstrix-logo.png" alt="NightStrix logo" width="360">
</p>

<h1 align="center">NightStrix</h1>

**A private, local, vendor-neutral camera wall — no cloud, no app, no account.**

NightStrix puts your cameras into a single web view on your own network, streamed straight to
your screen over your LAN — nothing passes through a vendor's servers. It began with **Night
Owl** hubs (the first provider) and is evolving into a camera-platform-agnostic
visual/perception layer: cameras are modeled by **capabilities**, not by vendor, so generic
RTSP, ONVIF, or Raspberry Pi sources can slot in behind the same interface. See
[`docs/adr/0001-camera-abstraction.md`](docs/adr/0001-camera-abstraction.md) and the
[roadmap](docs/ROADMAP.md).

It's two small Docker containers and one web page. Set it up in about five minutes.

> *Strix* is the Latin genus name for wood owls: the ones that keep watch at night.

---

## Why NightStrix?

Night Owl hubs already record locally and serve standard **RTSP** video on your
network. The official way to watch them, though, is a phone app that goes through the
cloud. NightStrix uses the local stream instead:

- **🔒 Private by design.** Streams stay on your LAN. No vendor account, no cloud relay,
  no telemetry.
- **🖥️ Any screen, any browser.** A spare monitor, a wall-mounted tablet, a TV browser,
  or a laptop all work. Nothing to install on the viewing device.
- **⚡ Low latency.** Uses WebRTC where possible (sub-second delay) and falls back to MSE
  automatically.
- **🪶 Light on resources.** The grid shows each camera's low-res sub stream (640×360
  H.264, passed through without transcoding), so four live feeds barely touch the CPU.
- **🔍 Full 2K when you want it.** Click **2K** on any tile to open the full-resolution
  main stream.
- **🧩 Plays well with others.** go2rtc re-publishes every camera as clean RTSP, so
  Home Assistant, Frigate, VLC, or Blue Iris can use the same feeds without each opening
  its own connection to the hub.
- **🐳 Runs anywhere Docker runs.** Linux, Windows (Docker Desktop), macOS, a Raspberry
  Pi, or a NAS.

---

## How it works

```mermaid
flowchart LR
    subgraph Cameras
      C1[Camera 1]
      C2[Camera 2]
      C3[Camera ...]
    end
    Cameras --> HUB[Night Owl hub<br/>RTSP :554]
    HUB -->|RTSP| G[go2rtc<br/>container]
    G -->|WebRTC :8555 / MSE| N[nginx viewer<br/>:8099]
    N --> B[Your browser]
    G -->|RTSP :8554| X[Home Assistant /<br/>Frigate / VLC]
```

1. **[go2rtc](https://github.com/AlexxIT/go2rtc)** connects to the hub's RTSP streams
   on demand and turns them into formats browsers can play natively: WebRTC, or
   MSE over WebSocket.
2. **nginx** serves the NightStrix grid page and proxies **only the parts of go2rtc the page
   needs** (the player and live-stream/snapshot endpoints) under `/go2rtc/`, so the browser
   only needs **one port: 8099**. go2rtc's admin UI and API are not reachable through it.
3. **The page** (`web/index.html`) is a single, dependency-free HTML file that lays out one
   tile per camera and embeds go2rtc's player in each.

---

## Features

- Responsive grid that adapts from a phone to a 4K monitor
- Per-camera **fullscreen** (hover a tile → ⛶)
- **2K pop-out** of the full-resolution main stream (press `Esc` to close)
- Optional **HEVC → H.264** transcoding (go2rtc's bundled ffmpeg) for browsers without HEVC
- Automatic reconnect: sleeping battery cameras come back on their own
- Camera names and order set in one small config file
- go2rtc's built-in web UI for stream status and debugging (localhost only, see
  [Admin access](#admin-access-go2rtc-web-ui))

---

## Requirements

- A Night Owl hub (NVR/DVR/Wi-Fi hub) with **RTSP enabled**, reachable on your LAN
- A machine on the same network running **Docker** and **Docker Compose v2**
  (Docker Desktop on Windows/macOS is fine)
- The hub's **IP address**, **RTSP username/password**, and the RTSP port (usually `554`)

> **Compatibility:** Developed against a Night Owl hub that serves H.264 sub streams
> and HEVC main streams at `/chN_1.264` and `/chN_0.264`. Other Night Owl models may use
> different paths. See [Finding your stream paths](#finding-your-stream-paths). Because
> go2rtc speaks standard RTSP, NightStrix also works with most non-Night Owl RTSP
> cameras.

---

## Quick start

```bash
git clone https://github.com/FrankLaVigne/NightStrix.git
cd NightStrix

cp go2rtc.example.yaml go2rtc.yaml       # your hub + credentials
cp web/cams.example.js web/cams.js       # names shown in the grid

# edit both files (see Configuration below), then:
docker compose up -d
```

Open **`http://<docker-machine-ip>:8099/`** in any browser on your network. That's it.

---

## Configuration

NightStrix has two config files. Both are **gitignored**, so your IPs, passwords and
camera names never end up in a commit.

### 1. `go2rtc.yaml`: where the video comes from

Replace the placeholders:

| Placeholder | Replace with | Example |
|---|---|---|
| `HUB_IP` | Your Night Owl hub's LAN IP | `192.168.1.50` |
| `USER` / `PASSWORD` | Hub RTSP credentials | `admin` / `s3cret` |
| `HOST_LAN_IP` | LAN IP of the machine running Docker | `192.168.1.20` |

Each camera gets **two** streams: a light sub stream for the grid (`cam1`) and a full-res
main stream for the pop-out, named with an `_hd` suffix (`cam1_hd`):

```yaml
streams:
  cam1:    rtsp://admin:s3cret@192.168.1.50:554/ch0_1.264   # grid (H.264 640x360)
  cam1_hd: rtsp://admin:s3cret@192.168.1.50:554/ch0_0.264   # 2K pop-out (HEVC)
```

> **Special characters in the password?** URL-encode them in the RTSP URL
> (`@` → `%40`, `:` → `%3A`, `#` → `%23`).

**Why `HOST_LAN_IP`?** Docker's bridge network hides the host's real address from
WebRTC. Listing it under `webrtc.candidates` lets browsers connect directly for
low-latency WebRTC. If you skip it, the player falls back to MSE through port 8099: a
little more delay, but it still works.

### 2. Cameras: the manifest (`web/cameras.json`)

Cameras are described by a small **vendor-neutral manifest** — the source of truth for both the
wall and the MCP. Copy `cameras.example.json` → `web/cameras.json`:

```jsonc
{ "cameras": [
  { "id": "front_door", "display_name": "Front Door", "provider": "nightowl",
    "capabilities": ["video", "audio_input", "snapshot", "sub_stream", "high_res"],
    "streams": { "sub": "cam1", "main": "cam1_hd" }, "metadata": {} }
] }
```

- **`id`** — the logical camera consumers select (`get_snapshot("front_door")`). Opaque handle.
- **`display_name`** — the label shown in the UI.
- **`provider`** — internal adapter name; **not** exposed to the MCP / downstream agents.
- **`capabilities`** — what NightStrix can deliver, queried by *ability* not vendor (vocabulary
  in [ADR-0001](docs/adr/0001-camera-abstraction.md)).
- **`streams`** — logical role → **go2rtc stream name** from `go2rtc.yaml`. Never a URL or
  credentials. This replaces the old `<id>_hd` assumption: declare whatever streams a camera
  actually has (one, two, …).

> **Legacy:** a `web/cams.js` (`window.CAMS = [{name, id}]`) is still accepted as a fallback and
> mapped onto the model (`streams: { sub: id, main: id + "_hd" }`). Prefer `cameras.json`.

After editing config: `docker compose restart`.

### Finding your stream paths

Night Owl hubs commonly use this pattern, where `N` is the channel number starting at 0:

| Stream | Path | Typical format |
|---|---|---|
| Main (full res) | `/chN_0.264` | HEVC (H.265), 2560×1440 |
| Sub (low res)   | `/chN_1.264` | H.264, 640×360 |

To test a URL before adding it, open it in VLC (**Media → Open Network Stream**) or run:

```bash
ffprobe "rtsp://USER:PASSWORD@HUB_IP:554/ch0_1.264"
```

If your model uses different paths, the hub's manual or a tool like
[ONVIF Device Manager](https://sourceforge.net/projects/onvifdm/) can usually find them.
You can also add a stream from go2rtc's web UI and experiment there.

---

## Using it

| Where | What |
|---|---|
| `http://<ip>:8099/` | The NightStrix camera wall |
| `rtsp://<ip>:8554/<stream>` | Clean RTSP re-stream of any camera, for other apps |

**Tips**
- **Wall display:** open the page in kiosk mode, e.g.
  `chrome --kiosk http://<ip>:8099/` or Firefox with `F11`.
- **Home Assistant / Frigate:** point them at `rtsp://<ip>:8554/cam1` instead of the
  hub. go2rtc shares one hub connection across every viewer, which is easier on the hub.

### Admin access (go2rtc web UI)

The go2rtc web UI and API have **no login** and can read your RTSP credentials and create
streams, so they are deliberately **not** proxied on 8099. To use them for debugging, publish
the API on **localhost only** by adding this under the `go2rtc` service's `ports:`:

```yaml
      - "127.0.0.1:11984:1984"   # go2rtc admin UI, this machine only
```

Then `docker compose up -d` and open `http://127.0.0.1:11984/` on the Docker machine. From
another computer, tunnel over SSH instead of publishing it on the LAN:
`ssh -L 11984:127.0.0.1:11984 you@docker-host`, then open `http://127.0.0.1:11984/` locally.
Remove the line again when you're done.

---

## 🔐 Security

NightStrix is built for a **trusted home network**. Please read this section.

- **Do not expose it to the internet.** Don't port-forward 8099, 8554 or 8555.
- **Never publish go2rtc's API port (1984) on the LAN.** It has **no login by default**:
  anyone who can reach it can watch every camera, see the configured RTSP URLs (including
  hub credentials), and add new streams, including `exec:` sources that run commands on the
  Docker host. The viewer on 8099 only proxies an allowlist of player/stream endpoints and
  only accepts plain stream names, so it does not expose the API; see
  [Admin access](#admin-access-go2rtc-web-ui) for reaching it safely.
- **For remote viewing, use a VPN** such as [Tailscale](https://tailscale.com) or
  WireGuard, then open NightStrix as if you were at home.
- **Add a login (recommended).** Uncomment `username` / `password` under `api:` in
  `go2rtc.yaml` and restart. The browser will ask for them when the grid loads.
  Note: `nightstrix-mcp` does not send go2rtc credentials yet, so enabling this currently
  breaks the MCP service.
- **Set a real password on your hub.** Some hubs ship with user `admin` and a *blank*
  RTSP password, which lets anyone on your Wi-Fi view the cameras directly, with or
  without NightStrix. Change it in the hub's settings, then update `go2rtc.yaml`.
- **Consider a separate network for cameras.** A guest network or IoT VLAN keeps
  cameras and hubs away from your other devices.
- **Keep secrets out of git.** `go2rtc.yaml` and `web/cams.js` are gitignored. If you
  share a copy of the project any other way (zip, file copy), leave them out.

---

## MCP Integration

NightStrix can optionally expose a small, **read-only** [MCP](https://modelcontextprotocol.io)
(Model Context Protocol) server that lets an MCP client — for example an AI agent — safely
*see* your cameras without ever receiving the Night Owl credentials or raw RTSP URLs.

**This is entirely optional. NightStrix remains fully useful as a standalone camera wall
without it.**

### Why NightStrix exposes MCP

> **Worf** is an experimental home/security AI agent being developed as part of the
> **MAJEL** (Multi-Agent Junction & Execution Layer) multi-agent architecture. NightStrix
> provides Worf with narrowly scoped camera capabilities through MCP. **Worf and MAJEL are
> separate projects and are not required to use NightStrix.**

The design principle is **agents receive capabilities, not credentials**. NightStrix knows
*how* to reach the cameras; an agent only decides *when* and *why*, and reasons over the
*results* (e.g. a snapshot image). NightStrix is **infrastructure, not an agent** — it does
no AI reasoning and no agent-to-agent communication.

```
Night Owl Cameras
        |
        v
   Night Owl Hub
        |
        v
      go2rtc
        |
        +--------> NightStrix Web UI   (the camera wall)
        |
        v
 NightStrix MCP   (this service — read-only facade)
        |
        v
       Worf       (external agent; not in this repo)
        |
        v
      MAJEL
        |
        v
      Bailey
```

### Available tools (all read-only)

| Tool | Input | Returns |
|------|-------|---------|
| `list_cameras` | – | Known cameras: `{ id, name, available }` |
| `camera_status` | `camera_id` | `{ camera_id, available, stream_available }` |
| `get_snapshot` | `camera_id` | A current **JPEG image** (real bytes, for multimodal reasoning) |

`camera_id` is always one of the ids from `list_cameras` (which come from your existing
`web/cams.js`). Snapshots use the low-res **sub** stream. Unknown or malformed ids, RTSP
URLs, and go2rtc API paths are rejected.

### Running it

The MCP server is a small Node service (`mcp/`) that ships as the `nightstrix-mcp` container:

```bash
docker compose up -d          # starts go2rtc, the viewer, AND nightstrix-mcp
```

An MCP client connects over **Streamable HTTP** at `http://<docker-host>:8390/mcp`. The
service reaches go2rtc over the internal Docker network (`http://go2rtc:1984`); go2rtc's API
port is never published. Health check: `curl http://<docker-host>:8390/health`.

### Testing

The tool logic has unit tests that need **no cameras and no network** (they mock go2rtc):

```bash
cd mcp
npm install
npm test
```

### Security

The MCP server is a **constrained facade**, not a go2rtc proxy. It **never** exposes Night
Owl usernames/passwords, credential-bearing RTSP URLs, go2rtc configuration, or the go2rtc
admin API, and it offers **no** generic primitives (`fetch_url`, `call_go2rtc_api`,
`read_file`, `exec`, …). Every request selects a **known camera id**, which NightStrix
resolves internally.

- **Credentials never leave NightStrix.** The MCP service does not read `go2rtc.yaml`; it
  only reads `web/cams.js` (names + ids) and calls go2rtc for a snapshot/status.
- **LAN != authorization.** By default the port is open on your LAN. Do **not** expose
  `8390` (or `8554`/`8555`/`8099`) to the internet. To require a token, set
  `MCP_AUTH_TOKEN` on the `mcp` service; clients then send `Authorization: Bearer <token>`.

### Not yet implemented (future)

Historical/analytic capabilities such as `get_clip`, `get_events`, or `camera_activity`
(e.g. "did anything happen in the backyard last night?") are **not** implemented — NightStrix
currently focuses on live access and does not pretend to have recordings or event history.

---

## Troubleshooting

<details>
<summary><b>A tile is black or says "loading"</b></summary>

- **Battery/solar cameras sleep.** The feed appears when the camera wakes (motion, or
  a periodic wake-up). go2rtc reconnects on its own.
- Check the stream in go2rtc's web UI (see [Admin access](#admin-access-go2rtc-web-ui)).
  An error there usually means a wrong IP, path, or password in `go2rtc.yaml`.
- Check the logs: `docker logs nightstrix-go2rtc`.
</details>

<details>
<summary><b>The grid works but the 2K view doesn't</b></summary>

The main stream is HEVC (H.265), which only some browsers can play (Safari, and recent
Chrome/Edge on hardware with an HEVC decoder). For everything else, have go2rtc's
bundled ffmpeg transcode it to H.264 by wrapping the `_hd` source:

```yaml
cam1_hd: ffmpeg:rtsp://USER:PASSWORD@HUB_IP:554/ch0_0.264#video=h264
```

Transcoding 2K takes real CPU and a few seconds to start. On a low-power host (e.g. an
older Pi), consider `#video=h264#width=1280` or just use the grid's sub streams.
</details>

<details>
<summary><b>Video lags a second or two behind</b></summary>

The player is probably using MSE instead of WebRTC. Set `webrtc.candidates` in
`go2rtc.yaml` to the Docker machine's LAN IP, make sure port **8555 (TCP and UDP)** isn't
blocked by a firewall, and restart.
</details>

<details>
<summary><b>Windows: "ports are not available … access permissions"</b></summary>

Windows reserves some port ranges for Hyper-V/WSL. You can list them with:

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

NightStrix avoids go2rtc's default port 1984 for this reason: it's proxied
through 8099 and never published. If 8099, 8554 or 8555 lands in a reserved range on
your machine, change the left-hand (host) side of that port in `docker-compose.yml`,
e.g. `"18099:80"`.
</details>

<details>
<summary><b>Everything broke after the router rebooted</b></summary>

The hub or Docker host probably got a new IP. Give both a **DHCP reservation** on
your router, then update `go2rtc.yaml`.
</details>

---

## Updating

Image versions are pinned in `docker-compose.yml` so an upstream release can't break a
working setup. To upgrade, bump the tags and run:

```bash
git pull
docker compose pull && docker compose up -d
```

Stop everything with `docker compose down`.

---

## Project layout

```
NightStrix/
├── docker-compose.yml      # go2rtc + nginx + (optional) nightstrix-mcp services
├── nginx.conf              # serves the page, proxies an allowlist of go2rtc at /go2rtc/
├── go2rtc.example.yaml     # template → copy to go2rtc.yaml (gitignored; holds credentials)
├── cameras.example.json    # template → copy to web/cameras.json (the vendor-neutral manifest)
├── docs/
│   ├── adr/                # architecture decision records (ADR-0001: camera abstraction)
│   └── ROADMAP.md          # future capabilities / backlog (incl. audio-output/TTS)
├── web/
│   ├── index.html          # the camera wall (single file, no build step)
│   ├── cameras.json        # your cameras (gitignored) — copied from cameras.example.json
│   └── cams.example.js     # legacy camera list (fallback)
└── mcp/                    # optional read-only MCP server (see "MCP Integration")
    ├── src/                # inventory.js, go2rtc.js, tools.js, server.js
    ├── test/               # unit tests (no cameras/network needed)
    ├── Dockerfile
    └── package.json
```

---

## Contributing

Issues and pull requests are welcome, especially:

- Stream paths for **other Night Owl models** (please include the model number)
- Tested setups on NAS devices (Synology, Unraid, TrueNAS) or Raspberry Pi
- UI improvements to the camera wall

Please **never paste real IPs, passwords, or RTSP URLs with credentials** in issues. Use
placeholders.

---

## Acknowledgments

- **[go2rtc](https://github.com/AlexxIT/go2rtc)** by AlexxIT does all the streaming
  work. NightStrix is mostly a friendly setup and camera wall on top of it.
- **[nginx](https://nginx.org)** serves and proxies.

## License

[MIT](LICENSE). go2rtc (MIT) and nginx (BSD-2-Clause) are separate projects under their
own licenses. This repo only references their published Docker images.

## Disclaimer

NightStrix is an independent project. It is **not affiliated with, endorsed by, or
supported by Night Owl**. "Night Owl" is a trademark of its owner and is used here only
to describe compatible hardware. Use at your own risk, and follow local laws on video
recording and privacy.
