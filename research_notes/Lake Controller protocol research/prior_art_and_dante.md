# Prior Art: Lake (Lab.gruppen / Dolby Lake) Control Protocol and Dante Network Control (as of Sept 2026)

Research method note: WebSearch (~30 queries, budget exhausted), GitHub code/repo search, and WebFetch of GitHub-hosted pages. The following domains were blocked by the egress proxy and could NOT be read directly; findings from them are based on search-result snippets only and are flagged "(snippet)": labgruppen.com, lakeprocessing.com, beetech-inc.com, prodgsystems.com, soundforums.net, forums.prosoundweb.com, gearspace.com, audinate.com, getdante.com, dev.audinate.com, audinateweb CDN, community.home-assistant.io, en.wikipedia.org, kling-freitag.com, legacy.adamson.ai, docplayer.net, technet.genesis-technologies.ch, hachyderm.io, ravepubs.com.

---

## KQ1. Lake proprietary protocol: what public reverse-engineering / open-source work exists?

### Takeaway
No public Wireshark dissector, library, or write-up that decodes the native Lake Controller <-> frame protocol was found as of Sept 2026. The one substantive public artifact is an officially documented third-party protocol, **Direct Lake Messaging (DLM) v3.4** (UDP 6015/6016 to device, 6004 reply), and exactly one open-source implementation of it: **jvhtec/streamdeck-lake-smaart** (TypeScript, active Jan-Jul 2026). Everything else is either the official Windows-only Lake Controller or VNC.

### Cited Findings

