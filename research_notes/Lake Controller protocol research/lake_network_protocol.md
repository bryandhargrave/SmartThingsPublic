# Lake Controller (Lab.gruppen / ex-Dolby Lake) native Ethernet protocol and networking behavior

**Research method and evidence-quality caveat (read first).** In this environment every document host that carries the primary sources was blocked by the egress proxy (prodgsystems.com, m3-eventtechnik.at, eviaudio.fr, manuals.plus, manualzz.com, manualslib.com, manualsdir.com, scribd.com, studylib.net, docplayer.net, beetech-inc.com, adamson.ai / legacy.adamson.ai / learn.adamsonsystems.com, cdn.mediavalet.com (Music Tribe CDN), audinate.com, data.yamaha.com, prosoundweb.com and its forums, gearspace.com, soundforums.net, kling-freitag.com, fast-and-wide.com, twaudio.de, lightsoundjournal.com, audiomediainternational.com, digitalstudiome.com, support.avlmediagroup.com, dolby.invisionzone.com, djeaudio.djeproduction.com, web.archive.org). **Every fact below therefore comes from WebSearch result snippets (i.e. sentence-level excerpts of those documents), not from reading the full documents.** Snippets are verbatim or near-verbatim extracts, so they are reliable for the sentence quoted but lack surrounding context (page numbers, section titles, version-specific qualifiers). Where a snippet's source document is identifiable, it is cited. Items marked **[snippet]** were confirmed only via snippet; **[inference]** is my reasoning; **[anecdote]** is a forum/user report. No packet formats are invented; where the DLM document is quoted, only the fields named in snippets are listed.

