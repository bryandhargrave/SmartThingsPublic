# Lab.gruppen Direct Lake Messaging (DLM) and other sanctioned third-party control paths for Lake devices

**Access note for the report writer.** This environment's egress proxy blocked every host that carries the primary documents (beetech-inc.com, labgruppen.com, musictribe.com/mediadl, adamson.ai/legacy.adamson.ai/adamsonsystems.com, applicationmarket.crestron.com, manualslib/manualsdir/manualzz/manualmachine, docplayer.net, studylib.net, fast-and-wide.com, prosoundweb.com, gearspace.com, proforums.harman.com, youtube.com, facebook.com, eviaudio.fr, twaudio.de, eclipseaudio.com, soundforums.net, soft112.com, digitalstudiome.com, lightsoundjournal.com, avinteractive.com, sounddd.shop, cdn-docs.av-iq.com, and the r.jina.ai reader proxy). The web-search budget was also exhausted (200/200) part-way through. Consequently:

- **Snippet-level** facts (marked *[snippet]*) come from search-engine result excerpts of the named document. They are real text from the document but lack surrounding context; exact wording may be lightly paraphrased by the search layer.
- **Full-text** facts (marked *[full]*) come from documents that were fetched completely: the GitHub issue bitfocus/companion-module-requests#710, and the source/docs of the open-source `jvhtec/streamdeck-lake-smaart` repository (fetched raw from raw.githubusercontent.com), which contains a working DLM v3.4 client and a page of notes taken directly from the DLM v3.4 PDF.
- Nothing below was fetched from the DLM v3.4 PDF itself in full. The single most important question ("does DLM expose EQ?") is therefore answered as **unresolved but leaning "no evidence that it does"** — see Key Question 2.

---

## Key Question 1 — DLM v3.4 basics: transport, port, topology, enablement, syntax, subscription, supported devices, version history