**Official third-party protocol exists: DLM (Direct Lake Messaging)**
- Lab.gruppen publishes "Direct Lake Messaging v3.4" as a "3rd party protocol" PDF; it "provides an Ethernet 3rd party protocol suitable for integration with third party control and monitoring applications such as AMX, Crestron or other custom control software" and "provides all of the reference information required to implement a control interface" — [DLM v3.4 PDF (beetech-inc mirror, blocked; snippet)](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf); an older v2.8 "Direct Lake Messaging 3rd party protocol for PLM & LM Series" is mirrored at [docplayer (unreachable from here; snippet)](https://docplayer.net/57698965-Direct-lake-messaging-3-rd-party-protocol-for-plm-tm-lm-tm-series.html)
- DLM transport per search snippet of the spec: "UDP Port 6004 is used as the application listening port for receiving packets, and UDP Port 6015 is used as the device destination port" — [search snippet of DLM PDF](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)
- "Third-party protocol v2.1 supports the PLM Series and LM 26" (Lake Controller v5.6 era) — [Fast-and-Wide, Lake Controller v5.6](https://www.fast-and-wide.com/equipment-releases/amplification/722-lake-controller-v56-software)
- LM 44 spec sheet: "control and monitoring interface via Ethernet for Lake Controller software, or DLM (the 3rd party protocol)" — [LM44 spec PDF (Thomann mirror)](https://images.thomann.de/pics/atg/atgdata/document/specs/346928.pdf); same text in [ProSoundWeb product PDF](https://www.prosoundweb.com/images/products/113-326_prod_pdf.pdf)
- PLM+ marketing: "control and monitoring of the whole platform ecosystem via Lake Controller, CAFE and Third Party Protocol integration" — [LightSoundJournal PLM+ launch](https://www.lightsoundjournal.com/2015/05/02/lab-gruppen-introduces-the-new-plm-series-of-amplifiers/); PLM: "control and monitoring via Lake Controller software or with third-party devices by means of DLM (Direct Lake Messaging) protocol" — [Polar PLM+ page](https://polar.uk.com/lab-gruppen-plm-series)

**The only open-source DLM implementation found: jvhtec/streamdeck-lake-smaart**
- Repo: Stream Deck+ plugin controlling "Lake LM modules, L-Acoustics P1/LC16D devices, and Smaart"; Lake features: "Gain/mute adjustment via encoders, input router priority selection (Auto/Priority 1-4), and preset recall"; languages TypeScript/HTML/JS; 0 stars; ~45 commits; no license file (LICENSE returns 404) — [repo](https://github.com/jvhtec/streamdeck-lake-smaart), [LICENSE 404](https://github.com/jvhtec/streamdeck-lake-smaart/blob/main/LICENSE)
- Commit history: earliest visible Jan 14 2026, latest Jul 2 2026 ("Improve Lake/LA reliability", "Hide Lake device until lake host is configured", etc.) — [commits](https://github.com/jvhtec/streamdeck-lake-smaart/commits/main)
- Its `dlmPacket.ts` implements "Direct Lake Messaging v3.4, sections 4-6 and appendices C-E"; constants: `DLM_FIXED_DEVICE_PORT = 6015`, `DLM_DYNAMIC_DEVICE_PORT = 6016`, `DLM_FIXED_RESPONSE_PORT = 6004`; 28-byte header = source ID hi/lo (4+4), destination ID hi/lo (4+4), source class (2), destination class (2), total length (2), packet type (2), message ID (4); 4-byte footer (checksum or zeros); message types `ACK = 2`, `BROADCAST_ID = 4`, `MULTI_BROADCAST_ID = 5`, `DLM = 701`; ACK codes `SUCCESS = -2`, `NOTMASTER = -3`, `INVALID_PACKET = -4`, `DSP_ERROR = -5`, `BAD_PARAM = -6`; checksum is a "16-bit linear feedback shift register calculated over packet words, or set to zero" — [dlmPacket.ts](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/com.jvhtec.lake-smaart.sdPlugin/plugin/lake/dlmPacket.ts)
- Its protocol notes: "DLM packet fields are little-endian"; "DLM text payloads are null-terminated and padded to a 4-byte boundary"; class values Host = 6, Device = 5, Broadcast = 0; "DLM command packets" use a zero footer while "heartbeat discovery packets" carry checksums; fixed mode = dest 6015 / listen 6004, dynamic mode = dest 6016 / reply to source port — [docs/lake-dlm-protocol-v3_4.md](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/docs/lake-dlm-protocol-v3_4.md)
- Its API doc: command grammar is text inside the binary payload, `<Object>.<Property>.<Operation><Identifier> [Value]` with `?` query, `=` set, `!` execute; examples `Mod.In.Mute?<module>`, `Mod.In.Mute=<module> <state>`, `Mod.In.Gain=<module> <gain_db>`, `Mod.Out.Gain=...`, `Dev.Preset.Recall!<preset>`; suggested timeouts 500-1000 ms (commands) and 2-5 s (preset recall); "Lake does not publicly advertise a standalone, modern REST API"; Lake Controller v8.1.6 referenced — [docs/lake-controller-api.md](https://github.com/jvhtec/streamdeck-lake-smaart/blob/main/docs/lake-controller-api.md)
- Discovery is manual: device is configured by "optional device IP or frame ID, for example `169.254.23.45` or `3d000011:d6ed9201`"; README warns "If Lake Controller is running on the same computer, avoid fixed mode because Lake Controller also requires local UDP port 6004"; a mock (`npm run lake:mock --router-count 16`) behaves "more like an LMX frame" — [README](https://raw.githubusercontent.com/jvhtec/streamdeck-lake-smaart/main/README.md)
- GitHub code search for the string "Direct Lake Messaging" returns exactly 2 files, both in jvhtec/streamdeck-lake-smaart — [GitHub code search result, total_count 2] (search performed 2026-09-29 via GitHub API)
- GitHub code search for `"Dev.Preset.Recall" OR "Mod.In.Mute" OR "DLM_FIXED_DEVICE_PORT"` returned 0 results (jvhtec's files are apparently not yet indexed for those strings); `"Lake Controller" wireshark OR pcap OR dissector OR "reverse engineer"` returned 0 results; `"Lake Controller" "Lab.gruppen" OR "labgruppen" udp` returned 0 results — GitHub code search, 2026-09-29
- GitHub repo search for `lab.gruppen OR labgruppen OR "lake controller" OR "dolby lake"` (394 hits) and `"lab.gruppen" OR "labgruppen" OR "lake dlm" OR "direct lake"` (149 hits) surfaced only unrelated repos (Microsoft Fabric "Direct Lake", data-lake tooling, German "Gruppen" projects); no Lake audio repo — GitHub repo search, 2026-09-29

**Bitfocus Companion**
- Request "Lab Gruppen PLM and D series amplifiers" (bitfocus/companion-module-requests #710) opened Jan 27 2022 asks for power/standby, preset recall, module mutes; notes "Q-SYS offers plugin control through the amplifier's API" but is expensive; documentation shared via Google Drive; status: still open, labeled Stale — [issue #710](https://github.com/bitfocus/companion-module-requests/issues/710)
- No Lab.gruppen/Lake module appears in any search of Companion connections; a Facebook Companion-group post asks whether a module exists for the Lab.gruppen IPX 1200 — [Facebook group post (snippet)](https://www.facebook.com/groups/companion/posts/3676170692601254/)

**Official Lake Controller facts relevant to protocol work**
- Lake Controller "operates on any Microsoft Windows PC with a standard Ethernet network", supports PLM, PLM+, D Series, LM Series and MY8-LAKE, "optimized for a wireless touch-screen or Tablet PC" — [TW Audio product page](https://twaudio.de/en/product/legacy-products/lake-controller-software-control-and-monitoring-of-plm-functions/)
- Current version listed by dealers: "recommended version is 8.1.7", release notes at lakeprocessing.com/downloads.html — [Adamson legacy download page (snippet)](https://legacy.adamson.ai/support/downloads-directory/design-and-control/lake-controller); Lake Controller 8.0 release announced by [Kling & Freitag (blocked; snippet)](https://www.kling-freitag.com/lake-controller-8-0-has-just-been-released/); v8.0.0 release notes PDF hosted at [beetech-inc (blocked)](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf)
- Operation manuals (Rev 1.5.4 / 1.6.1) hosted at [eviaudio.fr (blocked)](https://www.eviaudio.fr/wp-content/uploads/2020/04/Lake_Controller_Operation_Manual.pdf) and [prodgsystems (blocked)](https://prodgsystems.com/public/pdf/129_Lake%20Controller%20Operation%20Manual.pdf)

### Inferences
- The developer's cheapest path to a working iPad Lake controller for mute/gain/preset/router functions is to implement DLM v3.4 (documented, UDP, text-in-binary, little-endian, 28-byte header) rather than reverse-engineer the native Lake Controller protocol. jvhtec's `dlmPacket.ts` is a ready reference (though unlicensed - treat as "all rights reserved" and re-implement from the spec rather than copy).
- DLM's `ACK_NOTMASTER` code and Lake Controller's exclusive use of UDP 6004 indicate the frame distinguishes a controlling "master" host; a third-party app should use dynamic mode (6016) to coexist with a running Lake Controller.
- Native Lake Controller functions that DLM may not expose (full EQ/crossover editing, module file load, Dante routing UI, meters) would still require capturing Lake Controller traffic - a task for which zero public prior art exists.
- The frame-ID form `3d000011:d6ed9201` used by jvhtec suggests DLM addressing works on frame IDs and that discovery relies on the frame's heartbeat/broadcast packets (types 4/5) rather than mDNS.

### Gaps
- Could not read the DLM v3.4 PDF itself (beetech-inc blocked; docplayer DNS failure): the complete command list, value ranges, byte offsets, supported model list (PLM/PLM+/LM/D-series/Dolby Lake Processor), and firmware minimums are unverified here. The developer should download the PDF directly from beetech-inc.com or lakeprocessing.com.
- Whether DLM is supported on the discontinued Dolby Lake Processor, Lake Mesa/Contour, or the D-series/IPX ranges was not confirmed by any reachable source.
- No public capture/pcap of native Lake Controller <-> frame traffic, no Wireshark dissector (Lua or C), no PyPI/npm/C# Lake library, no conference talk, and no academic paper on the Lake protocol were found. "No public Lake protocol dissector found as of Sept 2026" is the finding.
- The Q-SYS plugin for Lab.gruppen (mentioned in Companion issue #710) could not be located on GitHub (q-sys-community, qsys-plugins, locimation orgs contain no Lab.gruppen plugin in search results); it is likely distributed via Q-SYS Designer Asset Manager and closed-source.

---

## KQ2. Third-party / unofficial Lake controller apps, tablets, remote desktop, and OSC/StreamDeck integrations

### Takeaway
No unofficial native Lake controller app (iOS/Android/web) was found. Lake's officially sanctioned iPad path has been VNC to a Windows host since ~2010-2012, plus an official but apparently defunct "Lake Remote" iPad app; the touring norm is a Windows tablet (Surface) running Lake Controller. The only OSC/StreamDeck-type integration is jvhtec's 2026 Stream Deck plugin via DLM.

### Cited Findings
- Lake's own iPad approach: "Lake Controller on iPad utilizes VNC ... The full Lake Controller software application is designed to run only on a Windows OS, so Lake developed a solution allowing remote access of Lake Controller using iPad, retaining full functionality of all touchscreen controllable features" — [SoundForums news post (blocked; snippet)](https://soundforums.net/news/lake-controller-on-the-ipad-190578/); Lake's guide "Lake Controller on the iPad" PDF is mirrored at [prodgsystems (blocked)](https://prodgsystems.com/public/pdf/128_Lake%20Controller%20on%20the%20iPad.pdf); Lab.gruppen "tested various VNC remote desktop solutions" (snippet from the same PDF family)
- Official "Lake Remote" iPad app: "Lake Remote allows you to wirelessly control and monitor up to 16 Lake enabled devices with your iPad ... runs seamlessly with Lake Controller, enabling multiple users to concurrently control the system in real time" — [Lake Remote listing on soft112 (third-party app-store mirror)](https://lake-remote-ios.soft112.com/download.html)
- ProSoundWeb LAB thread "Lake - Remote / Ipad Software - Any tried this?" exists (content blocked) — [thread 154203](https://forums.prosoundweb.com/index.php?topic=154203.0); LAB thread "Surface Pro / Lake control software" exists (content blocked) — [thread 176764](https://forums.prosoundweb.com/index.php?topic=176764.0)
- Lab.gruppen's later amplifier lines got native apps instead of Lake: "IntelliDrive Controller is available on PC, Mac and dedicated iPad app" (IPD series) — [Fast-and-Wide](https://www.fast-and-wide.com/equipment-releases/mobile-applications/5654-labgruppen-intellidrive-controller); a Music Tribe community thread reports the "IPX Controller app labgruppen missing from the Apple iPad App Store" — [Music Tribe community (snippet)](https://community.musictribe.com/discussion/products/24/36/325921/ipx-controller-app--labgruppen-missing-from-the-apple-ipad-app-store.)
- Stream Deck: jvhtec/streamdeck-lake-smaart (see KQ1) controls Lake LM module gain/mute, input-router priority and preset recall from Stream Deck+ keys/dials via DLM — [repo](https://github.com/jvhtec/streamdeck-lake-smaart)
- Searches for "Lake Controller" with TouchOSC / OSC / Companion returned only generic OSC tooling and no Lake-specific project — WebSearch, 2026-09-29

### Inferences
- The absence of any hobbyist Lake app over ~15 years, despite a documented third-party protocol, suggests the market is small and mostly served by VNC + Windows tablets; an iPad DLM client would be novel.
- The "Lake Remote" app's design (co-exists with Lake Controller, multi-user) implies the official multi-controller sync model relies on Lake Controller as a hub; a DLM-based app talks to frames directly and will not see Lake Controller-side state such as groups or the system-solo bus unless those are exposed by DLM.

### Gaps
- Lake Remote's release date, feature set, and whether it is still on the App Store could not be confirmed (Apple App Store not searched; soft112 listing is a mirror of unknown date).
- Real-world Surface/VNC experiences in the ProSoundWeb and Reddit threads could not be read (blocked); Reddit searches returned nothing Lake-specific.

---

## KQ3. Dante control: state of reverse-engineered control as of 2026

### Takeaway
Reverse-engineered Dante control is mature and actively maintained: **NetAudio (chris-ritsen/network-audio-controller)** — Python + Rust core, Unlicense, native iOS/iPadOS app on TestFlight, DDM support, issues filed as recently as Sept 27 2026 — covers discovery, routing, names, sample rate, encoding, latency, gain, metering. **Inferno** (Rust, GPL/AGPL) implements the audio transport itself. Ports and packet header are well documented in NetAudio's wiki.

### Cited Findings

**NetAudio / network-audio-controller (chris-ritsen)**
- "Unofficial Dante Controller alternative for iOS/iPadOS, Linux, macOS, Windows, and the web. Discover, route, configure, meter, and monitor Dante audio devices with a native iPhone/iPad app, CLI, browser interface, daemon, and API"; "A shared Rust protocol core implements Dante packet encoding and parsing for the Python application and native iOS client"; license Unlicense; 360 commits; 23 open issues; iOS app "available now for iPhone and iPad through TestFlight" (not App Store); "supports Dante Domain Manager (DDM) networks and connections to a NetAudio daemon"; disclaimer "independent interoperability project and is not affiliated with or endorsed by Audinate" — [repo](https://github.com/chris-ritsen/network-audio-controller)
- Origin: "created by analyzing network requests and preset files made by Dante Controller, and parsing the binary data from the network requests and their responses" — [repo README (snippet)](https://github.com/chris-ritsen/network-audio-controller)
- Package: `pip install netaudio` (netaudio-lib merged into netaudio) — [pyproject.toml](https://github.com/chris-ritsen/network-audio-controller/blob/master/pyproject.toml); PyPI page — [netaudio on PyPI](https://pypi.org/project/netaudio/0.3.0/)
- Releases: 0.3.4 (Sep 9 2024) added "DDM management features: device latency, encoding, analog gain configuration", Brooklyn 3 DHCP/static/network-mode, "Active and pending AES67 modes display"; 0.3.7 (Sep 11 2024) improved malformed receiver-inventory handling; 0.3.14 (Sep 16 2024) fixed AVIO device-info parsing — [releases](https://github.com/chris-ritsen/network-audio-controller/releases), [v0.3.14](https://github.com/chris-ritsen/network-audio-controller/releases/tag/v0.3.14)
- Wiki "Technical details": mDNS service types `_netaudio-cmc._udp`, `_netaudio-dbc._udp`, `_netaudio-arc._udp` (routing), `_netaudio-chan._udp` (channels); ports 4440/4455 (and 24440/24455) audio control/routing, 8800 control & monitoring, 8700 device settings (sample rate, encoding, level); packet: byte 0 fixed `0x27`, sequence ID, 16-bit BE length, incrementing request ID, command ID, args after `0000` separator; operations: device name (cmd 0x1001, up to 31 chars), channel names, sample rate 44.1-192k, gain, latency (cmd 0x1101), encoding, add/remove subscriptions, tx enumeration, reboot, up to 128 rx/tx channels; caveat "not all commands or arguments have been explored yet" — [wiki](https://github.com/chris-ritsen/network-audio-controller/wiki/Technical-details)
- Recent implementation notes describe "Dante's 10-byte DGCP header format" and string-pool serializers replacing fixed byte offsets — [search snippet of repo](https://github.com/chris-ritsen/network-audio-controller)
- Open issues show what currently breaks: #63 "RTP-streams from no-dante-devices do not appear" (Sep 27 2026); #55 "parse_receiver_flow_page rejects Biamp Tesira and Shure MXWANI4 records" (Sep 3 2026); #52 "Page parsers reject 0x8112 (MORE_PAGES)" (Aug 29 2026); #53 Biamp Tesira channel-count errors; #28 domain login request (Dec 21 2024); #59 "malformed response" on rx inventory; #60 "Failed to derive host MAC address" — [issues](https://github.com/chris-ritsen/network-audio-controller/issues?q=DDM+OR+domain+OR+firmware+OR+AES67), [#59](https://github.com/chris-ritsen/network-audio-controller/issues/59), [#60](https://github.com/chris-ritsen/network-audio-controller/issues/60), [#63](https://github.com/chris-ritsen/network-audio-controller/issues/63)
- Fork exists: JohnnySepp/network-audio-controller (same description) — [fork](https://github.com/JohnnySepp/network-audio-controller)

**Inferno (teodly / LUMIFAZA)**
- "unofficial implementation of Dante protocol (Audio over IP)" for Linux; Rust; dual GPLv3-or-later / AGPLv3-or-later; "highly experimental" but "used in production"; functions as Dante receiver and transmitter; "works with most features of Dante Controller", "ability to change settings in Dante Controller" listed as future work; uses UDP 4455, 8700, 4400, 8800 and 5353; disclaimer: "Please do not use this project to make counterfeit Dante devices/software, it is both immoral and illegal ... Dante uses technology patented by Audinate" — [GitHub mirror](https://github.com/teodly/inferno/)
- Canonical repo on GitLab: created Apr 7 2023, 126 commits, 13 branches, 11 tags — [gitlab.com/lumifaza/inferno](https://gitlab.com/lumifaza/inferno); author's 2025 milestone post cites NTP-safe operation and sample-perfect automated tests — [hachyderm post (blocked; snippet)](https://hachyderm.io/@teodly/114955190943198791)

**Other tools**
- Bencosterton/dante-network-control: Python CLI, Unlicense, 131 commits; `device list`, `channel list`, `subscription list/add/remove` with filters (appears derived from netaudio CLI syntax, e.g. `netaudio subscription list --rx-device-name='A32'`) — [repo](https://github.com/Bencosterton/dante-network-control)
- jsharkey/wycliffe `protonotes`: independent early notes on Dante: port 4440 ARC, 4455 channel services, 8800 CMC handshake, 8700 status, 8702 feedback, 1029/8751 RMS metering; header `ff ff` + counter + device MAC; mDNS `_netaudio-arc._udp.local`, `_netaudio-cmc._udp.local`, `_netaudio-chan._udp.local` — [protonotes](https://raw.githubusercontent.com/jsharkey/wycliffe/master/protonotes)
- Gearspace thread "Dante routing without Dante Controller is possible": on (un)subscribe the receiver multicasts to 224.0.0.231 from port 8700 to 8702; Dante Controller sends UDP to port 4440 to query subscriptions; hex examples posted — [Gearspace thread (blocked; snippet)](https://gearspace.com/threads/dante-routing-without-dante-controller-is-possible.1221989/)
- Bitfocus Companion: official `bitfocus/companion-module-audinate-dante` "enables the ability to set Dante subscriptions using a managed Dante domain" via the "Dante Domain Manager GraphQL API" (MIT, 109 commits) - i.e. DDM required, not raw protocol — [module](https://github.com/bitfocus/companion-module-audinate-dante); fork mbsound/companion-module-audinate-dantecontroller adds matrix selections — [fork](https://github.com/mbsound/companion-module-audinate-dantecontroller)
- Home Assistant: only community requests, no integration: "Has anyone looked into coding an Integration with Dante Audio?" and "WTH Audinate Dante integration in HA" — [HA thread 1](https://community.home-assistant.io/t/has-anyone-looked-into-coding-an-integration-with-dante-audio/144772), [WTH thread](https://community.home-assistant.io/t/wth-audinate-dante-integration-in-ha/804928) (both blocked; snippets)
- Dante Controller on Linux via Wine is discussed (evidence of demand for alternatives) — [WineHQ forum](https://forum.winehq.org/viewtopic.php?t=34939)

**Official port documentation**
- Audinate "Dante Information for Network Administrators": UDP 4440, 4444, 4455 "Audio Control (Unicast)"; 8700-8708 "Multicast Control and Monitoring"; 8700-8706 and 8800 "Dante Control and Monitoring" — [v5, May 2025 (blocked; snippet)](https://www.getdante.com/wp-content/uploads/2025/05/Information-for-Network-Admins-v5.pdf), [v7.1, July 2026 (blocked)](https://www.getdante.com/wp-content/uploads/2026/07/Information-for-Network-Admins-v7.1.pdf); Shure device port lists corroborate Dante ports — [Shure common IP ports](https://content-files.shure.com/FileRepository/common-ip-ports-v2.pdf)

**What breaks: DDM, firmware, AES67**
- DDM: "When a device is enrolled in a domain, it can be viewed and configured in Dante Controller only by DDM users that are members of the domain ... an unidentified network user ... is not able to view or control any Dante devices" — [DDM user guide (blocked; snippet)](https://dev.audinate.com/GA/ddm/userguide/webhelp/content/enrolling_devices_in_domains.htm); NetAudio claims DDM support "with configured credentials" and has an open "domain login" issue (#28) — [repo](https://github.com/chris-ritsen/network-audio-controller), [issues](https://github.com/chris-ritsen/network-audio-controller/issues?q=DDM+OR+domain+OR+firmware+OR+AES67)
- AES67: "Dante FW 4.2 added support for SMPTE ST 2110-30 RTP audio flows and AES67 RTP audio flows for enrolled devices (DDM networks and supporting devices only)"; AES67 in enrolled devices needs FW 4.2.x+ on Brooklyn, Broadway and HC — [Dante AES67 FAQ (blocked; snippet)](https://www.getdante.com/support/faq/aes67-interoperability/); NetAudio issue #63 (RTP streams from non-Dante devices not shown) shows AES67-only sources are a current gap — [#63](https://github.com/chris-ritsen/network-audio-controller/issues/63)
- Non-Brooklyn implementations (Biamp Tesira, Shure MXWANI4) return page structures NetAudio's parsers reject (#52, #53, #55) — [issues](https://github.com/chris-ritsen/network-audio-controller/issues?q=DDM+OR+domain+OR+firmware+OR+AES67)

### Inferences
- For the iPad Lake controller's "Dante routing" stretch goal, NetAudio's Rust protocol core (Unlicense) is the obvious dependency or reference: it already ships a native iOS client, so the routing packets (0x27 header, ports 4440/4455, `_netaudio-arc._udp`) are proven on iPadOS.
- Lake frames' Dante modules are Brooklyn-family Audinate cards, so they should behave like "standard" devices for NetAudio; the parser breakage is concentrated on vendor-specific (Biamp/Shure) implementations.
- DDM-enrolled venues are the main risk: raw-protocol control is intentionally blocked for non-members, so a production app needs either DDM credential support (as NetAudio attempts) or the official Managed API.

### Gaps
- Exact behaviour of NetAudio's DDM login against DDM 1.7+/Dante Director could not be verified (issue #28 still open; docs blocked).
- Whether recent Dante firmware (4.4/4.5, 2025-2026) changed the control protocol was not established; no source addressed it.
- The Gearspace thread's hex examples and dates could not be read (blocked).

---

## KQ4. Audinate legal/licensing posture and official SDK paths

### Takeaway
Audinate's EULAs uniformly forbid reverse engineering of its software and "Dante technology", and Inferno's authors acknowledge Audinate patents, but no DMCA action, takedown, or public statement against NetAudio/Inferno was found. Official paths: the **Dante Managed API** (GraphQL, requires DDM 1.5+), the **Dante Application Library** SDK (PC/Mac, licensed via Dante Ready), and OEM-only Dante APIs.

### Cited Findings
- Audinate license language: users may not "decompile, copy, reproduce, reverse engineer, disassemble or otherwise reduce computer files in which Dante technology is stored to a human-readable form" — [Dante Ready Activator T&Cs (blocked; snippet)](https://www.audinate.com/legal/dra-terms-conditions/); DDM EULA: shall not "modify, translate, reverse engineer, decompile, disassemble, or create derivative works based on the software" — [DDM EULA (blocked; snippet)](https://www.audinate.com/legal/dante-domain-manager-end-user-license-agreement/); Dante Director ToS: no reverse engineering "except to the extent such acts may not be prohibited by applicable law" — [Dante Director ToS (blocked; snippet)](https://www.getdante.com/products/network-management/dante-director/terms-of-service/)
- Dante Controller itself is distributed with proprietary terms plus listed open-source components — [Dante Controller open-source licenses](https://www.audinate.com/legal/software-licensing/open-source-licenses-dante-controller/), [Software Licensing index](https://www.audinate.com/legal/software-licensing/)
- Inferno disclaimer: "Dante uses technology patented by Audinate ... consult legal counsel regarding distribution or commercialization in patent-applicable jurisdictions" — [Inferno](https://github.com/teodly/inferno/)
- Searches for any Audinate takedown/DMCA/legal response to NetAudio or Inferno returned nothing; both projects remain online on GitHub/GitLab as of Sept 2026 — WebSearch 2026-09-29; [NetAudio](https://github.com/chris-ritsen/network-audio-controller), [Inferno GitLab](https://gitlab.com/lumifaza/inferno)
- Dante Managed API (DDM 1.5+, 2021): "allows service providers, integrators, software developers and OEMs to build Dante control and monitoring into management applications, control hardware, automation scripts"; "provides all the key functionality of Dante Controller ... query Dante domains, devices, channels, and status ... change channel subscriptions or ... add and remove devices from Dante domains"; GraphQL; "free update for existing users of Dante Domain Manager with active support agreement" — [Audinate press release (blocked; snippet)](https://www.audinate.com/press/audinate-releases-new-api-targeting-system-integrators-and-service-providers/), [ProSoundWeb](https://www.prosoundweb.com/audinate-announces-new-api-in-dante-domain-manager-1-5/), [AV.technology](https://av.technology/news/audinates-new-api-with-dante-domain-manager-1-5)
- "API Integrations ... can only be used on Dante systems that are managed by Dante Domain Manager v1.5 or higher" — [Audinate third-party applications page (unreachable; snippet)](https://global.audinate.com/products/dante-enabled/third-party-applications?lang=enPour); Managed API user guide v1.8 — [dev.audinate.com (blocked)](https://dev.audinate.com/GA/managed-api/userguide/pdf/latest/); product page — [getdante.com (blocked)](https://www.getdante.com/products/network-management/dante-managed-api/)
- Dante Application Library SDK (full availability Sept 2021): "SDK for PC and Mac that provides software developers with an easy-to-use conduit to audio devices connected via ... Dante"; "simple and flexible licensing"; licensed through "Dante Ready licensing ... for Dante Embedded Platform, Dante Application Library, and Dante IP core" — [ProSoundWeb](https://www.prosoundweb.com/audinate-announces-full-availability-of-dante-application-library-software/), [Commercial Integrator](https://www.commercialintegrator.com/av/audio/audio_distribution_systems/audinate-makes-dante-application-library-sdk-fully-available/), [Audinate press (blocked; snippet)](https://www.audinate.com/press/dante-application-library-is-sound-for-software/)
- "Dante API for Desktop Platforms" exists as a licensed product (its open-source components page is public) — [Audinate legal page](https://www.audinate.com/legal/software-licensing/dante-api-for-desktop-platforms-open-source-licenses/)

### Inferences
- The EULA restrictions bind users of Audinate software (Dante Controller, DDM); a clean-room implementation built from packet captures of one's own devices is the approach NetAudio and Inferno take, and neither has been publicly challenged in 3+ years. Patent exposure (flagged by Inferno) applies mainly to the audio transport/clocking, less to control messaging - but this is a legal question, not settled fact.
- An official, DDM-independent control API for iPad does not appear to exist; the Managed API requires DDM, and the Application Library is a desktop (PC/Mac) audio-endpoint SDK, not a controller SDK.

### Gaps
- Pricing and eligibility terms for the Dante Application Library / Dante API for Desktop Platforms are not public (press coverage says "contact Audinate"); the exact Dante Controller EULA text could not be read (audinate.com blocked).
- No source stated whether Audinate has ever commented on NetAudio/Inferno; absence of evidence, not evidence of absence.

---

## KQ5. General tooling for this kind of protocol work (brief)

### Takeaway
Standard toolchain: Wireshark Lua dissectors for iterative decoding, Netzob for semi-automatic message-format inference with Lua dissector export, Scapy for crafting/replaying packets; NetAudio's wiki is a model of "differential capture" documentation for a UDP control protocol.

### Cited Findings
- Wireshark Lua dissector authoring reference — [Wireshark wiki: Lua/Dissectors](https://wiki.wireshark.org/lua/dissectors); Lua `Proto` API — [WSDG 13.3](https://www.wireshark.org/docs/wsdg_html_chunked/lua_module_Proto.html); C dissector guide — [README.dissector](https://github.com/wireshark/wireshark/blob/master/doc/README.dissector)
- Netzob: "open source tool for reverse engineering, modelization, traffic generation and fuzzing of communication protocols ... infer the message format (vocabulary) and the state machine (grammar)"; exporter "provides automatic generation of Wireshark dissectors ... built in LUA" and export toward Scapy — [Netzob overview](https://netzob.readthedocs.io/en/latest/overview/), [Wireshark export tutorial](https://github.com/netzob/netzob/blob/master/doc/documentation/source/tutorials/wireshark.rst), [PyPI](https://pypi.org/project/Netzob/); talk "Protocols Are Everywhere: RE with Netzob" — [TIB AV-Portal](https://av.tib.eu/media/40315)
- Survey literature on protocol RE (network-trace vs binary-analysis approaches) — [Reverse engineering of industrial control protocol: A survey (2025)](https://sands.edpsciences.org/articles/sands/full_html/2025/01/sands20250012/sands20250012.html), [On Manually Reverse Engineering Communication Protocols (arXiv)](https://arxiv.org/pdf/2007.11981), [BinPRE (arXiv 2024)](https://arxiv.org/pdf/2409.01994)
- Worked example of differential-capture methodology on a proprietary UDP control protocol: NetAudio was "created by analyzing network requests and preset files made by Dante Controller" — [NetAudio](https://github.com/chris-ritsen/network-audio-controller)

### Inferences
- For Lake, the practical plan is: (1) implement DLM from the spec first; (2) only if needed, capture Lake Controller <-> frame traffic (Windows host + mirrored switch port), write a Lua dissector keyed on the 28-byte DLM-style header (the native protocol likely shares the source/destination ID + class + type framing, given DLM's `701` type sits in a larger type space), and use Netzob to cluster unknown message types.

### Gaps
- No Lake-specific write-up exists to validate that the native protocol shares DLM's framing; this is inference only.

---

## Project register (for quick reference)

| Project | URL | Target | Language | License | Last activity seen | Capabilities |
|---|---|---|---|---|---|---|
| jvhtec/streamdeck-lake-smaart | https://github.com/jvhtec/streamdeck-lake-smaart | Lake (DLM v3.4) | TypeScript | none (LICENSE 404) | Jul 2 2026 | LM module gain/mute, input-router priority, preset recall; DLM packet codec; mock frame |
| Lab.gruppen DLM v3.4 spec | https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf | Lake (official 3rd-party protocol) | PDF | vendor doc | v3.4 | UDP 6015/6016 -> device, 6004 reply; text commands in binary frames |
| bitfocus companion-module-requests #710 | https://github.com/bitfocus/companion-module-requests/issues/710 | Lake/Lab.gruppen | n/a | n/a | opened Jan 2022, stale | request only, no module |
| chris-ritsen/network-audio-controller (NetAudio) | https://github.com/chris-ritsen/network-audio-controller | Dante | Python + Rust (+ Swift iOS) | Unlicense | issues Sep 27 2026 | discovery, routing, names, sample rate, encoding, latency, gain, metering, DDM, iOS TestFlight, CLI/daemon/web/API |
| teodly/inferno (mirror of gitlab.com/lumifaza/inferno) | https://github.com/teodly/inferno/ | Dante audio transport | Rust | GPLv3+/AGPLv3+ | 126 commits, 11 tags (2023-2025+) | Dante tx/rx on Linux; interoperates with Dante Controller |
| Bencosterton/dante-network-control | https://github.com/Bencosterton/dante-network-control | Dante | Python | Unlicense | 131 commits (date n/a) | device/channel/subscription list, add, remove |
| jsharkey/wycliffe protonotes | https://github.com/jsharkey/wycliffe/blob/master/protonotes | Dante | notes | n/a | n/a | early port/header notes |
| bitfocus/companion-module-audinate-dante | https://github.com/bitfocus/companion-module-audinate-dante | Dante via DDM GraphQL | Node.js | MIT | 109 commits | subscriptions in managed domains only |
| Audinate Dante Managed API | https://www.getdante.com/products/network-management/dante-managed-api/ | Dante (official) | GraphQL | DDM 1.5+ licence | 2021- | domains, devices, channels, subscriptions, enrol/unenrol |
| Audinate Dante Application Library | https://www.prosoundweb.com/audinate-announces-full-availability-of-dante-application-library-software/ | Dante (official, PC/Mac audio SDK) | C SDK | Dante Ready licence | 2021- | software audio endpoint, not a controller API |
| Home Assistant Dante integration | https://community.home-assistant.io/t/wth-audinate-dante-integration-in-ha/804928 | Dante | n/a | n/a | requests only | none exists |