Only one page was fetched in full: the Bitfocus Companion module-request GitHub issue (#710), which contained no protocol detail.

---

## Key Question 1: Ports, transport, addressing, and the Hardware ID / Destination Class / packet-type terminology

### Takeaway
Lake control traffic is UDP. Lake Controller itself binds UDP port 6004 (the app refuses to start if 6004 is taken); the published third-party "Direct Lake Messaging" (DLM) spec documents UDP 6004 as the host/application listening port and UDP 6015 as the device destination port, with a header carrying Source ID, Destination ID, Source Class and Destination Class, where the Destination ID is the device's Hardware ID (= front-panel "Frame ID") and a broadcast Destination Class ID addresses all devices. Since Lake Controller v5.6 (2010) controller-to-frame communication moved from UDP broadcast to UDP unicast to cut traffic on Wi-Fi and multi-controller systems; older/legacy behavior and discovery presumably still rely on broadcast.

### Cited Findings

**Port 6004 used by Lake Controller itself**
- Lake Controller v5.7 release notes: the application "improved error messaging if UDP port 6004 is already in use by another program and the Lake Controller is unable to start." **[snippet]** — [Lake Controller v5.7 Release Notes (studylib mirror)](https://studylib.net/doc/18304345/lake-software-release-notes)
- The DLM v3.4 protocol document states "Port 6004 may not be used by any other program." **[snippet]** — [Lab.gruppen AB Direct Lake Messaging v3.4 (beetech-inc mirror)](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)

**DLM port pair and packet header (third-party protocol; devices speak this natively)**
- "The Direct Lake Messaging protocol uses UDP Port 6004 as the application listening port for receiving packets and UDP Port 6015 as the device destination port for transmitting packets." **[snippet]** — [Direct Lake Messaging 3rd-party protocol for PLM & LM Series (docplayer mirror, older v2.1-era edition)](https://docplayer.net/57698965-Direct-lake-messaging-3-rd-party-protocol-for-plm-tm-lm-tm-series.html)
- "The protocol uses a packet format containing a header, variable length payload, and footer, with fields for source ID, destination ID, source class, and destination class." **[snippet]** — [same docplayer mirror](https://docplayer.net/57698965-Direct-lake-messaging-3-rd-party-protocol-for-plm-tm-lm-tm-series.html)
- "If a specific unit is to be addressed the units hardware ID is used as destination ID in packet header." "If the application does not require addressing each hardware processor individually, the application can broadcast a UDP packet to all processors and set the Destination Class ID to broadcast." **[snippet]** — [DLM v3.4](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)
- "The hardware ID (Frame ID) can be found on the front panel by selecting MENU->Frame." "When communicating with a specific device the destination class should be set to 5, while the source class should be set to 6 indicating a host." **[snippet]** — [DLM v3.4](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)
- Front panel (LM Series manual): "The F.ID displays the Frame ID, a unique Lake product identifier that cannot be changed." **[snippet]** — [Lake LM Series Operation Manual p.42 (ManualsLib)](https://www.manualslib.com/manual/814603/Lake-Lake-Lm-Series.html?page=42)
- Data is "returned in Msg_DLMMsg packets or Msg_Ack responses, and PLM frames with firmware 2.58 broadcast proprietary control protocol messages." **[snippet]** — [search snippet attributed to the DLM document set](https://beetech-inc.com/wp/wp-content/uploads/DLM-Lake-3rd-party-protocol-v3_4.pdf)
- "The third-party protocol v2.1 supports the PLM Series and LM 26 devices." **[snippet]** — [docplayer DLM mirror](https://docplayer.net/57698965-Direct-lake-messaging-3-rd-party-protocol-for-plm-tm-lm-tm-series.html)
- "The firmware bundles of this release are compatible with the functionality of the DLM protocol v3.4." (Lake Controller v8.0.0 release notes) **[snippet]** — [Lake Controller v8.0.0 Release Notes (beetech-inc mirror)](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf)
- "The Direct Lake Messaging provides an Ethernet 3rd party protocol for Lake-enabled products to communicate with a unique PLM or LM unit on the network." **[snippet]** — [Lake Controller Operation Manual Rev 1.6.1 (eviaudio mirror)](https://www.eviaudio.fr/wp-content/uploads/2020/04/Lake_Controller_Operation_Manual.pdf)

**Transport: broadcast vs unicast**
- Lake Controller v5.6 (2010): "Several network speed and robustness improvements have been implemented, including switching communication protocols from UDP Broadcast to UDP Unicast, greatly reducing network traffic. This improves performance when using Lake Controller over Wi-Fi access and in multiple controller applications." **[snippet]** — [Fast-and-Wide: Lake Controller v5.6 software](https://www.fast-and-wide.com/equipment-releases/amplification/722-lake-controller-v56-software); also [Digital Studio ME](https://www.digitalstudiome.com/production/article-3597-lake-controller-software-now-even-more-flexible)
- Manual (network config section): "The Lake Controller uses UDP messaging to communicate with Lake devices on the network." **[snippet]** — [Lake Controller Operation Manual Rev 1.5.2 (prodgsystems mirror)](https://prodgsystems.com/public/pdf/128_Lake%20Controller%20Manual.pdf)
- Manual troubleshooting: "Lake applications utilize TCP/IP networking for Controller and device communication" (in the context of a firewall blocking device discovery). **[snippet]** — [Lake Controller Operation Manual Rev 1.7.0 (manuals.plus mirror)](https://manuals.plus/m/0633d4360a16681b3b477d2109fa5992f82872ddf78fd6d582cdef3aef67bed5)

**Other tools/ports**
- Lake Update (firmware) utility: "the Lake Update Utility requires full firewall access"; for PLM+/D Series "the network adapter selected for firmware update must be on the same subnet as Dante (169.254.x.x)". **[snippet]** — [AVL Support: How do I update the firmware in my Lake LM / PLM / D Series](https://support.avlmediagroup.com/kbase/how-do-i-update-the-firmware-in-my-lake-lm-processor-or-lab-gruppen-plm-d-series-amplifier/)
- Legacy "Dolby Lake Analyzer Bridge" (v1.31) "allowed intercommunication between SmaartLive 5.4 and the Dolby Lake Controller"; "Lake Controller v5.8 was the last version to support the old Analyzer Bridge." No port numbers surfaced. **[snippet]** — [Dolby Live Sound Forum: Analyzer Bridge v1.31](http://dolby.invisionzone.com/index.php?showtopic=320); [ProSoundWeb: Smaart 7 integration with LC v6](https://www.prosoundweb.com/lake-introduces-smaart-7-integration-with-lake-controller-version-6/)

### Inferences
- **[inference]** The Lake Controller PC binding UDP 6004 while devices are described as listening on 6015 suggests the capture will show Controller→frame datagrams with dst port 6015 and frame→Controller datagrams with dst port 6004 (i.e., the same port pair the DLM spec documents for third-party hosts). Treat this as a hypothesis to verify with the capture; the manual snippets only ever name 6004 explicitly.
- **[inference]** "Source class 6 = host" and "destination class 5 = device" in DLM imply a small class enumeration in the header (host, device, broadcast, possibly controller-to-controller). Lake Controller likely uses the same header family (the v8 notes tie firmware bundles to a DLM version), but no source states that Lake Controller's own messages are byte-identical to DLM.
- **[inference]** Because the Frame ID / Hardware ID is a fixed unique identifier carried in the packet header, addressing in the capture is expected to be by Hardware ID at the application layer, with IP unicast used since v5.6 and IP broadcast (subnet or 255.255.255.255) still likely for discovery and for the "Destination Class = broadcast" case.
- **[inference]** The v5.7 release-note phrase "PLM frames with firmware 2.58 broadcast proprietary control protocol messages" indicates frames themselves emit periodic broadcasts (status/announce), which should be visible in a capture even with no controller present.
- **[inference]** No multicast is mentioned anywhere for Lake control; Dante (mDNS/PTP/audio) is the only multicast traffic expected on a shared network.

### Gaps
- Exact byte layout of the header/footer, payload encoding, message/packet-type list, checksum, and endianness: present in the DLM PDF but not retrievable here. Do not reconstruct from memory.
- Whether Lake Controller itself uses 6015 as destination port (vs. another controller-specific port), whether there is a separate discovery port, and any TCP usage (the manual's "TCP/IP networking" wording is generic). Unresolved.
- Ports used by the Lake Update utility, the legacy Analyzer Bridge, and the Smaart 7 API bridge were not found.
- Whether MY8-LAKE, legacy Dolby Lake Processor, Contour and Mesa use the same 6004/6015 pair: not found (the DLM v2.1 doc lists only PLM and LM 26).

---

## Key Question 2: Device discovery, addressing and required network configuration

### Takeaway
Discovery is automatic on the local L2 segment with no manual IP entry: the manual's default is Windows "obtain IP automatically", which on an unmanaged network yields 169.254.x.x for both PC and frames (frames default to "Auto IP"/zero-conf, DHCP, or fixed IP set only from Lake Controller). Firewall exceptions for the Lake Controller executable (and full access for Lake Update) are required, a network-adapter selection dialog appears when the PC has more than one enabled NIC, and Dante audio traffic must be kept away from any Wi-Fi access point used for control.

### Cited Findings

**IP addressing**
- "The network card of the host computer running the Lake Controller must have a valid IP address. By default, Windows computers are configured to obtain an IP address automatically, and this default setup works successfully for most configurations and is the recommended starting point. On an unmanaged network this option will allocate the PC an IP address from the range 169.254.x.x." **[snippet]** — [Lake Controller Operation Manual (manuals.plus mirror, network configuration chapter)](https://manuals.plus/m/8e3b70f4847d495aa867fed41e056954178270e4e526cb292b1e535cccfb686e)
- "If connectivity problems are encountered, try setting the network adapter of the PC to the same subnet range or to another fixed IP address such as 192.168.0.x." **[snippet]** — [Lake Controller Operation Manual Rev 1.5.4 (eviaudio mirror)](https://www.eviaudio.fr/wp-content/uploads/2020/04/Manuel-Lake-Controller.pdf)
- Device side (LM Series front panel): "The IP address displays the Internet Protocol address for the selected unit and can only be changed via the Lake Controller software. It reads 'Auto IP' for Auto - Zero Conf, 'DHCP IP' for Auto - DHCP, and 'Fixed IP' when a fixed IP address is used." "Pressing the NETWORK button displays a further screen containing network configuration information, with all parameters being view-only on the front panel." **[snippet]** — [Lake LM Series Operation Manual p.42 (ManualsLib)](https://www.manualslib.com/manual/814603/Lake-Lake-Lm-Series.html?page=42)
- Lake Controller has "a popout window that lists IP settings and other frame configuration information for all frames in the current system... opened from the Control tab's Global IP configuration or via I/O Config Technical Data for an individual frame." (v8.0.0 notes) **[snippet]** — [Lake Controller v8.0.0 Release Notes](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf)
- Firmware update (PLM+/D Series): "the network adapter selected for firmware update must be on the same subnet as Dante (169.254.x.x)". **[snippet]** — [AVL Support KB](https://support.avlmediagroup.com/kbase/how-do-i-update-the-firmware-in-my-lake-lm-processor-or-lab-gruppen-plm-d-series-amplifier/)

**Firewall**
- Manual: "To configure the firewall, select 'Allow a program through Windows Firewall' from the list of Control Panel options." The manual "provides an overview of key requirements in terms of firewall configuration, wired and wireless network configuration, and Dante audio network configuration. There is also a separate Lake Network Configuration Guide included as part of Lake Controller installation." **[snippet]** — [manuals.plus mirror](https://manuals.plus/m/8e3b70f4847d495aa867fed41e056954178270e4e526cb292b1e535cccfb686e); the standalone guide is mirrored at [prodgsystems "Network Configuration Guide"](https://prodgsystems.com/public/pdf/130_Network%20Guide.pdf) (blocked; not read).
- Troubleshooting: "If all devices connected to the network are not appearing as expected, a firewall may be enabled and blocking network access." **[snippet]** — [Rev 1.7.0 manual (manuals.plus)](https://manuals.plus/m/0633d4360a16681b3b477d2109fa5992f82872ddf78fd6d582cdef3aef67bed5)
- Firewall access is also needed "for Lake Controller Dante functionality... and for the Lake Update utility to function correctly for PLM+ and D Series amplifiers." **[snippet]** — [Rev 1.6.1 manual (eviaudio)](https://www.eviaudio.fr/wp-content/uploads/2020/04/Lake_Controller_Operation_Manual.pdf)

**Multiple NICs / adapter selection**
- "The Lake Controller displays a Network Selection Dialog when it starts up with two or more enabled network interfaces, allowing users to select which network card to use via arrow keys and then Enter, or to start offline by pressing Esc." **[snippet]** — [Lake Controller v8.0.0 Release Notes](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf)
- "When a computer has more than one network interface enabled, the SELECT NETWORK Adapter dialog box appears, which typically occurs if your PC has both wired and wireless network interfaces. If you have more than one network adapter enabled, you should select the WIRELESS NETWORK ADAPTER" (in the wireless-setup procedure). **[snippet]** — [Rev 1.5.4 manual (eviaudio)](https://www.eviaudio.fr/wp-content/uploads/2020/04/Manuel-Lake-Controller.pdf)
- Lake Update: "You select the network adapter to which your device is connected." Connection "requires an Ethernet cable (direct cable, not crossed) connected directly between your laptop and the Lake device." **[snippet]** — [AVL Support KB](https://support.avlmediagroup.com/kbase/how-do-i-update-the-firmware-in-my-lake-lm-processor-or-lab-gruppen-plm-d-series-amplifier/)

**Wireless and Dante separation**
- "When using a wireless access point for Lake Controller data in conjunction with Dante audio networking, additional configuration of an external Ethernet switch is required to filter Dante audio traffic from reaching the access point." **[snippet]** — [Rev 1.5.4 manual](https://www.eviaudio.fr/wp-content/uploads/2020/04/Manuel-Lake-Controller.pdf)
- "When using multiple PCs, Lake devices, or wireless access points, a network switch is required." Recommended sequence: connect wired first "and then add a wireless access point once wired connection has proven successful." **[snippet]** — [same](https://www.eviaudio.fr/wp-content/uploads/2020/04/Manuel-Lake-Controller.pdf)
- "Multiple devices can be connected by cascading connections between units, although this is not a recommended solution for the successful use of Dante... Connecting devices via a good quality external Ethernet switch with QoS is highly recommended." **[snippet]** — [Rev 1.6.1 manual](https://www.eviaudio.fr/wp-content/uploads/2020/04/Lake_Controller_Operation_Manual.pdf)
- Manual: "Dante and AES67 provide multi-channel digital audio networking over standard Ethernet network, alongside control data for the Lake network." **[snippet]** — [Rev 1.6.1 manual](https://www.eviaudio.fr/wp-content/uploads/2020/04/Lake_Controller_Operation_Manual.pdf)
- Yamaha's Dante design guide (generic): "You will not be merging the control network for Lake Controller or any other existing local area network into the Dante network when constructing a dedicated Dante network." **[snippet]** — [Yamaha: Audinate Dante Network Design Guide](https://usa.yamaha.com/products/contents/proaudio/docs/dante_network_design_guide/index.html)

**Legacy note**
- The Lake Controller v3.x era (Dolby) "supported Windows 98 SE, 2000, and XP." **[snippet]** — [Dolby Live Sound Forum: Lake Controller 3.2](http://dolby.invisionzone.com/index.php?showtopic=170)

### Inferences
- **[inference]** Because both PC and frames default to 169.254/16 link-local and the manual never asks the user to type a frame IP, discovery must be by broadcast (or frame-originated broadcast announcements) on the selected adapter's segment; the PC must be on the same L2 segment and IP subnet (the manual's fix for problems is "same subnet range"). Routed/multi-subnet operation is not described anywhere found.
- **[inference]** Selecting a single NIC at startup means Lake Controller sockets are bound to one interface; on a dual-NIC PC (Lake control on one, Dante on the other) the capture should be taken on the interface chosen in the dialog.
- **[inference]** On PLM+/D Series the Lake control and Dante share the same device Ethernet port/IP (firmware update must be on the Dante 169.254 subnet), which is why the manual wants Dante multicast filtered off the Wi-Fi AP rather than physically separated.

### Gaps
- The standalone "Lake Network Configuration Guide" content (exact firewall rules, switch/IGMP recommendations, VLAN guidance) could not be read.
- Whether discovery packets are subnet-directed or limited broadcast, and the announce interval, were not found.
- Any documented IPv6, VLAN, or routed-network support: none found.

---

## Key Question 3: Multiple controllers, online/offline, sync, and where state lives (see also the dedicated Primary/Secondary section below)

### Takeaway
State lives in the frames: Lake Controller's System Configuration file is a snapshot (Module + Frame + Group + I/O data) that is recalled to frames and compared against them; frames that were changed while disconnected are flagged "Out of Sync" and synchronization to a frame happens via FastSync/SlowSync mechanisms. Lake Controller has an explicit Primary/Secondary multiple-controller model (documented since at least v3.2, 2005) in which secondaries' changes are routed through the primary.

### Cited Findings

**System configuration files and frame state**
- "A System or Sub-System Configuration File contains a set of Module file information in addition to Frame related information such as Group data and I/O configuration, and includes the configurations of both Modules in the Frame, including all levels, crossover, EQ, input mixer, output routing, and all other Module, Frame and Group parameters." **[snippet]** — [Lab.gruppen PLM Series Operation Manual p.26 (ManualsLib)](https://www.manualslib.com/manual/638117/Lab-Gruppen-Plm-Series.html?page=26)
- "Frame Presets must initially be created in the Lake Controller, and stored as a Preset using the Lake Controller or the LM Series Preset Manager"; recall from front panel: "use the rotary encoder to select the required Preset then press the RECALL button to overwrite the current configuration." **[snippet]** — [Lab.gruppen LM 44 / LM 26 manual p.21 (manualsdir)](https://www.manualsdir.com/manuals/738560/labgruppen-lm-44-lm-26.html?page=21)
- "Virtual Frames are always available whether or not the network is connected, and allow you to create a complete system configuration offline." **[snippet]** — [Rev 1.7.0 manual (manuals.plus)](https://manuals.plus/m/0633d4360a16681b3b477d2109fa5992f82872ddf78fd6d582cdef3aef67bed5)

**Out of Sync / FastSync / SlowSync / Recall Last System Configuration**
- "When Frames are disconnected or closed, the Lake Controller will identify the Frames as Out of Sync the next time it is connected, or opened using the Recall Last System Configuration option." **[snippet]** — [Rev 1.5.4 manual (eviaudio)](https://www.eviaudio.fr/wp-content/uploads/2020/04/Manuel-Lake-Controller.pdf)
- v8.0.0 known issue: "SlowSync issue on large systems when EQ filters are removed and new filters added, with a workaround of storing a System file and recalling it to enable FastSync." "Frame Replace could lead to OOS (Out of Sync) scenarios" (fixed). "Problem with mismatching Dante Inputs during System File Recall has been fixed." **[snippet]** — [Lake Controller v8.0.0 Release Notes](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf)
- Batch/AES67 behavior: "When setting AES67 Enabled/Disabled, devices will go offline... the Batch Replace operation will take a long time (30 seconds per device)"; "the device will shortly go offline but automatically comes back online again when certain configuration changes are made." **[snippet]** — [Lake Controller v8.0.0 Release Notes](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf)
- A "LAKE Frame Replace" tutorial video exists (feature for swapping a physical frame into a configuration). — [YouTube: LAKE Frame Replace](https://www.youtube.com/watch?v=x6vWW3kQXVI)

**Device-side view of controller loss**
- "When a device is no longer able to communicate with the Lake Controller, it displays a 'CTRL OFFLINE' warning, and you should check network connectivity." **[snippet]** — [Rev 1.7.0 manual (manuals.plus)](https://manuals.plus/m/0633d4360a16681b3b477d2109fa5992f82872ddf78fd6d582cdef3aef67bed5)
- Manual has sections titled "Offline Modules" and "Communication/Network Errors"; "To verify that devices are on the network and communicating, you can tap the Modules button." **[snippet]** — [same](https://manuals.plus/m/0633d4360a16681b3b477d2109fa5992f82872ddf78fd6d582cdef3aef67bed5)
- Offline editor: v8.0.0 notes reference "an offline editor when connecting to Lake devices." **[snippet]** — [v8.0.0 Release Notes](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf)
- Anecdote thread "Lake Controller 6.2 (offline)" exists on ProSoundWeb (content not readable). **[anecdote, unread]** — [ProSoundWeb forum topic 151162](https://forums.prosoundweb.com/index.php?topic=151162.0)

**Groups / Super Modules (relevant to what gets sent on the wire)**
- "A single device can belong to multiple Groups (up to 28), and the Controller can use multiple Groups to send global adjustments to all PA areas." **[snippet]** — [Rev 1.6.1 manual](https://www.eviaudio.fr/wp-content/uploads/2020/04/Lake_Controller_Operation_Manual.pdf)
- "Super Modules allow control of multiple Modules of the same type, distributed across multiple Frames, as a single entity within the Lake Controller software. A change made in the Super Module is replicated across all assigned Modules." **[snippet]** — [Lake LM Series Quick Start p.16 (ManualsLib)](https://www.manualslib.com/manual/1884060/Lake-Lm-Series.html?page=16)

### Inferences
- **[inference]** The frame holds the authoritative running state (front-panel presets recall without a controller; "CTRL OFFLINE" is only a warning). The controller holds the *system* view (groups, super modules, virtual frames) and reconciles by comparing its file to each frame ("Out of Sync") then pushing via FastSync (delta) or SlowSync (full re-send). A capture of a System file recall should therefore show a burst of per-frame parameter writes; the v8 note that storing/recalling a file "makes FastSync work again" implies FastSync depends on controller-side cached frame state matching.
- **[inference]** Group and Super Module edits are expanded by the controller into per-frame messages (the manual says the change is "replicated across all assigned Modules"), so a single group gain change should produce N unicast datagrams, not a group-addressed packet — unverified.

### Gaps
- Exact System Configuration file extensions (.lcs/.lks/.tcf etc.) were not confirmed by any snippet; do not rely on the extension list in the question.
- Controller heartbeat/timeout that triggers "CTRL OFFLINE", and the reconnect/re-sync handshake, were not found.
- FastSync vs SlowSync definitions beyond the v8 note were not found.

---

## Dedicated section: Primary / Secondary controller arrangement (coordinator priority item)

### Takeaway
**Verified (as far as snippets allow):** Lake Controller has a documented "Multiple Controllers" model with "Primary and Secondary Controllers" and "Restricted Functionality" subsections in the Operation Manual (current Rev 1.5.4/1.6.1 manuals and the July-2005 v3.2 User Mode Manual), and release notes from v5.3 onward treat "Multiple Controllers" as a feature area. The v5.7 known-issues confirm the architecture: a secondary's edits are routed through the primary and are discarded if the primary connection is lost. **Not verified from any source:** the approval-prompt flow on the primary, the specific parameter set a secondary may/may not change, and promotion/timeout behavior when the primary disconnects. The user's description is consistent with what was found but the approval dialog and the exact restrictions remain unconfirmed.

### Cited Findings
- The Lake Controller Operation Manual (Rev 1.5.4) contains a "Multiple Controllers" section "with information on Primary and Secondary Controllers and Restricted Functionality". **[snippet, section titles only]** — [Rev 1.5.4 manual (eviaudio)](https://www.eviaudio.fr/wp-content/uploads/2020/04/Manuel-Lake-Controller.pdf)
- The v3.2 Lake Controller User Mode Manual (July 2005, part DOC-532-0005) "includes sections on Primary and Secondary Controllers and Restricted Functionality". **[snippet]** — [v3.2 Lake Controller User Mode Manual (manualzz)](https://manualzz.com/doc/7199931/v3.2-lake-controller-user-mode-manual) — i.e., the feature predates Lab.gruppen ownership and dates to the Dolby Lake era.
- v5.7 release notes, known issues: "A system with more than one secondary Lake Controller has communication problems." **[snippet]** — [Lake Controller v5.7 Release Notes (studylib)](https://studylib.net/doc/18304345/lake-software-release-notes)
- v5.7 known issue: "If connection to primary Controller is lost from secondary Controller, Events and Control popup values can still be edited from secondary Controller – however these changes never reach the frames and when connection is established to primary Controller again all changes done on secondary will be lost." **[snippet]** — [same](https://studylib.net/doc/18304345/lake-software-release-notes)
- v5.7 fixed list: "Multiple Controllers are now working again." **[snippet]** — [same](https://studylib.net/doc/18304345/lake-software-release-notes)
- v5.3 (June 2009): "With release 5.3, many improvements in the area of Super Modules and Multiple Controllers have been made as well as many other critical bug fixes." **[snippet]** — [LightSoundJournal: Lake Controller 5.3](https://www.lightsoundjournal.com/2009/06/20/lake-releases-new-lake-controller-software-version-5-3/)
- v5.6 (2010): broadcast→unicast change "improves performance when using Lake Controller over Wi-Fi access and in multiple controller applications." **[snippet]** — [Fast-and-Wide v5.6](https://www.fast-and-wide.com/equipment-releases/amplification/722-lake-controller-v56-software)
- Third-party iPad app "Lake Remote" (George Puttock, ~2014) "runs seamlessly with Lake Controller, enabling multiple users to concurrently control the system in real time"; "wirelessly control and monitor up to 16 Lake enabled devices"; "supports LM26, LM44 and all PLM amplifiers." **[snippet]** — [AppAdvice: Lake Remote](https://appadvice.com/app/lake-remote/896686441); [soft112 listing](https://lake-remote-ios.soft112.com/)
- Manual: "The Lake Controller software should be installed on any PC/s that will be used to control and monitor the Lake Processor network." **[snippet]** — [PLM Series Quick Start p.27 (ManualsLib)](https://www.manualslib.com/manual/1143809/Lab-Gruppen-Plm-Series.html?page=27)
- Manual also documents *network* redundancy (Dual Redundant Dante products): "seamlessly switch between Primary and Secondary, and Control can be used on either Primary or Secondary interface" — this "Primary/Secondary" refers to Dante network ports, not controllers; do not conflate. **[snippet]** — [Rev 1.5.4 manual](https://www.eviaudio.fr/wp-content/uploads/2020/04/Manuel-Lake-Controller.pdf)

### Inferences
- **[inference, strong]** The v5.7 wording ("changes never reach the frames" when the primary link is lost, and are "lost" when it returns) shows the secondary does **not** write directly to frames; its edits are relayed via the primary controller (controller-to-controller messaging, then primary→frame). Enforcement is therefore at least partly controller-side. Whether frames additionally reject writes from non-primary hosts is unknown.
- **[inference]** The two v5.7 known issues (multi-secondary communication problems; secondary keeps a local edit buffer) imply the primary maintains the authoritative controller-side model and secondaries mirror it; capture should show secondary↔primary unicast traffic on the PC network plus primary↔frame traffic, and little or no secondary↔frame traffic.
- **[inference]** "Restricted Functionality" as a manual heading corroborates the user's statement that a secondary has limited access; it does not tell us *which* functions.
- **[inference]** The user's "primary is prompted to approve" is plausible (a controller-to-controller join request) but no snippet mentions a prompt/accept dialog; treat as unverified.
- **[inference]** Lake Remote (an iOS app that co-exists with Lake Controller) most likely operates as a secondary or as a direct DLM host; no source says which.

### Gaps
- Exact manual text of "Primary and Secondary Controllers" and "Restricted Functionality" (which parameters are locked: store/recall, I/O config, frame add/remove vs. gain/mute/EQ) — documents blocked.
- Approval/acceptance dialog on the primary: not found in any snippet.
- Promotion of a secondary to primary, timeout, or manual "take control" when the primary disconnects: not found.
- Whether the frame enforces a single writing controller (e.g., locks to the primary's Hardware/host ID) or only the controllers negotiate: not found.
- Version history of changes to the mechanism after v5.7 (v6–v8 release notes could not be read; no snippet mentioned multi-controller fixes in v6+).

---

## Key Question 4: External Control Interfaces chapter; does Lake Controller expose a network API?

### Takeaway
The manual's external-control material covers LM Series GPIO, AMX/Crestron control, and the Direct Lake Messaging third-party protocol, all of which target the *devices*; the only Lake-Controller-side integration found is the measurement-analyzer link (legacy Dolby Lake Analyzer Bridge for SmaartLive 5.4, replaced in LC v6 by a Smaart 7 API client), plus VNC for iPad screen sharing. No documented Lake Controller network control API was found.

### Cited Findings
- Manual TOC: "GPIO (LM Series Only)" and "AMX® and Crestron® Control" appear together (p.287 in one revision, p.295 in Rev 1.6.1). **[snippet]** — [Rev 1.6.1 manual](https://www.eviaudio.fr/wp-content/uploads/2020/04/Lake_Controller_Operation_Manual.pdf); [Rev 1.5.2 manual](https://prodgsystems.com/public/pdf/128_Lake%20Controller%20Manual.pdf)
- LM Series: "GPIO configuration is available via the front panel interface or via Lake Controller software", with a "GPIO Pinout Wiring Reference". **[snippet]** — [Lake LM Series Operation Manual (ManualsLib)](https://www.manualslib.com/manual/814603/Lake-Lake-Lm-Series.html)
- Crestron: Lab.gruppen joined the Crestron Integrated Partner Program (Nov 2009); "a custom control protocol module developed by Crestron... is available for the PLM Series... The Crestron module features full amplifier fault reporting, muting, and soloing at the per-channel level, as well as power on/off and real time metering." **[snippet]** — [ProSoundWeb: Lab.gruppen joins Crestron IPP](https://www.prosoundweb.com/lab-gruppen-joins-open-platform-crestron-integrated-partner-program-ipp/); [LightSoundJournal](https://www.lightsoundjournal.com/2009/11/20/lab-gruppen-joins-the-crestron-ipp/)
- DLM is the third-party path: "an Ethernet 3rd party protocol for Lake-enabled products to communicate with a unique PLM or LM unit on the network." **[snippet]** — [Rev 1.6.1 manual](https://www.eviaudio.fr/wp-content/uploads/2020/04/Lake_Controller_Operation_Manual.pdf)
- Community: a 2023-era Bitfocus Companion module request for "Lab Gruppen PLM and D series amplifiers" cites an existing "Qsys plugin using the API" and proposes Power On/Standby, Preset Recall, Module Mutes; protocol docs were linked via Google Drive (not accessible). **[full page read]** — [GitHub bitfocus/companion-module-requests #710](https://github.com/bitfocus/companion-module-requests/issues/710)
- Measurement integration, legacy: "Dolby Lake Analyzer Bridge... allowed intercommunication between SmaartLive 5.4 and the Dolby Lake Controller. Analyzer traces from Smaart could be plotted in Lake Controller and various controls from LC could be displayed/manipulated in Smaart." "Lake Controller v5.8 was the last version to support the old Analyzer Bridge." Also used with "Live-Capture Light" as a free analyzer. **[snippet]** — [Dolby Live Sound Forum](http://dolby.invisionzone.com/index.php?showtopic=320); [Lake Analyzer Bridge listing](https://lake-analyzer-bridge.software.informer.com/); PLM manual p.11 mentions "Lake Analyzer Bridge" — [ManualsLib](https://www.manualslib.com/manual/679702/Lab-Gruppen-Plm-Series.html?page=11)
- Measurement integration, current: "Lake Controller v6 includes a new analyzer engine that connects to Smaart 7 through a public API, and measurement data and measurement controls from Smaart 7 can be displayed within LC v6." (announced PL+S 2012) **[snippet]** — [ProSoundWeb](https://www.prosoundweb.com/lake-introduces-smaart-7-integration-with-lake-controller-version-6/); [Audio Media International](https://audiomediainternational.com/pls-2012-lake-unveil-smaart-7-integration-with-lake-controller-v-6/)
- Rational Acoustics: "Smaart's API provides a mechanism for other applications (like Waves TRACT and Lake Controller) to access and control measurements over a network connection." **[snippet]** — [Rational Acoustics: Tips for using Smaart's API](https://support.rationalacoustics.com/support/solutions/articles/150000092223-tips-for-using-smaart-s-api-web-viewer-remote-client-third-party-integrations-etc-)
- iPad: "Lake Controller is ubiquitous audio software designed to run only on a Windows OS... Lake Controller on iPad utilizes VNC... based on the RFB (remote frame buffer) protocol." **[snippet]** — [Lake Controller on the iPad (prodgsystems PDF)](https://prodgsystems.com/public/pdf/128_Lake%20Controller%20on%20the%20iPad.pdf); [Sound Forums news](https://soundforums.net/news/lake-controller-on-the-ipad-190578/)

### Inferences
- **[inference]** Lake Controller is a network *client* of Smaart (TCP to Smaart's API port, typically on the same or another PC) and of VNC servers; neither is a Lake control API. Expect a Smaart API TCP session in the capture only if the analyzer is in use.
- **[inference]** Third-party controllers (Crestron, Q-SYS plugin, Companion) speak DLM directly to frames on 6015/6004 and would therefore coexist on the wire with Lake Controller as additional "host class" senders — potentially relevant to the multi-controller question, since DLM hosts are not part of the primary/secondary controller negotiation.

### Gaps
- Contents of the "AMX and Crestron Control" and "Third-Party" manual pages (whether AMX modules exist, whether GPIO events can trigger controller-side actions) were not readable.
- Smaart API port and whether Lake Controller v8 supports Smaart v8/v9 or Systune: not found.

---

## Key Question 5: Version history, OS requirements, mobile apps, firmware pairing

### Takeaway
Major versions: v3.x (Dolby, 2005, Win98SE/2000/XP), v5.x (2009–2011; v5.6 unicast; v5.8 last for Dolby Lake Processor/Contour/Mesa and Analyzer Bridge), v6.x (2012–2019; Smaart 7 API, PLM+/D Series Dante from v6.5, DPI scaling for Win 8.1+), v7.0.0 (July 2020), v8.0.0 (2022, LMX support, DLM v3.4, requires Windows 10; current recommended 8.1.7). No official native mobile app; iPad use is via VNC, and a third-party "Lake Remote" iOS app exists. Firmware is bundled inside each installer and applied with the Lake Update utility.

### Cited Findings
- v3.1/3.2 (2005): "supported Windows 98 SE, 2000, and XP." **[snippet]** — [Dolby forum LC 3.2](http://dolby.invisionzone.com/index.php?showtopic=170), [LC 3.1](http://dolby.invisionzone.com/index.php?showtopic=169)
- v5.3 (June 2009): Super Modules and Multiple Controllers improvements. **[snippet]** — [LightSoundJournal](https://www.lightsoundjournal.com/2009/06/20/lake-releases-new-lake-controller-software-version-5-3/)
- v5.6 (2010): UDP broadcast→unicast; firmware for LM 26 and PLM included; PLM Bridge Mode. **[snippet]** — [Fast-and-Wide](https://www.fast-and-wide.com/equipment-releases/amplification/722-lake-controller-v56-software)
- v5.7: UDP 6004 error message; multiple controllers fixed; known issues above. **[snippet]** — [studylib v5.7 notes](https://studylib.net/doc/18304345/lake-software-release-notes)
- v5.8: "Version 5.8 of the controller is the latest version supported for the legacy Contour processor"; "Since Lake Controller v6.0, the Dolby Lake Processor (DLP), Lake Contour Pro 26 and MESA Quad EQ devices are no longer supported." **[snippet]** — [Gearspace: Lake Contour Reset?](https://gearspace.com/board/live-sound/1289902-lake-contour-reset.html); [Lake Controller v8.0.0 Release Notes](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf); [Sound Forums: Wanted Dolby Lake Controller <5.8](https://soundforums.net/community/threads/wanted-dolby-lake-controller-software-ver-5-8.212405/)
- v6.0 (2012): Smaart 7 API analyzer. **[snippet]** — [ProSoundWeb](https://www.prosoundweb.com/lake-introduces-smaart-7-integration-with-lake-controller-version-6/); v6.1 and v6.3.1 releases also reported — [Fast-and-Wide v6.1](https://www.fast-and-wide.com/equipment-releases/processing-and-control/4703-lake-controller-v61); [ProSoundWeb v6.3.1](https://www.prosoundweb.com/new-lake-controller-v-6-3-1-available-for-download-video/)
- v6.4.2 (2015), v6.4.3 (Feb 2016); "Lake Controller v6.5.0 added support for PLM+/D Series with Dante"; "Since version 6.5 of LAKE, PLM+ and D Series will power cycle as part of the update." **[snippet]** — [v8.0.0 Release Notes history section](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf); [AVL KB](https://support.avlmediagroup.com/kbase/how-do-i-update-the-firmware-in-my-lake-lm-processor-or-lab-gruppen-plm-d-series-amplifier/)
- v6.8.2 (2019-07-08), v6.8.3 (2019-08-01), v6.8.4 (2019-10-22), v6.8.5 (2019-12-18). **[snippet]** — [v8.0.0 Release Notes history](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf)
- "Release V7.0.0 was released on 2020-07-07 (Installer 108)"; v7.0.7 and v7.1.2 release notes exist. **[snippet]** — [same](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf); [docplayer: LC v7.0.7 release notes](https://docplayer.net/amp/235894926-Lake-controller-v7-0-7-release-notes.html)
- v8.0.0 (Installer 131): "Version 8 supports D Series Lake, PLM+, PLM, 20000 DP, LMX Series, LM Series and MY8-LAKE devices"; "everyone that wants to use the new LMX series products needs to use version 8.0.0 or later"; "This release requires that you make the installation in a new Lake Controller folder, and it is recommended to install this release in parallel to any previously installed version"; "The required firmware (DSP) versions are included in this package and can be updated with the included utilities"; DLM v3.4 compatible; "Lake Controller v8 requires at least Windows 10 to run" (one snippet also mentioned Windows 7 in the v8 notes — conflicting; treat Win 10 minimum as the more specific statement and verify). **[snippet]** — [v8.0.0 Release Notes](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf); [Kling & Freitag announcement](https://www.kling-freitag.com/lake-controller-8-0-has-just-been-released/)
- v8.0 "added support for PLM+ and new Dante module Brooklyn 3-equipped D Series devices." **[snippet]** — [v8.1.6 Release Notes (Music Tribe CDN)](https://cdn.mediavalet.com/aunsw/musictribe/aQA11GZ94kSLg9TiZ9r_OA/2pWl7Jb_qkebhk4-cJVlvw/Original/LakeController%E2%80%93v8.1.6%E2%80%93ReleaseNotes.pdf)
- v8.1.1 "is verified with Firmware v00.05.44" (device unspecified in snippet). v8.1.6 (Installer 156): "new firmware and support for the LMX series devices... resolved clocking and Mixer issues for MY8-LAKE, with MY8-LAKE supported again." **[snippet]** — [v8.1.6 Release Notes (Adamson mirror)](https://www.adamson.ai/support/downloads-directory/design-and-control/lake-controller/958-lake-controller-v8-1-6-release-notes/file)
- "Lake Controller Version 8.1.7 is available as a Windows installer, and version 8.1.7 is the recommended version." **[snippet]** — [Adamson: Lake Controller v8.1.7](https://legacy.adamson.ai/support/downloads-directory/design-and-control/lake-controller/968-lake-controller-v8-1-7)
- High-DPI: "For high resolution tablet running Windows 8.1 or later, the Lake Controller enables Windows DPI scaling... right-click the Lake Controller executable, select the Compatibility tab, and select Disable scaling for High-DPI." **[snippet]** — [Rev 1.6.1 manual](https://www.eviaudio.fr/wp-content/uploads/2020/04/Lake_Controller_Operation_Manual.pdf)
- Firmware update tool: "The Lake Update utility is a small application found within the Lake Controller folder in Program Files"; "After running the LakeUpdate application, you choose your device. The next screen displays the connected frames and their current firmware versions." **[snippet]** — [AVL KB](https://support.avlmediagroup.com/kbase/how-do-i-update-the-firmware-in-my-lake-lm-processor-or-lab-gruppen-plm-d-series-amplifier/); Japanese Lake Update manual (LM/PLM, v6.5.0+) — [beetech-inc](https://beetech-inc.com/wp/wp-content/uploads/Lake_Update%E6%89%8B%E9%A0%86_LM_PLM_ver.6.5.0%E4%BB%A5%E9%99%8D_20170711.pdf); Music Tribe KB — [Lake - How do I update the firmware](https://musictribecommunity.powerappsportals.com/en-us/knowledgebase/article/6922)
- Cross-version compatibility anecdote: thread "Lake Controller 5.8 with 6.1 configured PLM" (content unreadable). **[anecdote, unread]** — [Sound Forums](https://soundforums.net/community/threads/lake-controller-5-8-with-6-1-configured-plm.8916/)
- MY8-LAKE firmware/downloads are also distributed by Yamaha. — [Yamaha MY8-LAKE downloads](https://usa.yamaha.com/products/proaudio/interfaces/my8-lake/downloads.html)
- Mobile: no official native app found; iPad via VNC (above); third-party "Lake Remote" iOS (v1.1) app. **[snippet]** — [AppAdvice](https://appadvice.com/app/lake-remote/896686441)

### Inferences
- **[inference]** Firmware and controller are versioned as a bundle; a frame on older firmware talking to a newer controller (or vice versa) is likely to be flagged (the Lake Update screen shows per-frame firmware versions). For the capture, note each frame's firmware version and the controller build (Installer number).

### Gaps
- Per-device firmware version tables for each v8.x release, and v7.x feature list, could not be read.
- Windows 11 support statement: not found explicitly (v8 says "at least Windows 10").
- Release dates for v8.0.0 / v8.1.7: not found in snippets (K&F announcement page unreadable).

---

## Key Question 6: Lake Controller and Dante control

### Takeaway
Lake Controller configures Dante I/O on Lake devices (input selection and, from v8.0.0, routing DSP channels to Dante transmit outputs), and Audinate documents it as a third-party configuration application that can be used alongside Dante Controller; how it does so (Audinate's Dante API embedded in the device firmware vs. its own protocol) is not stated in any source found.

### Cited Findings
- Audinate FAQ exists: "Can I use the Dante controller and a third-party configuration application such as the Lake Controller in parallel?" — snippet: "The Lake Controller is recommended for configuring audio routing in Lab.gruppen or Dolby equipment, and it can be used alongside other Dante configuration tools." **[snippet]** — [Audinate FAQ](https://www.audinate.com/learning/faqs/can-i-use-the-dante-controller-and-a-third-party-configuration-application-such-as-the-lake-controller-in-parallel?lang=en)
- v8.0.0: "For PLM+ and D Series products, it is now possible to route DSP channels to Dante transmit outputs." **[snippet]** — [v8.0.0 Release Notes](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf)
- v8.0.0: fixed "mismatching Dante Inputs during System File Recall"; AES67 enable/disable takes devices offline. **[snippet]** — [same](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf)
- Firewall access is needed "for Lake Controller Dante functionality". **[snippet]** — [Rev 1.6.1 manual](https://www.eviaudio.fr/wp-content/uploads/2020/04/Lake_Controller_Operation_Manual.pdf)
- Lake devices with Dante are listed on Audinate's product directory (e.g., PLM 10000Q). — [getdante.com: Lab.gruppen Lake PLM10000Q](https://www.getdante.com/product/lab-gruppen-lake-plm10000q/)
- Generic Dante rule: duplicate Dante device names cause a conflict on the network. **[snippet]** — [Dante Controller User Guide](https://dev.audinate.com/GA/dante-controller/userguide/pdf/latest/)

### Inferences
- **[inference]** Because Dante subscriptions are stored in the Lake System file (the v8 fix for "mismatching Dante Inputs during System File Recall"), Lake Controller must write subscriptions to devices on recall. The separate "firewall access for Dante functionality" hint suggests Lake Controller may open additional sockets for Dante (possibly Audinate's control protocol/mDNS on the Dante subnet) beyond UDP 6004 — a capture filter on 6004/6015 alone could miss this. Verify by watching for mDNS (UDP 5353) and Audinate's control ports from the Lake Controller PC.

### Gaps
- Whether Lake Controller speaks Audinate's Dante control protocol directly, or asks the Lake firmware to perform subscriptions via Lake messages: not documented in anything found.
- Full Audinate FAQ text (blocked).

---

## Practical checklist for tomorrow's capture (derived from the above; items marked * are inferences to test)
1. Capture on the NIC selected in Lake Controller's startup "Select Network Adapter" dialog; note if the PC is dual-homed (Dante vs control).
2. Filter first on `udp.port == 6004 || udp.port == 6015`; then look for anything else from the Lake Controller PC (mDNS 5353, Audinate ports, Smaart API TCP, VNC 5900).*
3. Start capturing before launching Lake Controller to catch discovery (expect IP broadcast on 169.254/16 or 255.255.255.255) and frame-originated periodic broadcasts.*
4. Record each frame's Frame ID (front panel MENU→Frame) so header Destination/Source IDs can be correlated.*
5. Exercise: single gain change on one module; a Group change; a Super Module change; a System file store and recall (to observe FastSync vs SlowSync bursts); unplug a frame and re-plug (Out of Sync/re-sync); close and reopen the controller ("Recall Last System Configuration").
6. Start a second Lake Controller on another PC: observe whether the primary receives any prompt, whether the secondary's traffic goes to the primary PC or to the frames, and what happens on the frames when the primary is closed (CTRL OFFLINE?).
7. Note controller build/Installer number and firmware per frame (Lake Update utility shows both).
