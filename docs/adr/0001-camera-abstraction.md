# ADR-0001: Vendor-neutral camera abstraction

- **Status:** Accepted
- **Date:** 2026-09-29

## Context

NightStrix began as a Night Owl-specific camera wall. The goal is a **camera-platform-agnostic**
visual (and eventually audio) perception subsystem that Worf/MAJEL consume through MCP.

The transport was already largely neutral: **go2rtc** ingests essentially any source (RTSP,
ONVIF, USB/Pi via ffmpeg, …) and re-serves normalized WebRTC/MSE/RTSP/snapshots. The coupling
was **data-shaped**, not plumbing:

- Cameras were configured by two hand-edited files (`go2rtc.yaml` streams + `web/cams.js`
  `[{name,id}]`), joined only by a naming convention.
- A hardcoded **`<id>` / `<id>_hd`** assumption (one sub + one HEVC main) leaked into the web
  UI and MCP — a Night-Owl-shaped assumption that breaks for single-stream (Pi/USB) or
  multi-profile (ONVIF/PTZ) cameras.
- There was **no capability model** — everything was assumed "video + sub + hd".

## Decision

Introduce a normalized **camera manifest** as the single source of truth for consumers.

### `cameras.json` (see `cameras.example.json`)

```jsonc
{ "cameras": [ {
  "id": "backyard",                       // logical, opaque handle consumers select
  "display_name": "Backyard",
  "provider": "nightowl",                 // INTERNAL adapter name — never exposed downstream
  "capabilities": ["video","audio_input","snapshot","sub_stream","high_res"],
  "streams": { "sub": "backyard_sub", "main": "backyard_main" },  // role -> go2rtc stream NAME
  "metadata": {}
} ] }
```

- **`streams` are logical roles → go2rtc stream *names*** (never URLs, never credentials). This
  removes the `<id>_hd` assumption: a camera declares whatever streams it has (one, two, N).
- **`capabilities` are declared, not assumed.** Consumers ask by *ability*, not by vendor.
- **`provider` is private.** It is used for adapter logic and is **not** returned by MCP.
- **Credentials remain solely in `go2rtc.yaml`** (mounted only into the go2rtc container). The
  MCP does not read `go2rtc.yaml`; it reads only the manifest (ids/names/stream handles).
- **Consumers (web UI, MCP) read the manifest** and resolve `id → go2rtc stream name`
  internally. Legacy `cams.js` is still accepted as a fallback (mapped onto the model).

### Capability vocabulary

Capabilities are directional. A camera is not assumed to only produce data.

| Direction | Capabilities |
|-----------|--------------|
| **Input → NightStrix** | `video`, `audio_input`, `snapshot`, `sub_stream`, `high_res`, `night_vision`, `motion_events` |
| **Output ← NightStrix** (actions) | `audio_output`, `two_way_audio`, `ptz` — **PLANNED / not yet delivered** |

A camera lacking a capability simply doesn't list it; consumers must not assume presence.
Output capabilities are **actions** and carry a stricter authority model than observation
(see `docs/ROADMAP.md` → *Controlled audio output / TTS*).

## Consequences

- Adding a generic RTSP / ONVIF / Raspberry Pi camera = add its stream(s) to `go2rtc.yaml`
  and a manifest entry. No plugin framework, no code change. `get_snapshot("backyard")` is
  provider-blind.
- Security is preserved/strengthened: the logical id resolves to a stream name **inside**
  NightStrix; downstream never receives URLs, credentials, `provider`, or stream names.
- Back-compatible: existing `cams.js`-only setups keep working.
- `provider` deliberately stays internal (answering "should provider be visible downstream?" —
  no).

## Ownership boundary

- **NightStrix owns:** cameras, streams, visual/audio observations, visual identity/tracking,
  visual events, evidence, and *device-side* output transport (e.g. delivering audio to a
  speaker-capable camera).
- **Worf owns:** home/security-domain reasoning and interpretation of NightStrix observations.
- **MAJEL owns:** multi-agent orchestration, policy, broader context, user interaction.

NightStrix reports observations and exposes narrow capabilities; it does not encode household
policy or make legal/behavioral conclusions.
