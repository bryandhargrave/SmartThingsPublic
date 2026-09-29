# Lake controller project: handoff

Written 2026-09-29 for a Claude Code session running on Bryan's own computer (the one with the earlier Lake research, and tomorrow the one next to the Lake device and the Lake Controller screen). Everything below is self-contained. The deeper material lives on GitHub and is listed in the last section.

Bryan is an experienced live-sound system engineer who owns Lake hardware. Talk to him as a peer. He has hands-on knowledge of Lake Controller behavior that beats any inference from documents; when he corrects something, take the correction.

## 1. What we are building

A cross-platform Lake controller that does not depend on Lab.gruppen's Windows-only Lake Controller application.

**MVP parameter scope, in build order**

1. Input and output mutes
2. Input and output level
3. Input and output delay
4. Polarity
5. EQ (module input EQ first: PEQ, GEQ, Mesa; output PEQ second)

**Bonus tier:** input router and input mixer. **Separate decision, depends on rigs:** Dante patching. **Permanently out of scope:** module loading, frame layout, output-to-amp-channel assignment, anything that changes the shape of a frame rather than a value inside it.

**Controller role:** when no Lake Controller is on the network, act as the primary controller. When a Lake Controller is present, act as a secondary and accept whatever limits that role carries. Bryan states from experience that Lake Controller implements this as: first controller to connect is primary; a second controller must be approved by the primary; the secondary has restricted functionality. The manual confirms the feature exists (sections titled Multiple Controllers, Primary and Secondary Controllers, Restricted Functionality); the approval prompt, the restricted list, promotion on primary loss and whether frames enforce it are not yet verified from documents. Tomorrow's capture includes a step to observe all of this.

**Platform decision (made 2026-09-29):** bridge-first.

- Browsers have no raw UDP, so a PWA cannot reach Lake frames directly. Bryan suspected this and it is correct.
- Therefore: one small bridge process on the LAN (Raspberry Pi, small box, or a service on the Lake Controller PC) speaks Lake UDP to the frames and WebSocket to any browser, and serves one web UI to iPad, Android, phones and laptops. One codebase, no App Store review, no Apple multicast entitlement, no "Lake" trademark in a store listing.
- Native apps stay possible later. Android can do UDP unicast, broadcast and multicast without special approval (multicast receive needs a MulticastLock). iPadOS can do unicast with only the local-network prompt; broadcast or multicast needs Apple's `com.apple.developer.networking.multicast` entitlement, and Network.framework cannot send UDP broadcast at all (use BSD sockets). Capacitor can wrap the web UI if a bridge-free app is ever wanted.
- The protocol decoding work is identical under every platform choice. Only the location of the protocol layer changes.

**Design rules agreed**

- The frame is the source of truth. Never trust a local copy of a value after a write; update the display only when the frame echoes the new state.
- Refuse to write when the app's view of frame state is stale, especially for anything routing-related. A wrong EQ is audible and reversible; a wrong route can kill a driver.
- Passive detection of a Lake Controller on the network (listen on its port for a few seconds at startup) decides primary versus secondary behavior. It is a flag, not a mode.
- Any housekeeping the frames expect from a controller (keep-alives, time sync, whatever keeps a frame showing online) is sent only when no Lake Controller is present.

## 2. What the research established

Six parallel research passes ran on 2026-09-29 from a cloud container whose network policy blocked every host carrying the Lake manuals and the protocol PDF. Most Lake-specific facts therefore rest on search-engine snippets of those documents, not full reads. The full report grades every claim as [full], [snippet] or [inference]. The first job on an unrestricted connection is to download the PDFs in section 6 and upgrade the snippet-grade facts.

### 2.1 Transport