### Takeaway
DLM is a UDP/IP protocol spoken **directly to the Lake frame** (Lake Controller does not need to be running and is not a relay); commands are null-terminated ASCII strings such as `Mod.In.Mute=A 1` carried inside a 28-byte-header binary packet, sent to device UDP port 6015 (replies to fixed local port 6004) or 6016 ("dynamic" mode, replies to the sender's ephemeral port). The device is addressed by a 64-bit hardware "frame ID" shown in Lake Controller's I/O Config page, or by broadcast. The protocol is documented in "Direct Lake Messaging v3.4" (the version current Lake Controller v8.x firmware bundles are built against); earlier public editions were v2.x (v2.1 shipped with Lake Controller 5.6, v2.8 later); the v3.0–3.3 change list could not be obtained.

### Cited Findings

**What DLM is / positioning**
- The v3.4 document's stated purpose: "Direct Lake Messaging provides an Ethernet 3rd party protocol suitable for integration with third party control and monitoring applications such as AMX, Crestron or other custom control software." *[snippet]* — [Lab.gruppen AB Direct Lake Messaging v3.4 (PDF hosted by Beetech)](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)
- The older edition (mirrored on DocPlayer under the title "Direct Lake Messaging 3rd party protocol for PLM & LM Series") says the document "provides all of the reference information required to implement a control interface for an end user's custom application." *[snippet]* — [DocPlayer mirror](https://docplayer.net/57698965-Direct-lake-messaging-3-rd-party-protocol-for-plm-tm-lm-tm-series.html)
- "The protocol allows sending high-level commands as text strings that are parsed by the receiver." *[snippet]* — [DLM v3.4 PDF](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)
- A test utility is referenced in the document: "Version 1.0.0.11 is the dlmTest application that this document applies to." *[snippet]* — [DLM v3.4 PDF](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)
- PLM+ datasheet: the "double Ethernet redundant connection enables control and monitoring via Lake Controller software or with third-party devices by means of DLM (Direct Lake Messaging) protocol." *[snippet]* — [PLM+ Technical Data Sheet (eviaudio mirror)](https://www.eviaudio.fr/wp-content/uploads/2020/04/PLM-Series-Lake-Technical-Data-Sheet.pdf)
- D Series datasheet language: "2 x EtherCon RJ45 ports that support Lake Controller, Dante controller, and DLM (3rd party protocol)." *[snippet]* — [Chuck Levin's D 20:4L listing](https://chucklevins.com/products/lab-gruppen-d-20-4l-2000-watt-lake-amplifier-with-4-flexible-output-channels)

**Transport and ports**
- The DLM document specifies: "UDP Port 6004 is the application listening port for receiving packets, and UDP Port 6015 is the device destination port for transmitting packets." *[snippet]* — [DLM v3.4 PDF](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)
- Independent field confirmation from an AMX programmer who reverse-engineered/implemented it: "The control is UDP to a given port (6015) to each amp/processor's IP … the feedback from the amps is UDP on another port, and all multicast, so feedback from all amps comes back to the same buffer." He called the protocol "pretty difficult" and needed Wireshark to get it working. *[snippet]* — [HARMAN Professional Forums (AMX) thread "Lab Gruppen/Lake processor/amp control?"](https://proforums.harman.com/amx/discussion/8715/lab-gruppen-lake-processor-amp-control)
- Notes taken from the v3.4 PDF by the author of an open-source DLM client (retrieved 2026-03-28): "Fixed response mode uses destination port `6015` and local receive port `6004`. Dynamic response mode uses destination port `6016`, and replies return to the source UDP port." *[full]* — [jvhtec/streamdeck-lake-smaart docs/lake-dlm-protocol-v3_4.md](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/docs/lake-dlm-protocol-v3_4.md)
- Same notes flag an internal inconsistency in the PDF: "Section 4.2 describes dynamic replies returning to the originating source port, while section 6.2 still says replies must be received on `6004`." *[full]* — [lake-dlm-protocol-v3_4.md](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/docs/lake-dlm-protocol-v3_4.md)
- Lake Controller itself also binds UDP 6004: a release note adds "an error message … if the UDP port 6004 is already in use by another program and the Lake Controller is unable to start." *[snippet]* — [Lake Controller v5.7 release notes (studylib mirror)](https://studylib.net/doc/18304345/lake-software-release-notes)
- Practical consequence stated by the plugin author: "If Lake Controller is running on the same computer, avoid fixed mode because Lake Controller also requires local UDP port `6004`." The plugin therefore defaults to dynamic mode (6016). *[full]* — [jvhtec README](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/README.md)
- Lake Controller 5.6 switched its own device communication "from UDP Broadcast to UDP Unicast, greatly reducing network traffic." *[snippet]* — [Fast-and-Wide, "Lake Controller v5.6 software"](https://www.fast-and-wide.com/equipment-releases/amplification/722-lake-controller-v56-software)

**Direct-to-frame vs via Lake Controller; enablement**
- Addressing is by hardware ID, not via Lake Controller: "Each processor's unique hardware ID must be determined to send Ethernet packets to specific hardware processors on the network, with these IDs utilized as Destination ID within the packet header." The ID "is presented by the Lake Controller software within the I/O Config user interface display, accessible from the Home page by navigating to Modules and selecting a module on the desired hardware processor." *[snippet]* — [DocPlayer DLM mirror](https://docplayer.net/57698965-Direct-lake-messaging-3-rd-party-protocol-for-plm-tm-lm-tm-series.html)
- "UDP communication is used to send unicast packets with specific device hardware IDs, or broadcast UDP packets to all processors." *[snippet]* — [DLM v3.4 PDF](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)
- The open-source client discovers frames by sending a heartbeat/broadcast-ID packet and parsing the frames' broadcast announcements (which carry a product code), and states "Lake Controller need not be running; the plugin communicates directly." *[full]* — [jvhtec README](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/README.md), [dlmPacket.ts](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/com.jvhtec.lake-smaart.sdPlugin/plugin/lake/dlmPacket.ts)
- The Crestron LM26 module "controls the Labgruppen LM26 via UDP" (i.e., talks to the device, not to Lake Controller). *[snippet]* — [Crestron Application Market, Lab.Gruppen LM26](https://applicationmarket.crestron.com/lab-gruppen-lm26/)
- No source found says DLM must be "enabled" in Lake Controller or on the frame front panel. (See Gaps.)

**Packet layout (from the open-source implementation that follows "Direct Lake Messaging v3.4, sections 4-6 and appendices C-E")** *[full]* — [dlmPacket.ts](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/com.jvhtec.lake-smaart.sdPlugin/plugin/lake/dlmPacket.ts) and [lake-dlm-protocol-v3_4.md](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/docs/lake-dlm-protocol-v3_4.md)
- All fields little-endian. 28-byte header: `srcIdHi`(u32) `srcIdLo`(u32) `destIdHi`(u32) `destIdLo`(u32) `srcClass`(u16) `destClass`(u16) `length`(u16, total packet bytes) `packetType`(u16) `msgId`(u32); then payload padded to a 4-byte boundary; then a 4-byte footer (checksum, or zero).
- Class IDs: host = 6, device = 5, broadcast = 0. Broadcast destination ID = `0xFFFFFFFE:0xFFFFFFFD`.
- Packet types used: `2` = Msg_Ack, `4` = Msg_BroadcastID, `5` = Msg_MultiBroadcastID, `701` = Msg_DLMMsg (the text command carrier).
- ACK result codes: `-2` ACK_SUCCESS, `-3` ACK_NOTMASTER, `-4` ACK_INVALID_PACKET, `-5` ACK_DSP_ERROR, `-6` ACK_BAD_PARAM.
- Max packet 560 bytes; broadcast-announcement payload 68 bytes; footer checksum is a 32-bit LFSR-style shift/XOR over 16-bit words (function `generateChecksum`). Appendix C example code sends ordinary DLM commands with a zero footer but a computed checksum on heartbeat packets; Appendix D/E examples are internally inconsistent about this.
- Product codes seen in broadcast announcements: `0x04` PLM 10000Q, `0x06` PLM 14000, `0x09` PLM 20000Q, `0x0A` LM 26, `0x0B` LM 26 Mesa, `0x0C` LM 44, `0x0D` LM 44 Mesa, `0x13` PLM+ 12K44, `0x14` PLM+ 20K44, `0x15` D Series 8K44, `0x16` D Series 12K44, `0x17` D Series 20K44.
- Caution: the same repo's `docs/lake-controller-api.md` describes a *different*, 12-byte header ("Version/Type 0x0100, Flags, Message ID, Payload Length") and ACK codes 0/1; that file is self-described as "Retrieved via web search on 2025-01-14" and is contradicted by the repo's own code and its later PDF-derived notes. Treat the 28-byte layout as authoritative. *[full]* — [lake-controller-api.md](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/docs/lake-controller-api.md)

**Command syntax**
- "This section describes all commands in the 3rd party control protocol, with commands separated by periods in the command tree." "Some commands have one or multiple parameters, which are described within brackets, delimited with single white spaces, with formats and ranges described in the comments field." *[snippet]* — [DLM v3.4 PDF](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)
- "Each level in the command tree separated by a '.' and all commands can be operated using one or more parameters." *[snippet]* — [DLM v3.4 PDF](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)
- Operator convention as implemented: `?` = query, `=` = set, `!` = execute; identifier(s) follow the operator and values follow a space, e.g. `Mod.In.Mute?A`, `Mod.In.Mute=A 1`, `Dev.Preset.Recall!1`. Payload is ASCII, null-terminated, padded to 4 bytes. *[full]* — [dlmCommands.ts](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/com.jvhtec.lake-smaart.sdPlugin/plugin/lake/dlmCommands.ts), [dlmPacket.ts](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/com.jvhtec.lake-smaart.sdPlugin/plugin/lake/dlmPacket.ts)
- Power-channel shorthand documented in v3.4: "if power channel 2 is routed to module A DSP channel 1, then `Mod.Out.Label?A 1` could be replaced by `Mod.Out.Label?#2`. This notation allows a user of third-party protocol (3PP) to not need to know the routing for a specific power channel … This notation works for all Mod.In and Mod.Out parameters." *[snippet]* — [DLM v3.4 PDF](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)

**Subscription / notification / metering mechanism**
- The v3.4 document has a "Meter Data" section. *[snippet]* — [DLM v3.4 PDF](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)
- Frames emit periodic broadcast/multi-broadcast announcement packets (types 4/5) that a host uses for discovery; the host also sends its own heartbeat. *[full]* — [dlmPacket.ts](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/com.jvhtec.lake-smaart.sdPlugin/plugin/lake/dlmPacket.ts)
- The AMX implementer described feedback as arriving on a separate port as multicast from all amps. *[snippet]* — [HARMAN AMX forum](https://proforums.harman.com/amx/discussion/8715/lab-gruppen-lake-processor-amp-control)
- Robustness note in Lake Controller v8 release notes: "Sending invalid third-party messages (DLM) can lead to a device reset" was listed as a fixed issue. *[snippet]* — [Lake Controller v8.0.0 Release Notes (Beetech PDF)](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf)

**Supported devices**
- Lake Controller operation manual: "The Direct Lake Messaging third party protocol (DLM) is provided for all devices except MY8-LAKE, allowing integration with external control and monitoring applications such as AMX and Crestron." *[snippet]* — [Lab.gruppen PLM 20K44 / LM / D Series manual, p.292 "External control interfaces" (manualsdir mirror)](https://www.manualsdir.com/manuals/738554/labgruppen-plm-20k44-plm-12k44-plm-20000q-plm-14000-plm-10000q-lm-44-lm-26-d-series-804l-d-series-2004l-d-series-1204l.html?page=292)
- Devices named in DLM/protocol context: PLM 12K44, PLM 20K44, D80:4L, D120:4L, D200:4L *[snippet]* — [DLM v3.4 PDF](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf); plus the product-code table above (legacy PLM, LM 26/44 incl. Mesa mode, PLM+, D Series) *[full]* — [dlmPacket.ts](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/com.jvhtec.lake-smaart.sdPlugin/plugin/lake/dlmPacket.ts)
- The v3.4 document is described in Lake Controller v8 notes as describing "Lake PLM+ functionality" via the "DLM (third party) Protocol documentation." *[snippet]* — [Lake Controller v8.0.0 Release Notes](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf)

**Version history (partial)**
- Lake Controller 3.2 era (Dolby Lake Processor, ~2005–2007): a release archive entry mentions "AMX Control" capabilities. *[snippet]* — [Dolby Live Sound Forum, "Lake Controller, Version 3.2"](http://dolby.invisionzone.com/index.php?showtopic=170)
- 2008 PLM launch: "a complete third-party control protocol will allow seamless integration into systems managed by … Crestron and AMX, with all critical status, fault, warning and network data made available." *[snippet]* — [ETNow, "Lab.gruppen Unveils PLM 14000" (Dec 2008)](https://www.etnow.com/news/2008/12/lab-gruppen-unveils-plm-14000)
- "Third-party protocol v2.1 is released as part of Lake Controller v5.6, and now supports the PLM Series and LM 26." *[snippet]* — [Fast-and-Wide](https://www.fast-and-wide.com/equipment-releases/amplification/722-lake-controller-v56-software)
- Lake Controller release-note history mentions "a new third party control protocol, DLM v2, was released, and later DLM v2.8 was released." *[snippet]* — [Lake Controller v7.0.6 release notes (Music Tribe PDF)](https://mediadl.musictribe.com/download/software/labgruppen/LakeController/Release%20Notes_v7_0_6_117.pdf) / [v7.0.7 (DocPlayer)](https://docplayer.net/amp/235894926-Lake-controller-v7-0-7-release-notes.html)
- The DocPlayer-mirrored edition is v2.8, and "this version added PLM firmware 2.74 and LM firmware 0.32 commands." *[snippet]* — [DocPlayer DLM mirror](https://docplayer.net/57698965-Direct-lake-messaging-3-rd-party-protocol-for-plm-tm-lm-tm-series.html)
- Lake Controller v7.x added: "It is now possible to use up to eight voltage/current output probes via PLM12K44, PLM20K44, D80L, D120L and D200L, with details available in the DLM (third party) Protocol documentation." *[snippet]* — [Lake Controller v7.0.6/7.0.7 release notes](https://docplayer.net/amp/235894926-Lake-controller-v7-0-7-release-notes.html)
- Lake Controller v8.0.0, v8.0.2, v8.1.2 and v8.1.6 release notes each state that the bundled firmware "is compatible with the functionality of the DLM protocol v3.4." *[snippet]* — [v8.0.0 (Beetech)](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf); [v8.1.6 (Adamson)](https://www.adamson.ai/support/downloads-directory/design-and-control/lake-controller/958-lake-controller-v8-1-6-release-notes/file)

### Inferences
- The protocol is a **device-native** API: the frame parses the text commands itself. An iPad app can therefore run without a Lake Controller PC on the network, provided it can bind a UDP socket and (for discovery) receive broadcast/multicast.
- Because Lake Controller and a fixed-mode DLM client both want local UDP 6004, an iPad app should use dynamic mode (device port 6016) — this is also what makes DLM and Lake Controller coexist, matching the DLM doc's implied design.
- v3.0–3.4 most likely track the PLM+ (2014) and D Series (2014) introductions and later firmware features (e.g., voltage/current probes, LoadPilot data), since v2.x is tied to legacy PLM/LM firmware and v3.4 is the version referenced for PLM+/D Series in v7/v8 release notes. This is an inference; no changelog text for 3.0–3.3 was found.

### Gaps
- No source states whether DLM must be enabled on the frame or in Lake Controller; the absence of any such step in the module docs and in the open-source client suggests it is always on, but this is unconfirmed.
- The v3.0/3.1/3.2/3.3 revision notes were not obtainable (the PDF is blocked; no mirror carries that text in snippets).
- Exact meter-subscription semantics (push vs poll, rate, which meters) are unknown beyond the existence of a "Meter Data" section.
- Whether ACK/response reply to the *source* port in dynamic mode is reliable on all firmware — the PDF itself is internally inconsistent (per the plugin author's notes).

---

## Key Question 2 — Full parameter coverage: does DLM expose EQ, delay, polarity, gain, mute, routing, presets, power, temperature/faults, meters?

### Takeaway
Confirmed DLM command families (from spec snippets and a working implementation): module input mute/gain (`Mod.In.Mute`, `Mod.In.Gain`), module output mute/label/channel enumeration (`Mod.Out.Mute`, `Mod.Out.Label`, `Mod.Out.Chans`), device preset recall (`Dev.Preset.Recall!`), input-router priority (`Dev.Router.ForceInputPriority`), device power/standby (`Dev.Power`, "StandbyState"), frame label, fault presence, meter data, and (v3.x) voltage/current probe data. **No source shows any EQ (PEQ/GEQ/Mesa), crossover, limiter, delay, or polarity command in DLM**; every vendor module built on DLM (Crestron, Q-SYS, Companion request, Stream Deck plugin) stops at mute/gain/router/preset/power/status/meters. EQ-over-DLM is therefore **unresolved, with all available evidence pointing to "not exposed"** — but this is an absence-of-evidence conclusion, not a documented exclusion.

### Cited Findings

**Commands positively confirmed to exist in the DLM spec text**
- `Mod.In.Mute` (input mute) — *[snippet]* [DLM v3.4 PDF](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)
- `Mod.Out.Label` with the `#<power channel>` shorthand; "This notation works for all Mod.In and Mod.Out parameters" (i.e., there is a family of per-module input and output parameters) — *[snippet]* [DLM v3.4 PDF](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)
- "StandbyState or PresetRecall" and checking "if there are any faults present in the device" — *[snippet]* [DLM v3.4 PDF](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)
- A "Meter Data" section — *[snippet]* [DLM v3.4 PDF](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)
- Voltage/current output-probe data (up to eight probes on PLM 12K44/20K44, D80L/D120L/D200L) documented in the DLM protocol — *[snippet]* [Lake Controller v7.0.7 release notes](https://docplayer.net/amp/235894926-Lake-controller-v7-0-7-release-notes.html)

**Commands used by a working open-source DLM v3.4 client (Stream Deck plugin, TypeScript)** *[full]* — [dlmCommands.ts](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/com.jvhtec.lake-smaart.sdPlugin/plugin/lake/dlmCommands.ts), [lake-debugging.md](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/docs/lake-debugging.md)
- `Mod.In.Mute?<module>` / `Mod.In.Mute=<module> <0|1>`
- `Mod.In.Gain?<module>` / `Mod.In.Gain=<module> <dB, 2 decimals>` (author comment: "Gain formatting might be specific … Assuming decimal string is accepted")
- `Mod.Out.Chans?<module>` (enumerate output channels of a module)
- `Mod.Out.Mute?<module> <channel>` / `Mod.Out.Mute=<module> <channel> <0|1>`
- `Dev.Preset.Recall!<n>`
- `Dev.Router.ForceInputPriority?<routerIndex>` / `Dev.Router.ForceInputPriority=<routerIndex> <0=auto|1..4>`
- Mock server (written to the spec by the same author) also answers `Dev.FrameLabel?`, `Dev.Power?` / `Dev.Power=0`.
- The plugin's own feature statement: gain and mute on modules/groups/routers, input-router priority forcing, preset recall — and "No direct control of delay, EQ, power, or meter readings through the interface." (This is the plugin's UI scope, not a claim about the protocol.) *[full]* — [jvhtec README](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/README.md)
- The repo's older `lake-controller-api.md` additionally lists `Mod.Out.Gain?<module>` / `Mod.Out.Gain=<module> <dB>`; that file is web-research-derived and partly contradicted by the code, so treat `Mod.Out.Gain` as plausible but unverified. *[full]* — [lake-controller-api.md](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/docs/lake-controller-api.md)
- Hardware validation status: the repo's tests run against a mock; the README refers to "hardware sessions" for the L-Acoustics side, and does not state that Lake commands were verified on real frames. *[full]* — [jvhtec README](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/README.md)

**What the vendor-built modules expose (a proxy for DLM's practical scope)**
- Beetech "Native Q-SYS plug-in for D-Series Lake and PLM+ amps" v1.0.0 (July 2019): **Monitoring** of "Frame, Load Pilot, output channels, and main power"; **Control** of "Power (On/Standby), Input Router/Mixer, and Preset Store/Recall." No EQ, delay, gain or mute control listed. *[snippet]* — [Beetech product page](https://beetech-inc.com/products/nativeq-syspluginfor-dseries/); [Educational video listing (YouTube, 4 Jul 2019)](https://www.youtube.com/watch?v=fmelnpEnY1U); [Beetech Facebook post](https://www.facebook.com/beetech.inc.japan/videos/495432511264157/)
- Crestron (2009 IPP announcement, module originally for C Series/FP+ and then PLM): "full amplifier fault reporting, muting, and soloing at the per-channel level, as well as power on/off and real time metering, of both individual channels or user-defined groups." *[snippet]* — [ProSoundWeb, "Lab.gruppen Joins Open-Platform Crestron Integrated Partner Program"](https://www.prosoundweb.com/lab-gruppen-joins-open-platform-crestron-integrated-partner-program-ipp/); [AV Interactive, 26 Nov 2009](https://www.avinteractive.com/news/pro-audio-manufacturer-lab-gruppen-joins-crestron-partner-programme-26-11-2009/)
- Crestron "Lab.Gruppen LM26 v1.0" module: "controls the Labgruppen LM26 via UDP"; "a custom control protocol developed for Lab.gruppen by Crestron." *[snippet]* — [Crestron Application Market listing](https://applicationmarket.crestron.com/lab-gruppen-lm26/); [help file (PDF, blocked)](https://applicationmarket.crestron.com/content/Help/Lab_Gruppen/labgruppen_lm26_v1_0_help.pdf)
- Bitfocus Companion request #710 (27 Jan 2022, by monikeraudio): proposed scope "Power On/Standby, Preset Recall, Module Mutes"; motivation was that the Q-SYS plugin "using the API already" has "considerable hardware costs" and Lake Controller is confusing for venue staff; status **Stale**, no module built. *[full]* — [GitHub issue #710](https://github.com/bitfocus/companion-module-requests/issues/710)
- "Lake Remote" iPad app (George Puttock of Adlib, App Store 2014, removed since): "wirelessly control and monitor up to 16 Lake enabled devices"; "Global Controls page allows for sending module parameters to all (or selected) devices in one hit"; "four new input router mute groups"; "supports LM26, LM44 and all PLM amplifiers"; "runs seamlessly with Lake Controller, enabling multiple users to concurrently control the system in real time"; last updated 27 Aug 2014. *[snippet]* — [AppAdvice listing](https://appadvice.com/app/lake-remote/896686441); Lake's official page praised it ("A very talented user George Puttock of Adlib has created a Lake iPad app") *[snippet, title only]* — [Lake Facebook post](https://www.facebook.com/lakeofficial/posts/10152159294877751/)

**Contrast: what Lake Controller (proprietary protocol) can do**
- "Lake Controller enables adjustment of all LM Series parameters, including gain, delay, limiters, EQ, crossovers and all I/O configuration and routing." *[snippet]* — [Lake LM 44 datasheet (ProSoundWeb-hosted PDF)](https://www.prosoundweb.com/images/products/113-326_prod_pdf.pdf)

**Ambiguous evidence about EQ**
- A search whose top result was the DLM v3.4 PDF returned the phrase "Output processing includes Parametric EQ, shelving and all-pass filters with features for Delay, Mute, Phase, and Gain." The search layer attributed it to "the protocol", but the same results also included an LM 44 retail description, and the phrase reads like product-datasheet copy (it mirrors Lake datasheet language). It **cannot be confirmed** as a DLM command list. *[snippet, attribution uncertain]* — [DLM v3.4 PDF](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf) vs. [ihomi LM 44 listing](https://ihomi.com/lake-lm-44-loudspeaker-management-system.html)
- Targeted searches for `Mod.Out.Gain`, `Mod.Out.Delay`, `Mod.Out.Polarity`, `Mod.Out.Phase`, `Mod.In.Delay`, and for "Direct Lake Messaging" with EQ/PEQ/Mesa/crossover/limiter terms returned no DLM hits at all (search engines index the PDF, so a hit would be expected if such tokens were prominent). — negative result across queries; no citation possible.

### Inferences
- **Coverage picture for an iPad developer (evidence-weighted):**
  - **Read+write via DLM (confirmed):** module input mute and gain; module output mute; input-router forced priority; preset recall; power/standby; labels.
  - **Read via DLM (confirmed to exist, semantics unknown):** faults, meter data, output channel enumeration, voltage/current probe data, LoadPilot/frame/output-channel monitoring (per Q-SYS plugin).
  - **Plausible but unverified:** `Mod.Out.Gain`; some form of "Preset Store" (the Q-SYS plugin advertises Preset *Store*/Recall).
  - **No evidence of exposure:** PEQ/GEQ/Mesa EQ, crossover, limiter, input/output delay, polarity, output router/mixer matrix editing (beyond input-router priority), Dante routing. These are the things every DLM-based module leaves to Lake Controller.
- The "#n" power-channel shorthand "for all Mod.In and Mod.Out parameters" implies the Mod.In/Mod.Out branches have several parameters each; mute, gain and label are the ones evidenced. Delay/polarity would naturally live there if present — but nothing shows they do.
- Because two independent commercial integrators (Crestron 2009, Beetech/Q-SYS 2019) and two independent hobbyist efforts (Companion request, Stream Deck plugin) all converged on the same coarse feature set, the sanctioned API's ceiling is most likely mute/gain/router/preset/power/monitoring. Full DSP editing remains Lake-Controller-only.

### Gaps
- **EQ/delay/polarity via DLM: unresolved.** The only way to settle it is the full v3.4 PDF command table (section "describes all commands"). Every mirror of that PDF was blocked here.
- Parameter ranges/units (gain dB range, whether 0/1 vs true/false, module naming beyond A–D) are not available.
- Whether "Preset Store" (Q-SYS plugin) maps to a DLM store command or to something else is unknown.
- Whether Lake Remote (2014) used DLM v2.x or reverse-engineered the Lake Controller protocol is unknown; its "module parameters" wording is not specific.

---

## Key Question 3 — The historical "Third-party protocol v2.1" (Lake Controller v5.6)

### Takeaway
"Third-party protocol v2.1" is simply the DLM v2.x edition that shipped with Lake Controller 5.6 (c. 2011); the only documented facts are that it added LM 26 alongside the PLM Series, and that the same release moved Lake's own device traffic from UDP broadcast to unicast. Its command list was not obtainable, but v2.8 (the DocPlayer-mirrored edition) is described as adding commands for PLM firmware 2.74 / LM firmware 0.32, implying v2.x was already a per-module parameter protocol rather than a preset-only trigger interface.

### Cited Findings
- "Third-party protocol v2.1 is released as part of Lake Controller v5.6, and now supports the PLM Series and LM 26." Same release: "switching communication protocols from UDP Broadcast to UDP Unicast, greatly reducing network traffic"; "provision of current draw and thermal dissipation data for the PLM 20000Q as well as enhanced fault and warning indications." *[snippet]* — [Fast-and-Wide, Lake Controller v5.6](https://www.fast-and-wide.com/equipment-releases/amplification/722-lake-controller-v56-software)
- Lake Controller release-note history refers to "a new third party control protocol, DLM v2" and "later DLM v2.8." *[snippet]* — [Lake Controller v7.0.6 release notes](https://mediadl.musictribe.com/download/software/labgruppen/LakeController/Release%20Notes_v7_0_6_117.pdf)
- The DocPlayer edition ("Direct Lake Messaging 3rd party protocol for PLM & LM Series") is v2.8 and "added PLM firmware 2.74 and LM firmware 0.32 commands." *[snippet]* — [DocPlayer](https://docplayer.net/57698965-Direct-lake-messaging-3-rd-party-protocol-for-plm-tm-lm-tm-series.html)
- The 2008 PLM announcement promised the protocol would make "all critical status, fault, warning and network data" available to Crestron/AMX. *[snippet]* — [ETNow, Dec 2008](https://www.etnow.com/news/2008/12/lab-gruppen-unveils-plm-14000)
- Lake Controller's manual chapter on external control: "Chapter 24, External Control Interfaces, describes the available external-control interfaces supported by the Lake Controller, including GPIO, AMX®, Crestron®" with "section 24.2 on AMX® and Crestron® Control" and "24.1 GPIO (LM Series only)." *[snippet]* — [PLM/LM/D-Series operation manual p.292 (manualsdir)](https://www.manualsdir.com/manuals/738554/labgruppen-plm-20k44-plm-12k44-plm-20000q-plm-14000-plm-10000q-lm-44-lm-26-d-series-804l-d-series-2004l-d-series-1204l.html?page=292)

### Inferences
- v2.1 (2011) → v2.8 → v3.x is one continuous protocol lineage; the "v3" jump most plausibly coincides with PLM+/D Series (2014) and the dynamic-response-port (6016) addition, since v2-era AMX code only knew port 6015 + a fixed feedback port.

### Gaps
- No text of the v2.1 command set was found; the fast-and-wide article is the only public description and it does not enumerate parameters.

---

## Key Question 4 — Existing modules and integrations (Crestron, AMX, Q-SYS, Companion, others) and what they expose

### Takeaway
Known DLM-based integrations: Crestron modules (PLM, then LM26 v1.0; UDP; mute/solo per channel, power, metering, faults); a Beetech (Japan) native Q-SYS plugin for D Series/PLM+ (power, input router/mixer, preset store/recall, monitoring of frame/LoadPilot/output channels/mains); an AMX NetLinx implementation done by an integrator (no official InConcert module found); a stale Bitfocus Companion request; a 2014 third-party iPad app ("Lake Remote", now withdrawn); and a 2025–26 open-source Stream Deck plugin (mute/gain/router priority/preset). No Node-RED, Home Assistant or Python library was found.

### Cited Findings
- **Crestron:** Lab.gruppen joined Crestron's Integrated Partner Program in Nov 2009; the module "was co-developed between Lab.gruppen and Crestron" for amplifiers and Lake products; features "full amplifier fault reporting, muting, and soloing at the per-channel level, as well as power on/off and real time metering, of both individual channels or user-defined groups." *[snippet]* — [ProSoundWeb](https://www.prosoundweb.com/lab-gruppen-joins-open-platform-crestron-integrated-partner-program-ipp/); [AV Interactive](https://www.avinteractive.com/news/pro-audio-manufacturer-lab-gruppen-joins-crestron-partner-programme-26-11-2009/); [LightSoundJournal](https://www.lightsoundjournal.com/2009/11/20/lab-gruppen-joins-the-crestron-ipp/)
- Crestron Application Market lists "Lab.Gruppen LM26" (module v1.0) that "controls the Labgruppen LM26 via UDP"; a Lab.Gruppen manufacturer page exists. *[snippet]* — [Crestron Application Market LM26](https://applicationmarket.crestron.com/lab-gruppen-lm26/); [manufacturer index](https://applicationmarket.crestron.com/lab-gruppen/); [help PDF](https://applicationmarket.crestron.com/content/Help/Lab_Gruppen/labgruppen_lm26_v1_0_help.pdf)
- **AMX:** an AMX programmer on the HARMAN forum implemented PLM/LM control in NetLinx himself (UDP to 6015 per device, multicast feedback), calling the protocol "pretty difficult"; no official AMX/InConcert Lab.gruppen Lake module was found in search results. *[snippet]* — [HARMAN AMX forum thread](https://proforums.harman.com/amx/discussion/8715/lab-gruppen-lake-processor-amp-control); [AMX InConcert partners page](https://www.amx.com/en/partners/inconcert)
- **Q-SYS:** Beetech Inc. (Tokyo; Lab.gruppen distributor) released "Native Q-SYS plug in for D-Series Lake and PLM+ amps (version 1.0.0)" in July 2019: monitors "Frame, Load Pilot, output channels, and main power"; controls "Power (On/Standby), Input Router/Mixer, and Preset Store/Recall." *[snippet]* — [Beetech product page](https://beetech-inc.com/products/nativeq-syspluginfor-dseries/); [YouTube educational video](https://www.youtube.com/watch?v=fmelnpEnY1U); [Beetech Facebook](https://www.facebook.com/beetech.inc.japan/videos/495432511264157/)
- The Companion requester referred to it as "QSys has a great plugin using the API already" but with "considerable hardware cost." *[full]* — [GitHub issue #710](https://github.com/bitfocus/companion-module-requests/issues/710)
- **Bitfocus Companion:** request #710 (Jan 2022) for PLM/D Series with scope power/standby, preset recall, module mutes; labeled Stale/Hardware; no PR. *[full]* — [GitHub issue #710](https://github.com/bitfocus/companion-module-requests/issues/710)
- **Stream Deck (open source, 2025–26):** `jvhtec/streamdeck-lake-smaart` — Lake module/group gain and mute, output mute, input-router priority (Auto/1–4, incl. "All Routers"), preset recall; direct UDP DLM on 6016/6015; Lake Controller not required; includes a mock DLM responder and self-tests. *[full]* — [GitHub repo](https://github.com/jvhtec/streamdeck-lake-smaart); [README](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/README.md)
- **iPad:** "Lake Remote" by George Puttock (Adlib), 2014: up to 16 devices, global module-parameter send, four input-router mute groups, LM26/LM44/PLM, coexisted with Lake Controller; removed from App Store. *[snippet]* — [AppAdvice](https://appadvice.com/app/lake-remote/896686441); [soft112 mirror](https://lake-remote-ios.soft112.com/)
- **GitHub code search** for "Direct Lake Messaging" returns exactly one repository (the Stream Deck plugin); searches for `"Lab.gruppen" DLM` and `Lake 6015 PLM` return nothing. *[full]* — GitHub code search via API (results: 2 files, both in [jvhtec/streamdeck-lake-smaart](https://github.com/jvhtec/streamdeck-lake-smaart))
- **Measurement-software side (not control):** Lake Controller integrates with Smaart (v9.1+) for overlaying live measurements on EQ screens — this is a Lake Controller feature, not a DLM path. *[full]* — [lake-controller-api.md](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/docs/lake-controller-api.md)

### Inferences
- Every shipped integration stays inside the same envelope (mute/gain/router/preset/power/monitoring). If DLM offered EQ or delay, at least the Q-SYS plugin (which markets itself as a full "native" integration) would be expected to expose it; it does not.
- No Node-RED / Home Assistant / Python integration exists publicly; a developer would be starting from the Stream Deck plugin's TypeScript packet layer as the only open reference code.

### Gaps
- The Crestron LM26 help file (which would list every signal/parameter) could not be read.
- Beetech's plugin page and Facebook posts (possibly listing later versions than 1.0.0) could not be read; feature list is from v1.0.0 descriptions only.
- Whether an official AMX module ever shipped is unknown (no InConcert listing surfaced; the forum evidence suggests integrators wrote their own).

---

## Key Question 5 — How to obtain the DLM document; license/NDA wording

### Takeaway
The DLM v3.4 PDF is publicly downloadable from Lab.gruppen's Japanese distributor Beetech (no login), an older v2.8 edition is mirrored on DocPlayer, and Lake Controller release notes point users to "the DLM (third party) Protocol documentation" as a separate document; no NDA, license, or confidentiality wording was found in any snippet. The official channel appears to be Lab.gruppen/Music Tribe downloads or distributor support, but that could not be verified because those sites are blocked.

### Cited Findings
- Public PDF: "Lab.gruppen AB Direct Lake™ Messaging v3.4" hosted at Beetech (Tokyo distributor), indexed by search engines and directly linkable. *[snippet]* — [DLM v3.4 PDF](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)
- Beetech also hosts Lake Controller v8 release notes and the Lake LoadLibrary 5.2 PDF, i.e., it mirrors Lab.gruppen's developer/user documentation set. *[snippet]* — [Beetech Lake Controller page](https://beetech-inc.com/products/plm-lakecontroller/); [Lake Controller v8 release notes](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf); [Lake LoadLibrary 5.2](https://beetech-inc.com/wp/wp-content/uploads/Lake-LoadLibrary-5.2.pdf)
- Older edition (v2.8) is publicly mirrored on DocPlayer as a "PDF Free Download." *[snippet]* — [DocPlayer](https://docplayer.net/57698965-Direct-lake-messaging-3-rd-party-protocol-for-plm-tm-lm-tm-series.html)
- Lake Controller release notes refer readers to "the DLM (third party) Protocol documentation" for details (implying it is a separate deliverable, not embedded in the release notes or operation manual). *[snippet]* — [Lake Controller v7.0.7 release notes](https://docplayer.net/amp/235894926-Lake-controller-v7-0-7-release-notes.html)
- The open-source plugin author lists as sources: "Lab Gruppen/Lake official documentation; DLM Protocol documentation (available from vendor); Latest operation manuals from the downloads portal" and gives labgruppen.com/downloads.html and Adamson's downloads directory as official/alternate sources. *[full]* — [lake-controller-api.md](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/docs/lake-controller-api.md)
- The Companion requester shared "documentation" via a Google Drive link (now inaccessible), suggesting users pass the PDF around freely. *[full]* — [GitHub issue #710](https://github.com/bitfocus/companion-module-requests/issues/710)
- A search for the DLM document combined with "copyright / confidential / disclaimer / all rights reserved / warranty" returned no DLM hits. — negative result; no citation possible.

### Inferences
- The document is de facto public; there is no sign of an NDA gate. Standard Lab.gruppen copyright is likely present on the title page but its wording is unknown.
- Whether the PDF is bundled inside the Lake Controller installer is not evidenced; the release notes' phrasing ("details available in the DLM … documentation") is consistent with a separate download.

### Gaps
- The PDF's front-matter legal text is unknown.
- Whether labgruppen.com or Music Tribe's download portal currently lists the DLM PDF could not be checked (blocked).

---

## Key Question 6 — Lake LoadLibrary / preset and module file formats; can third parties generate them?

### Takeaway
"Lake LoadLibrary" is Lab.gruppen's curated catalogue of loudspeaker Module files (classic crossover, linear-phase crossover and Mesa EQ module types) distributed with Lake Controller; manufacturers (e.g., TW AUDiO, Adamson, K&F) supply presets into it and remain responsible for them, and at least one third-party DSP-design tool (Eclipse Audio "Direct To Processor") advertises transferring FIR/DSP settings to Lake processors. No public specification of the binary Module/Frame-preset file format was found, and nothing indicates Lab.gruppen sanctions third-party generation of those files outside Lake Controller.

### Cited Findings
- "Lake LoadLibrary™ provides a reference for available Module file types, including traditional crossovers, linear phase crossovers, and Mesa EQ Modules." The document is titled "Lake LoadLibrary 5.2 2020-07-02 (LC v7.0.0)." *[snippet]* — [Lake LoadLibrary 5.2 PDF (Beetech)](https://beetech-inc.com/wp/wp-content/uploads/Lake-LoadLibrary-5.2.pdf)
- Lake Controller's file hierarchy: "Super Modules; Presets; Module Files; Frame Presets" (PLM operation manual section headings); Frame Presets can be recalled from the front panel with the rotary encoder + RECALL. *[snippet]* — [PLM Series Operation Manual p.26 (ManualsLib)](https://www.manualslib.com/manual/638117/Lab-Gruppen-Plm-Series.html?page=26)
- TW AUDiO's Lake preset guide: TW AUDiO "provides presets in the Lake Load Library," and "speaker presets supplied by the speaker's manufacturer are the property and responsibility of each manufacturer respectively, with Lab.gruppen accepting no liability for the content of the preset." *[snippet]* — [TW AUDiO preset implementation guide for Lake v1.3](https://twaudio.de/wp-content/-pdf_files/TW-AUDiO_preset_implementation_Lake-V1.3_EN.pdf)
- Adamson publishes its own "PLM & Lake Handbook" (v5.0, 2017) for its presets on Lake platforms. *[snippet, title]* — [Adamson PLM & Lake Handbook V5.0 (Dje-Audio mirror)](https://djeaudio.djeproduction.com/wp-content/uploads/sites/2/2017/12/Adamson_PLM__Lake_Handbook_V5.0.pdf)
- Eclipse Audio's "Direct To Processor" (DTP) is described as "transferring DSP settings to Lake loudspeaker processors" from its FIR/DSP design software. *[snippet, title/summary]* — [Eclipse Audio DTP](https://eclipseaudio.com/dtp/)
- Lake Controller markets "seamless integration with third party, real-time sound system measurement, optimization, and control software packages." *[snippet]* — [TW AUDiO Lake Controller page](https://twaudio.de/en/product/legacy-products/lake-controller-software-control-and-monitoring-of-plm-functions/)

### Inferences
- Module/preset files are authored in Lake Controller by the loudspeaker manufacturer and submitted to Lab.gruppen for inclusion in LoadLibrary; the "generation" path for third parties is Lake Controller itself (or a tool like Eclipse DTP that drives Lake Controller/processors), not a documented file spec.
- DLM's `Dev.Preset.Recall!` recalls *Frame presets already stored on the device*; loading Module files onto a frame remains a Lake Controller operation.

### Gaps
- No public documentation of the Module/Frame-preset binary format, file extensions, or a preset SDK was found.
- How Eclipse DTP actually transfers settings (via Lake Controller, via files, or via a private protocol) could not be read (site blocked).

---

## Consolidated source list (with access status)

Full-text sources (read completely):
- https://github.com/bitfocus/companion-module-requests/issues/710
- https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/docs/lake-dlm-protocol-v3_4.md
- https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/docs/lake-controller-api.md
- https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/docs/lake-debugging.md
- https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/README.md
- https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/docs/USER_MANUAL.md
- https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/com.jvhtec.lake-smaart.sdPlugin/plugin/lake/dlmPacket.ts
- https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/com.jvhtec.lake-smaart.sdPlugin/plugin/lake/dlmCommands.ts
- https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/com.jvhtec.lake-smaart.sdPlugin/plugin/lake/dlmClient.ts

Snippet-only sources (host blocked; text from search-result excerpts):
- DLM v3.4 PDF — https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf
- DLM v2.8 mirror — https://docplayer.net/57698965-Direct-lake-messaging-3-rd-party-protocol-for-plm-tm-lm-tm-series.html
- Lake Controller v8.0.0 release notes — https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf
- Lake Controller v8.1.6 release notes — https://www.adamson.ai/support/downloads-directory/design-and-control/lake-controller/958-lake-controller-v8-1-6-release-notes/file
- Lake Controller v7.0.6/7.0.7 release notes — https://mediadl.musictribe.com/download/software/labgruppen/LakeController/Release%20Notes_v7_0_6_117.pdf ; https://docplayer.net/amp/235894926-Lake-controller-v7-0-7-release-notes.html
- Lake Controller v5.7 release notes — https://studylib.net/doc/18304345/lake-software-release-notes
- Lake Controller v5.6 announcement — https://www.fast-and-wide.com/equipment-releases/amplification/722-lake-controller-v56-software
- PLM/LM/D-Series operation manual, External Control Interfaces — https://www.manualsdir.com/manuals/738554/labgruppen-plm-20k44-plm-12k44-plm-20000q-plm-14000-plm-10000q-lm-44-lm-26-d-series-804l-d-series-2004l-d-series-1204l.html?page=292
- Crestron Application Market LM26 — https://applicationmarket.crestron.com/lab-gruppen-lm26/ ; help PDF https://applicationmarket.crestron.com/content/Help/Lab_Gruppen/labgruppen_lm26_v1_0_help.pdf
- Crestron IPP news — https://www.prosoundweb.com/lab-gruppen-joins-open-platform-crestron-integrated-partner-program-ipp/ ; https://www.avinteractive.com/news/pro-audio-manufacturer-lab-gruppen-joins-crestron-partner-programme-26-11-2009/
- HARMAN AMX forum — https://proforums.harman.com/amx/discussion/8715/lab-gruppen-lake-processor-amp-control
- Beetech Q-SYS plugin — https://beetech-inc.com/products/nativeq-syspluginfor-dseries/ ; https://www.youtube.com/watch?v=fmelnpEnY1U
- Lake Remote iPad app — https://appadvice.com/app/lake-remote/896686441
- Lake LoadLibrary 5.2 — https://beetech-inc.com/wp/wp-content/uploads/Lake-LoadLibrary-5.2.pdf
- TW AUDiO Lake preset guide — https://twaudio.de/wp-content/-pdf_files/TW-AUDiO_preset_implementation_Lake-V1.3_EN.pdf
- Eclipse Audio DTP — https://eclipseaudio.com/dtp/
- ETNow PLM 14000 (2008) — https://www.etnow.com/news/2008/12/lab-gruppen-unveils-plm-14000
- Dolby Live Sound Forum, Lake Controller 3.2 — http://dolby.invisionzone.com/index.php?showtopic=170
