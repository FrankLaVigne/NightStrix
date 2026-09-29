# NightStrix roadmap / backlog

Future direction and planned capabilities. Nothing here is implemented unless it links to
shipped code. See `docs/adr/` for decisions already made.

**Status legend:** `PLANNED` · `RESEARCH REQUIRED` · `DEFERRED` (direction only).

## Guiding boundary

NightStrix is the **camera / perception (and, later, device-side audio-output) subsystem** — it
is not Worf and not MAJEL. It stays **vendor-neutral** (Night Owl is one adapter) and follows:
**agents receive capabilities, not credentials.** It reports observations and exposes narrow
capabilities; it does not encode household policy or make legal/behavioral conclusions.

## Device I/O model (input vs output)

A camera is **not** only a data producer. Model devices bidirectionally:

- **Input → NightStrix:** video, microphone (`audio_input`), snapshots, motion/hardware events.
- **Output ← NightStrix (actions):** speaker (`audio_output` / `two_way_audio`), `ptz`, other
  device-specific actions.

The camera abstraction (ADR-0001) must not assume cameras can only produce data and never
receive it. A future generalization from `camera` to a broader `media endpoint` concept may be
worth considering — **but do not refactor NightStrix into a generic media platform now**;
it remains camera/perception-focused.

---

## Controlled audio output / TTS through camera devices — `PLANNED / RESEARCH REQUIRED`

> Not implemented. Do not access, test, or assume camera speaker control yet.

**1. Desired capability.** A controlled, vendor-neutral abstraction that lets **authorized**
systems (Worf/MAJEL) deliver an audio payload to an **output-capable** camera. Conceptually:
`audio_output.send(endpoint="front_door", audio=…)` / `speak("front_door", audio)`. NightStrix
handles the device-specific transport/transcoding; the caller supplies text or audio and the
logical endpoint id.

**2. Why it exists.** Use cases: "Please leave the package by the door", "Please close the
gate", "The dogs need to remain inside the fenced area", greeting a known/unknown visitor, or
Worf speaking through a camera after an authorized event. Limited interactive communication may
follow later; **full conversational behavior is out of scope** for this item.

**3. Vendor-neutral requirements.** Must not be Night Owl-specific. Output-capable endpoints may
be generic IP cameras, ONVIF cameras, Raspberry Pi devices, doorbell cameras, or others.
Downstream must not know the vendor-specific mechanism used to emit audio.

**4. Camera capability-model implications.** Add output capabilities to the vocabulary
(ADR-0001): `audio_output`, `two_way_audio` (and `audio_input` for the mic). These are
**declared capabilities, not assumptions** — a camera without a speaker simply omits
`audio_output`, and a consumer asks "does `front_door` support `audio_output`?" rather than what
vendor/model it is. Do **not** add output capabilities to any camera in the manifest until local
control is proven for that device (see the Night Owl research item below).

**5. TTS relationship.** MAJEL may eventually generate custom TTS audio rather than use a
vendor's built-in voice. NightStrix's responsibility is primarily *"deliver this authorized
audio payload to this output-capable camera"* — i.e. transport + transcoding, not owning the TTS
model. The TTS engine likely lives elsewhere in MAJEL. **No final decision on TTS placement is
made here**; the existing architecture does not force one.

**6. Security / authorization.** Audio output is an **ACTION**, not observation, and must be
treated differently from `get_snapshot` / `list_cameras` / `camera_status`. The architecture
must allow policy to distinguish, at minimum: pre-approved vs generated vs user-approved vs
autonomous vs emergency/security messages, and single-endpoint vs multi-endpoint broadcast.
Progression to design against (do **not** build the policy engine now):
`OBSERVE → NOTIFY → RECOMMEND → SPEAK WITH APPROVAL → LIMITED AUTONOMOUS SPEECH`.

**7. Text generation ≠ broadcast authority.** An agent's ability to *generate text* must **not**
automatically grant authority to *broadcast speech* through a camera speaker. Authorization to
speak is a separate, explicit grant enforced at/above the NightStrix boundary.

**8. Night Owl local-audio research question — `RESEARCH REQUIRED`.** The current NightStrix
implementation proves **local video** access; it does **not** prove local speaker access. The
official app supporting two-way audio does **not** imply the speaker is controllable through the
local interfaces NightStrix uses today. **Open item:** *Determine whether the current Night Owl
hardware exposes local two-way-audio / audio-output that can be controlled without the Night Owl
cloud/app.* Do not assume any particular protocol works without evidence. (Prior RE notes suggest
the app's talk path uses ThroughTek TUTK `avSendAudioData` over P2P — but that is unverified for
local, credential-free control and must be treated as a research lead, not a solution.)

**9. Relationship to Worf.** Worf requests the capability (`speak(front_door, audio)`) and
receives a result (accepted/denied/delivered). Worf must **not** receive camera/RTSP credentials,
administrative or proprietary camera-API access, or unrestricted device control. NightStrix/the
provider adapter owns the privileged transport behind a narrow interface.

**10. Relationship to future MAJEL audio routing.** Longer term this may be one leaf of a broader
MAJEL `audio.speak` concept whose endpoints could include camera speakers, Reachy, TVs, smart
speakers, Raspberry Pi audio satellites, etc. **NightStrix does not implement that routing** — it
only exposes camera-device audio output where supported. MAJEL decides *where* to speak;
NightStrix only knows *how* to reach a camera speaker.

**11. Explicitly deferred implementation.** No code now: no speaker access/testing, no TTS
engine, no policy/authorization engine, no MCP `speak`/`audio_output` tool, no manifest output
capabilities on real cameras, no provider audio-output adapter. This item captures requirements
and direction only.

---

## Other deferred capabilities (direction only)

- **Perception** — `DEFERRED`: object detection (person/dog/vehicle/package), identity
  (enrolled household members, known visitors, individual dogs — with explicit uncertainty,
  never invented identity), tracking/current-state, visual events, and evidence
  (snapshots/clips/timestamps/confidence). Future read-only MCP shape might include
  `get_current_observations`, `locate_subject`, `get_recent_events`, `get_event_evidence` — **not
  to be implemented merely because they are listed.**
- **Detection-event feed** — `DEFERRED`: normalize the cameras' motion/person/vehicle detections
  into a subscribable event stream for consumers.
- **Metadata via a TUTK bridge** — `RESEARCH REQUIRED`: battery/signal/firmware for Night Owl
  ride the hub's TUTK `func` protocol (e.g. `GET_BATTERY_STATE`), which is P2P/RDT, not plain
  HTTP. A TUTK client could feed `camera_status` and enable camera auto-discovery.
- **Provider adapters / discovery** — `DEFERRED`: ONVIF discovery, Night Owl channel
  enumeration, etc. Only build an adapter framework if real providers require it.

## Explicitly out of scope (for the foreseeable future)

Kubernetes, Home Assistant, Frigate, databases, message brokers, vector databases, or other
infrastructure added speculatively. NightStrix establishes abstraction boundaries first.