- Lake control is UDP. Lake Controller binds UDP 6004 and cannot start if that port is taken. Frames listen on 6015 (fixed mode, replies to 6004) and 6016 (dynamic mode, replies to the sender's source port). No TCP, no encryption, no authentication mentioned anywhere.
- Controller-to-frame traffic has been unicast since Lake Controller v5.6 (2010). Discovery relies on frame-originated broadcast announcements, not mDNS.
- Frames are addressed by a fixed 64-bit hardware ID, the Frame ID shown on the front panel. Example form seen in the wild: `3d000011:d6ed9201`.

### 2.2 Direct Lake Messaging (DLM), the sanctioned third-party protocol

Current version 3.4, publicly hosted as a PDF by the distributor Beetech (URL in section 6). Spoken directly to the frame; Lake Controller is not required and is not a relay. No evidence it has to be enabled anywhere.

**Framing, from a fully read open-source implementation (jvhtec/streamdeck-lake-smaart, TypeScript, no license file, so re-implement from the spec rather than copy):**

| Offset | Size | Field | Notes |
|---|---|---|---|
| 0 | 4 | Source ID high | little-endian throughout |
| 4 | 4 | Source ID low | |
| 8 | 4 | Destination ID high | frame hardware ID |
| 12 | 4 | Destination ID low | |
| 16 | 2 | Source class | Host = 6, Device = 5, Broadcast = 0 |
| 18 | 2 | Destination class | |
| 20 | 2 | Total length | |
| 22 | 2 | Packet type | 2 = Ack, 4 = BroadcastID, 5 = MultiBroadcastID, 701 = DLM text message |
| 24 | 4 | Message ID | |
| 28 | n | Payload | DLM: null-terminated ASCII, padded to 4-byte boundary |
| end | 4 | Footer | 16-bit LFSR checksum over packet words, or zero. Command packets use zero; heartbeat discovery packets carry checksums |

Ack codes: -2 SUCCESS, -3 NOTMASTER, -4 INVALID_PACKET, -5 DSP_ERROR, -6 BAD_PARAM. The NOTMASTER code is the strongest hint that frames themselves know which host is master, which bears directly on the primary/secondary question.

Command grammar: `<Object>.<Property>.<Op><Identifier> [Value]` with `?` query, `=` set, `!` execute. Examples: `Mod.In.Mute?A`, `Mod.In.Mute=A 1`, `Mod.In.Gain=A -3.0`, `Dev.Preset.Recall!3`. Suggested timeouts 500 to 1000 ms for commands, 2 to 5 s for preset recall.

**Coverage.** Confirmed commands: `Mod.In.Mute`, `Mod.In.Gain`, `Mod.Out.Mute`, `Mod.Out.Label`, `Mod.Out.Chans`, `Dev.Preset.Recall!`, `Dev.Router.ForceInputPriority`, power and standby, frame label, fault presence, a Meter Data section, voltage and current probes. Plausible but unverified: `Mod.Out.Gain`, preset store. **No source shows any EQ, crossover, limiter, delay or polarity command**, and all four independent integrations built on DLM (Crestron 2009, Beetech Q-SYS 2019, a Bitfocus Companion request, the Stream Deck plugin) stop at the same mute/gain/router/preset/power/monitoring envelope. Treat this as strong absence of evidence; the v3.4 PDF's command table settles it. Bryan's prior experience agrees: EQ has remained unsolved.

**The central hypothesis for tomorrow:** DLM text messages are packet type 701 inside a header whose type field is a general-purpose 16-bit space. Native Lake Controller traffic on 6004 very likely shares this same 28-byte header with other type numbers. If the first captured Lake Controller datagram parses with this header, the campaign becomes enumerating packet types and value encodings instead of discovering a format.

### 2.3 Prior art

- No public dissector, pcap, library, blog post, talk or paper decodes the native Lake Controller protocol as of September 2026. Tomorrow's capture would be first.
- The only open-source Lake code is the jvhtec Stream Deck plugin (DLM client plus a mock frame, `npm run lake:mock`).
- Lab.gruppen's official iPad path has been VNC to a Windows host. A third-party "Lake Remote" iPad app (George Puttock/Adlib, about 2014, since withdrawn) controlled up to 16 devices and coexisted with Lake Controller, so a native client alongside Lake Controller has precedent.
- Dante control is a solved problem in open source: NetAudio (chris-ritsen/network-audio-controller, Python plus Rust core, Unlicense, native iOS app on TestFlight, active September 2026) and Inferno (Rust, GPL/AGPL, full Dante transport). Ports 4440/4455 routing, 8700 settings, 8800 control, mDNS `_netaudio-arc._udp`. Dante Domain Manager enrolled devices are invisible to non-members by design.

### 2.4 Multiple controllers

- Manual sections "Multiple Controllers", "Primary and Secondary Controllers", "Restricted Functionality" exist in Rev 1.5.4 and as far back as the 2005 Dolby-era v3.2 manual.
- Lake Controller v5.7 release notes: "A system with more than one secondary Lake Controller has communication problems" and "If connection to primary Controller is lost from secondary Controller, Events and Control popup values can still be edited from secondary Controller, however these changes never reach the frames and when connection is established to primary Controller again all changes done on secondary will be lost." Strong inference: secondary edits are relayed through the primary, controller to controller.
- Not verified from documents: the approval prompt on the primary, the exact restricted parameter set, promotion or timeout on primary loss, whether frames enforce a single writer. Capture step 5 in the plan targets each of these.
- Caution when reading the manual: its other "Primary/Secondary" usage refers to redundant Dante network ports, not controllers.

### 2.5 DSP parameter model (what to sweep)

Confirmed: Contour mode gives up to 2 modules per frame; LM 44 runs 2 Contour or 4 Mesa modules; D-series up to 4 modules with 12 module outputs routable to 4 amp channels; Lake Controller v8 adds XP1way to XP4way modules with FIR crossovers, Pre-Output EQ and multiband limiters. Input routers have up to 4 fail-over priorities. EQ is an overlay architecture, up to 256 EQs across overlays; Mesa filters have independently adjustable upper and lower slopes and edge frequencies; Ideal Graphic EQ uses raised-cosine bands that sum flat. Max user delay input to output is 2 s; delay units are selectable (display-only, probably). Polarity is on inputs and outputs in Designer Mode, inputs only in User Mode. Crossovers: Bessel, Butterworth, Linkwitz-Riley 6 to 48 dB/oct, plus Linear Phase. LimiterMax = MaxPeak + MaxRMS; MaxRMS attack 1 to 500 ms in 0.1 ms steps; Corner in 0.1 dB steps. A device can be in up to 28 groups; groups carry level, delay, EQ overlays and limiter offsets. PLM firmware runs on a TI C67x floating-point DSP, a hint that wire values may be IEEE 754 floats.

Unverified and to be read off the GUI end-stops tomorrow: PEQ frequency, gain and Q ranges and steps; GEQ band count and gain range; module input and output gain range (recollection: -inf or -100 to +15 dB in 0.1 dB); delay display resolution; crossover frequency range; MaxPeak attack and release; preset counts; meter units and refresh; group value ranges; and whether the wire carries per-layer group values or a controller-computed composite.

### 2.6 Legal posture (informational, not legal advice)

- Lake Controller is licensed under the Music Tribe EULA, licensor Empower Tribe HQ FZE. Verbatim restriction: "Modify, make derivative works of disassemble, decrypt, reverse compile, or reverse engineer any part of the Software". "Software" is never defined to include firmware, devices or network protocols. Governing law: "The Laws of the jurisdiction where you are a resident". No venue, arbitration or audit clause.
- US: contractual anti-reverse-engineering clauses have been enforced (Bowers v. Baystate, Davidson v. Jung). Fair use for interoperability is favorable (Sega v. Accolade, Sony v. Connectix). DMCA 1201(f) has an interoperability exemption, and an unencrypted, unauthenticated protocol is arguably not a "technological measure" at all. Trade secret law treats reverse engineering as not improper. No case found on passive-capture-only facts; that is the open contract risk.
- EU and UK: observing, studying and testing a program you are entitled to use is a statutory right that contract cannot exclude.
- Personal use on Bryan's own rigs: nominal exposure. A native app named, sold or submitted to an app store adds trademark exposure (Apple guidelines 4.1 and 5.2.1 on using "Lake" or Lab.gruppen branding) and the EULA's "commercially exploit" language. The bridge-served web UI avoids the store questions entirely.
- Precedent: Music Tribe has tolerated Mixing Station and the unofficial X32 OSC protocol for over a decade and formally authorized a community WING protocol document on its own CDN. Empower Tribe litigates over trade dress and patents (Klon v. Empower Tribe 2025, Empower Tribe v. Boss 2025), never over software interoperability as far as found. Asking Lab.gruppen for authorization may be cheaper than defending.
- Audinate EULAs forbid reverse engineering Dante; NetAudio and Inferno exist openly with no known enforcement.

## 3. Tomorrow's capture session, condensed

Full 13-step plan with rationale is in the report (section 6 below). Summary:

**Setup.** Capture on the Lake Controller PC itself with Wireshark or tshark; it is an endpoint of every unicast flow and hears every broadcast. Disable checksum offload, LSO and RSC on the capture NIC first or expect bad-checksum flags. Ring buffer:

```
tshark -i <N> -f "udp or arp" -b filesize:51200 -b files:20 -w C:\caps\lake.pcapng
```

Do not pre-filter to 6004/6015 on day one. Keep a timestamped action log written on the same PC (one line per GUI action), wait two seconds between actions, and save ring files plus log together after each block. Record Lake Controller version and Installer number, each frame's model, firmware, Frame ID, IP mode and address, and the PC's IP. Put Lake Controller in Designer Mode so output polarity is available.

**Order of blocks**

1. Idle with Lake Controller closed, 60 s: frame broadcasts, period, ports, payload size. Send one DLM heartbeat and one `Mod.In.Mute?A` in dynamic mode from a laptop to get a labeled DLM packet for header comparison.
2. Launch Lake Controller: discovery, switch to unicast, port pair, idle keepalive period; open a Levels window to separate meter streams.
3. Unplug and replug a frame; close and reopen with Recall Last System Configuration; change a front-panel value while the controller is closed to force Out of Sync and watch it resolve.
4. Second Lake Controller on a second PC: does the primary prompt, where do the secondary's datagrams go (frames or primary PC), which actions are greyed out, what happens when the primary closes. Then, with the primary online, send a DLM `Mod.In.Mute=A 1` from the laptop and look for NOTMASTER versus SUCCESS.
5. Mutes: input mute on/off, output 1 mute on/off.
6. Levels: smallest step, then +1 dB, then max and min, input then output. Test candidate 4-byte windows as little-endian float against the GUI value.
7. Polarity: input flip and restore, output 1 flip and restore.
8. Delay: 1.000 ms, 10.000 ms, 2 s ceiling; then switch display units and re-enter the same physical value to prove units are display-only. Test the 96-samples-per-ms hypothesis.
9. EQ: add PEQ filter; move frequency; gain by one step; bandwidth; toggle Q versus BW display and re-send; change type to low shelf, high shelf, Mesa; on Mesa adjust each edge and slope separately; bypass filter; bypass overlay; add a second overlay; delete a filter. GEQ: move one band, then flatten all. Output: one crossover frequency, one slope, type Bessel to Butterworth to Linkwitz-Riley. XP module: FIR crossover and a Pre-Output EQ filter.
10. Groups versus module: group gain, group delay, group EQ overlay, limiter offset, second group, remove from group. Compare with block 6 to learn per-layer versus composite.
11. Routing, limiters, frame operations: router priority Force 1 to 4 to Auto, one mixer crosspoint, output-to-amp routing, MaxRMS attack and Corner, thresholds, preset store and recall, module load (expect bulk transfer), lock, Dante input selection while also watching 4440/4455/8700/8800 and mDNS.
12. Read-back and metering: store a System file, change three parameters, recall and capture the write burst; 60 s meters with signal, 60 s without, 60 s home screen.

**Technique reminders.** Type values into fields rather than dragging faders, so each change is one packet. Change exactly one thing per step. Sweep values to expose encoding: linear steps landing on round hex mean fixed-point; chaotic hex that decodes cleanly as IEEE 754 means float; frequency sweeps of 100, 200, 400, 800, 1600 Hz separate Hz, float and log-index encodings in five samples. Change band 1 then band 2 to find the band index byte. If a single gain change produces a large packet, the whole band or structure is being sent each time, which is convenient.

**After the session.** Build a Wireshark Lua dissector incrementally from the DLM header layout, registered on the observed port, moving bytes out of an "undecoded" field as each is understood. Run CRC RevEng on message-plus-footer pairs only if native footers prove non-zero.

## 4. What the local session should do first

1. Download the documents in section 6, starting with the DLM v3.4 PDF. Read its command table and settle the EQ question. Read the Multiple Controllers and Restricted Functionality sections of the Operation Manual and record exactly what they say against Bryan's description in section 1.
2. Clone `https://github.com/jvhtec/streamdeck-lake-smaart` for the DLM codec and mock frame, and `https://github.com/chris-ritsen/network-audio-controller` for Dante reference.
3. Pull in Bryan's earlier Lake research from this computer and reconcile it with section 2. Anything he already decoded shortens the capture plan.
4. Create a dedicated repo for the project (suggested name `lake-protocol` or similar). The SmartThingsPublic fork was only a workspace of convenience and should not be the project's home.
5. Prepare before the session: the tshark command tuned to the real interface number, an action-log template (timestamp, block, step, control, old value, new value), a Python script that sends one DLM heartbeat and one `Mod.In.Mute?A` in dynamic mode for the labeled reference packet, and a Lua dissector skeleton with the 28-byte header fields already defined and everything after offset 28 as raw bytes.
6. During the session: watch the first Lake Controller datagram for the header hypothesis, then work the blocks in order, pausing to diff after each block rather than at the end.

## 5. Open questions for Bryan

- Which frames and firmware will be on the bench tomorrow? PLM, PLM+, LM, D-series? This decides whether the XP module and ISVPL steps apply.
- Is a second Windows PC with Lake Controller available for the approval-flow block? It is the single most valuable block for the controller-role design.
- Analog, AES or Dante into the frames on his rigs? This decides whether Dante patching stays in scope.
- Does his earlier research include any captures or decoded fields already? If so, which blocks can be skipped.
- Bridge hardware preference: Raspberry Pi in the amp rack, or a service on the Lake Controller PC for phase one?

## 6. Where the full material lives

Repository `bryandhargrave/SmartThingsPublic`, branch `ccr-13283768-g703f2`.

- Full report (about 7,400 words, graded evidence, 13-step plan, document list): `reports/Lake Controller protocol research.md`
- This handoff: `reports/Lake project handoff.md`
- Research notes, one per angle, each with Takeaway, Cited Findings, Inferences and Gaps:
  - `research_notes/Lake Controller protocol research/lake_network_protocol.md`
  - `research_notes/Lake Controller protocol research/direct_lake_messaging.md`
  - `research_notes/Lake Controller protocol research/prior_art_and_dante.md`
  - `research_notes/Lake Controller protocol research/legal_position.md`
  - `research_notes/Lake Controller protocol research/dsp_parameter_model.md`
  - `research_notes/Lake Controller protocol research/capture_tooling_and_ipad.md` (includes tshark, Lua dissector, pywinauto and Swift snippets)

Fetch everything with:

```
git clone -b ccr-13283768-g703f2 https://github.com/bryandhargrave/SmartThingsPublic lake-research
```

**Documents to download on an unrestricted connection (blocked from the cloud container):**

- DLM v3.4 spec: https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf
- DLM v2.8 for version comparison: https://docplayer.net/57698965-Direct-lake-messaging-3-rd-party-protocol-for-plm-tm-lm-tm-series.html
- Lake Controller Operation Manual Rev 1.6.1: https://www.eviaudio.fr/wp-content/uploads/2020/04/Lake_Controller_Operation_Manual.pdf
- Lake Controller Operation Manual Rev 1.5.4: https://www.eviaudio.fr/wp-content/uploads/2020/04/Manuel-Lake-Controller.pdf
- Lake Network Configuration Guide: https://prodgsystems.com/public/pdf/130_Network%20Guide.pdf
- Release notes v8.0.0: https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf
- Release notes v8.1.6: https://www.adamson.ai/support/downloads-directory/design-and-control/lake-controller/958-lake-controller-v8-1-6-release-notes/file
- Release notes v5.7 (multi-controller notes): https://studylib.net/doc/18304345/lake-software-release-notes
- Current installer 8.1.7 listing: https://legacy.adamson.ai/support/downloads-directory/design-and-control/lake-controller/968-lake-controller-v8-1-7
- PLM+ manual: https://www.huss-licht-ton.de/images/products_download/User_Manual_18113_1.pdf
- PLM manual: https://www.manualslib.com/manual/638117/Lab-Gruppen-Plm-Series.html
- LM Series manual: https://www.eviaudio.fr/wp-content/uploads/2020/04/LM-Series-Operation-Manual.pdf
- D Series manual: https://www.fullcompass.com/common/files/46498-LabGruppenDSeriesOperationManual.pdf
- 2005 v3.2 User Mode Manual (multi-controller history): https://manualzz.com/doc/7199931/v3.2-lake-controller-user-mode-manual
- Crestron LM26 module help (DLM feature ceiling): https://applicationmarket.crestron.com/content/Help/Lab_Gruppen/labgruppen_lm26_v1_0_help.pdf
- Live EULA as presented: https://www.labgruppen.com/en
- Dante ports for network admins v7.1: https://www.getdante.com/wp-content/uploads/2026/07/Information-for-Network-Admins-v7.1.pdf
- Apple TN3179 local network privacy: https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy
- Apple multicast entitlement request: https://developer.apple.com/contact/request/networking-multicast

## 7. Glossary for the local session

- **Frame:** a Lake device (PLM amplifier, LM processor, D-series amplifier). Holds its own state.
- **Module:** a DSP processing block inside a frame (Classic crossover module, Mesa EQ module, XP module). A frame runs one to four.
- **Overlay:** an EQ layer; module input EQ is built from PEQ, GEQ and Mesa overlays.
- **Group:** a Lake Controller construct that applies gain, delay, EQ and limiter offsets across modules on several frames.
- **Designer Mode / User Mode:** Lake Controller access levels; output polarity and structural edits need Designer Mode.
- **Out of Sync, FastSync, SlowSync:** Lake Controller's state reconciliation when a frame's state differs from the controller's System Configuration.
- **DLM:** Direct Lake Messaging, the sanctioned third-party UDP protocol.
- **Primary / secondary controller:** Lake Controller's multi-controller arrangement, section 1 and 2.4.
