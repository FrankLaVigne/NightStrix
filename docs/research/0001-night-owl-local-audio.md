# Issue #1: Night Owl local audio-output evidence review

Reviewed: 2026-10-02. Repository baseline: d9d6f69980b63eb3f58f44821b7aed83811c1c6a.

Canonical scope: [issue #1](https://github.com/FrankLaVigne/NightStrix/issues/1) and [ROADMAP](../ROADMAP.md), “Controlled audio output / TTS through camera devices”.

## Decision

**NO — NightStrix cannot presently claim a verified local, cloud-free speaker capability for its current deployment.** This is an evidence/enablement decision, not proof that the hardware cannot support it. The physical/protocol answer remains **undetermined** because the canonical sources do not identify the deployed hub model, camera models/revisions, or firmware, and contain no device-specific offline talk-back evidence.

Do not record “Night Owl audio output requires the cloud/app” as a proven fact. Public evidence includes a local backchannel report for a different, explicitly identified model. A mandatory binary hardware answer would exceed the evidence available here. Keep issue #1 open with this evidence gap; local output remains out of scope for now.

No required-authentication specification or provider transport design is supplied: the current-hardware YES prerequisite has not been met.

## What hardware is actually established?

The baseline README establishes a hub RTSP endpoint on port 554 with /chN_1.264 H.264 substreams and /chN_0.264 HEVC main streams (2560×1440), and mentions sleeping battery cameras. It does not name the deployed product or firmware. The example manifest contains logical endpoints and providers, not a hardware inventory.

Matching stream paths, a speaker specification, or a shared vendor name cannot establish equivalent firmware or talk-back behavior. In particular, a direct-camera interface on an isolated camera Wi-Fi network is not automatically exposed through the hub's LAN RTSP endpoint.

## Public technical evidence

| Source | Evidence | Relevance and limitation |
| --- | --- | --- |
| [Relkci's original WNIP2 investigation][1] | Identifies **WNIP-2LTA-BS**, describes direct-camera access after network configuration, ONVIF on 8089 and RTSP on 554, G.711 µ-law audio, and instructs Blue Iris users to enable RTSP backchannel for talk support. | Positive model-specific local-control report. Does not identify NightStrix's current devices, prove hub forwarding, specify the tested camera firmware, or provide an offline speaker packet trace. The report includes vendor-app/NVR-assisted setup; runtime independence is different from app-free provisioning. |
| [Night Owl WNIP2 camera specifications][2] | WNIP-2LTA-BS/-U have microphones, speakers and two-way audio. | Establishes physical capability for these models, not a local output API. |
| [Night Owl BWNIP2 support][3] | Battery BWNIP-2TA-BS revisions V2/V3/V4 are described as requiring a compatible Night Owl Wi-Fi NVR rather than standalone operation. | Cautions against transferring the powered WNIP-2LTA-BS report to battery cameras. NVR dependence does not prove cloud dependence. |
| [ThroughTek P2P documentation][4] | Distinguishes LAN, direct P2P and relay modes, while also describing Master UID validation and P2P-server registration/connection assistance. | TUTK can carry local traffic; “P2P” neither proves nor disproves cloud-free establishment on a particular Night Owl firmware. Local media routing alone does not prove offline bootstrapping. |
| [ThroughTek talk implementation documentation][5] | Generic SDK v3.3+ talk uses format negotiation, speaker start/stop control and avSendAudioData after a session is established. | Supports plausibility of the roadmap lead, not its attribution to current Night Owl hardware. Does not establish Night Owl's SDK version, commands, channel mapping, codec, or cloud independence. G.711 must remain unverified for the current talk path. |
| [ONVIF Streaming Specification §5.3][6] | Defines explicit RTSP backchannel negotiation and an additional SDP output track; unsupported servers return 551. | Standard-level evidence that ordinary video/audio reception does not establish output. It is not evidence of Night Owl implementation or conformance. |

The public local backchannel report is the strongest alternative lead found. It is an original investigator's report, not a vendor guarantee or a reproduced test of this deployment. No reviewed source proves either offline speaker operation or unavoidable cloud authentication for the unidentified current devices.

## Why avSendAudioData is not a solution

The function sends audio within an established AV session. Its existence does not prove how that session is discovered, authorized or created on this hardware, whether external services are required, or whether the selected camera speaker accepts the frames. Generic SDK documentation cannot fill those device-specific gaps. Preserve the roadmap's UNVERIFIED classification.

Likewise, RTSP input audio, advertised G.711 encoding, and the official app's Talk button are insufficient evidence of local output.

## Evidence needed to resolve the hardware question

This review did not contact cameras, access speakers, emit audio, change configuration, or run hardware probes. The roadmap's prohibition on speaker access/testing remains in force.

First obtain a non-secret inventory: hub model/revision/firmware and camera model/revision/firmware, including which cameras sit behind which hub. Then seek a matching vendor protocol document or an original reproducible report that identifies the exact endpoint, local session establishment, authentication dependency, speaker delivery, and behavior with WAN unavailable from a cold start.

A later separately authorized device investigation could collect sanitized capability/SDP and session evidence. A backchannel advertisement alone would still not prove audible delivery. Failure on one hub URI would reject that path, not every direct-camera or proprietary path. Keep credentials, account tokens, UIDs and network secrets out of research artifacts.

For a YES, require evidence for the actual deployed device and firmware, with no vendor cloud/app dependency during the claimed operation; only then document required authentication and the minimal provider-side transport. “Agents receive capabilities, not credentials” is a boundary requirement, not evidence that a device accepts unauthenticated control.

For a definitive hardware NO, require model-specific evidence excluding the relevant local interfaces or demonstrating an unavoidable cloud/app dependency. Absence of documentation is insufficient.

## Scope retained

No TTS, policy engine, MCP speak tool, transport adapter, manifest output capabilities, or runtime changes. No universal Night Owl claim. This document records a conservative deployment decision and the remaining factual blocker.

## Sources

All accessed 2026-10-02.

[1]: https://github.com/Relkci/NightOwl-WifiCamera-Config-wnip2
[2]: https://nightowlsp.freshdesk.com/en/support/solutions/articles/68000004512-wnip2-series-camera-specifications
[3]: https://support.nightowlsp.com/en/support/solutions/articles/68000004057-bwnip2-series-battery-camera
[4]: https://www.throughtek.cn/help-p2pConnection/
[5]: https://www.throughtek.cn/documentcenter/586.html
[6]: https://www.onvif.org/specs/stream/ONVIF-Streaming-Spec.pdf
