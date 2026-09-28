# NightStrix — local camera wall for Night Owl camera hubs

Watch your Night Owl cameras in any browser, with **no Night Owl cloud**. Runs anywhere
Docker runs on your LAN. Uses [go2rtc](https://github.com/AlexxIT/go2rtc) to pull the
hub's local RTSP and re-serve it as browser-native WebRTC/MSE, plus a tiny nginx that
serves the grid page.

> Not affiliated with, endorsed by, or supported by Night Owl. "Night Owl" is a
> trademark of its owner and is used here only to describe compatible hardware.

## ⚠️ Security — read this first
- **LAN only. Do not port-forward 8099, 1984, 8554 or 8555 to the internet.** go2rtc's
  API/UI (port 1984) has **no login by default**: anyone who can reach it can watch
  every camera and add new streams, including `exec:` sources that run commands on the
  host. For remote access use a VPN (WireGuard, Tailscale), not port forwarding.
- To require a login, uncomment `username`/`password` under `api:` in `go2rtc.yaml`.
- **Set a password on your hub.** Many Night Owl hubs ship with user `admin` and a blank
  RTSP password, so anyone on your network can view the cameras directly.
- `go2rtc.yaml` and `web/cams.js` hold your real IPs, credentials and camera names. They
  are gitignored; keep it that way.

## What's inside
- `docker-compose.yml` — two services: `go2rtc` (streams) + `viewer` (nginx grid page)
- `go2rtc.example.yaml` — template for the camera streams (sub + HD)
- `web/index.html` — the NightStrix grid dashboard
- `web/cams.example.js` — template for the camera list shown in the grid

## Set up
```bash
cp go2rtc.example.yaml go2rtc.yaml       # fill in HUB_IP, USER, PASSWORD
cp web/cams.example.js web/cams.js       # names/ids must match go2rtc.yaml streams
docker compose up -d
```
Then open **`http://<that-machine-ip>:8099/`** in any browser on the LAN.
- The grid shows every camera (low-res sub streams — light on CPU/bandwidth).
- Click **2K** on any camera to pop out the full-resolution feed.

Stop / update:
```bash
docker compose down          # stop
# to update: bump the image tags in docker-compose.yml, then
docker compose pull && docker compose up -d
```
Image versions are pinned so an upstream release can't break things unexpectedly.

## Hub stream paths (reference)
RTSP port 554. Channel N (starting at 0):

| Stream | Path | Format |
|--------|------|--------|
| Main | `/chN_0.264` | HEVC 2560x1440 |
| Sub  | `/chN_1.264` | H264 640x360 |

Full URL form: `rtsp://USER:PASSWORD@HUB_IP:554/ch0_0.264`

## Notes / gotchas
- **go2rtc's own UI** is at `http://<machine-ip>:1984/` — handy for checking status or
  grabbing WebRTC/RTSP/HLS links. The hub also becomes available as clean RTSP at
  `rtsp://<machine-ip>:8554/cam1` for other apps (Frigate, VLC, Home Assistant).
- **Battery/solar cameras sleep.** A feed may be black until the camera wakes (motion,
  or it re-activates). go2rtc connects on demand and reconnects automatically.
- **HD (2K) is HEVC.** In Docker, go2rtc's bundled ffmpeg transcodes HEVC->H264 on the
  fly when a browser can't decode HEVC, so the 2K view works everywhere. (Running go2rtc
  as a bare binary without ffmpeg in PATH, the HD view needs a browser with an HEVC
  decoder; the grid's sub streams always work.)
- Give the hub a **DHCP reservation** on your router so its IP (and the URLs) never change.
- Moving to Home Assistant later? Point HA/Frigate straight at the hub's RTSP URLs, or at
  this go2rtc instance (`rtsp://<machine-ip>:8554/<name>`).

## Editing cameras
Change names, add/remove cameras, or tweak paths in `go2rtc.yaml` and `web/cams.js`,
then `docker compose restart`.

## License
[MIT](LICENSE). go2rtc and nginx are separate projects under their own licenses
(MIT and BSD-2-Clause); this repo only references their Docker images.
