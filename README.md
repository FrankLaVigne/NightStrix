# NightStrix

**A private, local camera wall for Night Owl camera hubs — no cloud, no app, no account.**

NightStrix puts every camera on your Night Owl hub into a single live grid in any web
browser on your network. Video goes straight from the hub to your screen over your own
LAN. Nothing passes through Night Owl's servers, and nothing leaves your house.

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
2. **nginx** serves the NightStrix grid page and proxies go2rtc under `/go2rtc/`, so the
   browser only needs **one port: 8099**.
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
- go2rtc's built-in web UI for stream status, links and debugging

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

### 2. `web/cams.js`: what the grid shows

```js
window.CAMS = [
  { name: 'Front Door', id: 'cam1' },
  { name: 'Driveway',   id: 'cam2' },
  { name: 'Backyard',   id: 'cam3' },
];
```

- `name` is the label on the tile.
- `id` must match a stream name in `go2rtc.yaml`. The 2K button opens `<id>_hd`.
- Array order is grid order. Add or remove entries freely.

After editing either file:

```bash
docker compose restart
```

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
| `http://<ip>:8099/go2rtc/` | go2rtc's web UI: stream status, links, debugging |
| `rtsp://<ip>:8554/<stream>` | Clean RTSP re-stream of any camera, for other apps |

**Tips**
- **Wall display:** open the page in kiosk mode, e.g.
  `chrome --kiosk http://<ip>:8099/` or Firefox with `F11`.
- **Home Assistant / Frigate:** point them at `rtsp://<ip>:8554/cam1` instead of the
  hub. go2rtc shares one hub connection across every viewer, which is easier on the hub.

---

## 🔐 Security

NightStrix is built for a **trusted home network**. Please read this section.

- **Do not expose it to the internet.** Don't port-forward 8099, 8554 or 8555. go2rtc's
  API (at `/go2rtc/`) has **no login by default**: anyone who can reach it can watch
  every camera, see the configured RTSP URLs (including hub credentials), and add new
  streams, including `exec:` sources that run commands on the Docker host.
- **For remote viewing, use a VPN** such as [Tailscale](https://tailscale.com) or
  WireGuard, then open NightStrix as if you were at home.
- **Add a login (recommended).** Uncomment `username` / `password` under `api:` in
  `go2rtc.yaml` and restart. The browser will ask for them when the grid loads.
- **Set a real password on your hub.** Some hubs ship with user `admin` and a *blank*
  RTSP password, which lets anyone on your Wi-Fi view the cameras directly, with or
  without NightStrix. Change it in the hub's settings, then update `go2rtc.yaml`.
- **Consider a separate network for cameras.** A guest network or IoT VLAN keeps
  cameras and hubs away from your other devices.
- **Keep secrets out of git.** `go2rtc.yaml` and `web/cams.js` are gitignored. If you
  share a copy of the project any other way (zip, file copy), leave them out.

---

## Troubleshooting

<details>
<summary><b>A tile is black or says "loading"</b></summary>

- **Battery/solar cameras sleep.** The feed appears when the camera wakes (motion, or
  a periodic wake-up). go2rtc reconnects on its own.
- Open `http://<ip>:8099/go2rtc/` and check the stream. An error there usually means a
  wrong IP, path, or password in `go2rtc.yaml`.
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
├── docker-compose.yml     # go2rtc + nginx services
├── nginx.conf             # serves the page, proxies go2rtc at /go2rtc/
├── go2rtc.example.yaml    # template → copy to go2rtc.yaml (gitignored)
└── web/
    ├── index.html         # the camera wall (single file, no build step)
    └── cams.example.js    # template → copy to cams.js (gitignored)
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
