# Capture tooling, differential protocol analysis, GUI automation, remote observation, and iPadOS networking constraints (as of 2026)

Scope note for the report writer: this file covers *how* to capture/decode a proprietary LAN control protocol between a Windows app (Lake Controller) and a DSP device, and *what iPadOS lets an app do* on the LAN. It does not cover the Lake protocol itself. Research constraints: the web proxy blocked wireshark.org, wiki.wireshark.org, ask.wireshark.org, npcap.com, reveng.sourceforge.io, several blogs and Apple Community; primary text was recovered from mirrors (Wireshark GitLab source, nmap/npcap GitHub, Apple doc JSON endpoints, Apple Developer Forums). Where only a search-result snippet of a blocked page was available, that is flagged.

---

## Key Question 1: Capture setup (seeing PC <-> device traffic)

### Takeaway
When the capture machine *is* the Lake Controller PC, capturing directly on that PC with Wireshark/Npcap is sufficient and simplest, because the PC is an endpoint of every unicast flow and also receives any broadcast/multicast the device emits; SPAN/mirror ports or a two-NIC bridge only add value if you must see device<->device traffic or traffic from a *different* controller PC. Turn off NIC offloads (or expect bad checksums/oversized frames) and use the `-b` ring buffer for long captures.

### Cited Findings
- Npcap (the capture driver Wireshark uses on Windows) is "a packet capture and injection library for Windows by the Nmap Project ... a complete update to the unmaintained WinPcap project"; its license "allows end users to download, install, and use Npcap from our site for free on up to 5 systems (including commercial usage)." — [nmap/npcap GitHub](https://github.com/nmap/npcap)
- Offload caveat (important when capturing on the endpoint itself): "Offload features of a miniport driver and/or NIC mean that the version of the packet that Npcap sees within the Windows network stack may be different... evident as a zero or incorrect TCP, UDP, or IP checksum for sent packets, but it can also appear as extra-large packets... when RSC is enabled." These can be disabled in adapter properties; TCP Chimney may cause selective capture failures. — [Npcap guide source (npcap-guide.xml)](https://raw.githubusercontent.com/nmap/npcap/master/docs/npcap-guide.xml)
- Loopback: "Npcap's loopback capture is based on the Windows Filtering Platform (WFP), so it depends on the Base Filtering Engine (BFE) service." Older versions "required a Microsoft KM-TEST loopback adapter." — [Npcap guide source](https://raw.githubusercontent.com/nmap/npcap/master/docs/npcap-guide.xml). Search-result text from the (blocked) Npcap users' guide says the interface is named "NPF_Loopback" with description "Adapter for loopback capture" and data link type DLT_NULL. — [Npcap Users' Guide (snippet only; domain blocked)](https://npcap.com/guide/npcap-users-guide.html)
- Loopback frame-size oddity: a Wireshark developer reported loopback frames showing "134 bytes on wire (1072 bits), 74 bytes captured (592 bits)" i.e., reported wire length exceeds captured data. — [nmap/npcap issue #365](https://github.com/nmap/npcap/issues/365)
- VLAN: the installer's `/vlan_support` option is deprecated: "This feature was disabled in 2016 to prevent a crash and has not been re-enabled." — [Npcap guide source](https://raw.githubusercontent.com/nmap/npcap/master/docs/npcap-guide.xml). A search snippet of the Npcap changelog states newer Npcap restores the 802.1Q tag "from packet metadata if the VLAN ID is not 0, since NDIS typically strips the tag before Npcap encounters it" and that the "vlan" capture-filter keyword now works on live captures. — [Npcap changelog (snippet only; domain blocked)](https://npcap.com/changelog). These two statements refer to different mechanisms (old installer option vs. newer metadata restoration); treat VLAN-tag visibility on Windows as version-dependent and verify on the actual Npcap build.
- Wi-Fi monitor mode on Windows requires the `/dot11_support` install option; "Not all hardware or network drivers support the Native WiFi API"; "If you see a horizontal line instead of the checkbox, then it probably means that your adapter doesn't support monitor mode"; frames get Radiotap headers and encrypted traffic needs keys in Wireshark. — [Npcap guide source](https://raw.githubusercontent.com/nmap/npcap/master/docs/npcap-guide.xml)
- Admin-only mode: `/admin_only` "Restrict[s] Npcap driver's access to Administrators only" (UAC elevation via NpcapHelper.exe). — [Npcap guide source](https://raw.githubusercontent.com/nmap/npcap/master/docs/npcap-guide.xml)
- SPAN/port mirroring: "SPAN (Switched Port Analyzer) copies traffic from one or more source ports to a destination port where a packet capture device is connected"; "SPAN may drop packets during congestion (hardware limit)"; copying both directions to one port "can be a problem when the mirrored traffic is greater than the monitoring port interface speed"; "not all routers and switches support port mirroring." — [Wireshark wiki CaptureSetup/Ethernet (search snippet; domain blocked)](https://wiki.wireshark.org/CaptureSetup/Ethernet); [Industrial Monitor Direct: taps vs. mirroring](https://industrialmonitordirect.com/blogs/knowledgebase/capturing-ethernetip-io-traffic-with-wireshark-network-taps-vs-switch-port-mirroring)
- Hubs: "Using a hub in a modern automation network is strongly discouraged. It forces connected devices into half-duplex mode, induces collisions, and can cause intermittent timeouts." — [Industrial Monitor Direct](https://industrialmonitordirect.com/blogs/knowledgebase/capturing-ethernetip-io-traffic-with-wireshark-network-taps-vs-switch-port-mirroring)
- Remote capture alternatives (if the capture must run on another box): "sshdump provides interfaces to capture packets from a remote host through SSH using a remote capture binary"; on Windows sshdump "is not installed by default in the Windows version" (select it under External Capture tools in the installer); rpcapd.exe is the alternative Remote Packet Capture Protocol daemon. — [sshdump man page (snippet; domain blocked)](https://www.wireshark.org/docs/man-pages/sshdump.html); [Ask Wireshark: remote capture (snippet)](https://ask.wireshark.org/question/35288/wireshark-remote-capture/)
- tshark multiple-files/ring buffer semantics (from the tshark man page source): `-b duration:N` "switch to the next file after N seconds have elapsed"; `-b interval:N` "switch to the next file when the time is an exact multiple of N seconds"; `-b filesize:N` "switch to the next file after it reaches a size of N kB"; `-b files:N` "begin again with the first file after N number of files were written"; `-b packets:N`; `-b printname:filename` "print the name of the most recently written file to filename after the file is closed". `-a test:value` autostop (duration, filesize kB, files, packets). `-w outfile` "Write raw packet data to outfile or to the standard output if outfile is '-'". `-f` capture filter; `-Y` display filter; `-T` supports json, ek, fields, pdml with `-e` field selection and `-E` formatting; `-r infile` reads any supported format "including compressed files"; `-X lua_script:` "tells TShark to load the given script in addition to the default Lua scripts"; `-l` "Flush the standard output after the information for each packet is printed"; `-D` lists capture interfaces; `-P` decodes/prints even while writing with `-w`. — [tshark.adoc in Wireshark source](https://gitlab.com/wireshark/wireshark/-/raw/master/doc/man_pages/tshark.adoc)
- Man-page example (via search snippet): "`tshark -b filesize:1000 -b files:5` results in a ring buffer of five files of size one megabyte each." — [tshark(1)](https://www.wireshark.org/docs/man-pages/tshark.html)

### Inferences
- Recommended minimal setup: run Wireshark/tshark *on the Lake Controller PC*, on the wired NIC that talks to the device, with a capture filter narrowed to the device IP and/or broadcast (e.g. `host 192.168.1.50 or broadcast or multicast`) so the ring buffer stays small and GUI-action correlation is easy. Before capturing, disable checksum offload / LSO / RSC on that NIC (per the Npcap offload caveat) or ignore "bad checksum" flags on sent packets and expect some outbound frames to appear larger than the MTU.
- Do not use Wi-Fi on the capture PC if it can be avoided: wired Ethernet avoids monitor-mode/driver issues and matches the show-environment topology. If the device uses VLAN-tagged control traffic, verify with the actual Npcap build whether the tag is visible; Wireshark may show untagged frames.
- SPAN and taps are only needed to observe (a) device<->device traffic (e.g., Lake "frame"/sync traffic between processors) or (b) traffic from a controller you cannot install Wireshark on. A Raspberry Pi or laptop with two NICs bridged (Linux `bridge` + `tcpdump -i br0`) is an ad-hoc tap; this is standard practice but I found no fetched source specifically documenting it in this session.
- Suggested long-capture command (Windows, run from an elevated prompt; interface number from `tshark -D`):
  ```
  tshark -i 4 -f "host 192.168.1.50 or broadcast or multicast" ^
         -b filesize:51200 -b files:20 -b printname:stdout ^
         -w C:\caps\lake.pcapng
  ```
  (20 x 50 MB ring; filesize is in kB per the man page.) Add `-a duration:3600` to auto-stop. Use `dumpcap` with the same `-i/-f/-b/-w` flags for lower overhead on very long runs (dumpcap is the capture engine tshark uses; the man page text above is tshark's).

### Gaps
- Could not fetch the Wireshark wiki CaptureSetup pages (Ethernet, Loopback, WLAN) or the Npcap users' guide HTML directly; VLAN-tag behavior on current Npcap relies on a changelog search snippet.
- No source found in this session confirming how the Lake Controller talks to Lake devices at L2/L3 (e.g., whether it uses raw Ethernet frames, which Npcap can also capture); other researchers should cover the protocol itself.

---

## Key Question 2: Differential protocol analysis and Lua dissector writing

### Takeaway
The productive loop is: capture -> isolate one parameter change -> diff the payload bytes (Wireshark copy-as-hex + any diff tool, or Python with pyshark/scapy/dpkt) -> guess field types (float/int/endianness/length/seq/CRC) -> encode the guess as a Wireshark Lua dissector -> iterate. Tools with real leverage: CRC RevEng for checksums, Netzob for automated field partitioning, and a Lua dissector registered on the UDP/TCP port so every new capture is already decoded.

### Cited Findings
- Packet diffing inside Wireshark: select a packet, expand subtrees, right-click "Copy > All Visible Items", then paste into an external diff tool; this yields decoded fields, not just raw bytes. — [Nick vs Networking: Diff + Wireshark (search snippet; domain blocked)](https://nickvsnetworking.com/diff-wireshark/)
- Hex diff tools: VBinDiff "is a terminal-based interactive hex diff tool that displays both files in a split screen, highlights differing bytes"; available for Linux/macOS/Windows; development "appears to have stalled since 2017." — [Binary Compare guide](https://diffchecker.pro/blog/binary-compare/). CyberChef is "an advanced decoding tool written in Javascript" with hex conversion tools. — [Stratosphere Labs](https://www.stratosphereips.org/blog/2019/10/8/hexa-payload-decoder-tool)
- Python libraries: "PyShark ... leverages the underlying tshark installed on the system to do its work, providing tshark's powerful protocol decoding ability"; dpkt was measured "15 times better performance over scapy and 40 times better than pyshark" for bulk PCAP parsing; scapy is best for crafting/injecting test packets. — [vnetman: Analyzing packet captures with Python](https://vnetman.github.io/pcap/python/pyshark/scapy/libpcap/2018/10/25/analyzing-packet-captures-with-python-part-1.html); [OneUptime comparison](https://github.com/OneUptime/blog/blob/master/posts/2026-03-20-compare-scapy-dpkt-pyshark-ipv4/README.md)
- Netzob: "vocabulary and grammar inference component provides both passive and active reverse engineering of communication flows"; models "the message format (aka its vocabulary)" and "the state machine of a protocol (aka its grammar)"; imports "PCAP files, structured files and OSpy files"; exports models "compatible with main traffic dissectors (Wireshark and Scapy) and fuzzers (Peach and Sulley)"; "Netzob requires at least Python 3.8"; repo shows ongoing activity (5,472 commits, open issues/PRs). — [netzob/netzob GitHub](https://github.com/netzob/netzob). Academic surveys list "Protocol Informatics, Discoverer, and Polyglot" as sequence-alignment-based inference tools and Netzob as a state-of-the-art baseline still used in 2024 papers. — [Netzob overview docs (snippet; domain blocked)](https://netzob.readthedocs.io/en/latest/overview/); [DynPRE NDSS'24](https://fouzhe.github.io/publications/paper/NDSS24-DynPRE.pdf)
- CRC RevEng: "a portable, arbitrary-precision CRC calculator and algorithm finder" that "reverse-engineers any CRC algorithm from sufficient correctly formatted message-CRC pairs." Search mode `-s`; width `-w` is mandatory; "In general at least four data points are needed" (known parameters or message-CRC pairs); codewords are given as hex with message and CRC concatenated ("There must not be any non-participating characters between each message and its CRC"); "To find the Poly value when Init is not known, at least two of the given arguments must have the same length"; "When the CRC algorithm is wide, try ... to obtain a pair of codewords where the message portion differs only in the last byte or two." Examples: `reveng -w 16 -l -F -s 31816b 32c16a 31326a0a` and `reveng -w 32 -l -s c98964f6b9 a5fa49f2fd 13370aee7df0`; calculate with a preset: `reveng -m crc-32/iso-hdlc -c 414243`. — [CRC RevEng README (GitHub mirror)](https://github.com/JayBrown/reveng---CRC-RevEng); [Hackaday on CRC RevEng](https://hackaday.com/2019/06/27/reverse-engineering-cyclic-redundancy-codes/)
- Field-type heuristics from the literature: 4-byte integers appear as "big endian (8 => 00 00 00 08) or little endian (8 => 08 00 00 00)"; FieldHunter infers types "by computing statistical correlations of collected messages from multiple sessions"; typical inferred field classes are "Message Types, Message Lengths, Host Identifiers, Session Identifiers, and Transaction Identifiers such as sequence/acknowledgement numbers." — [crawlex: reverse-engineering a binary protocol](https://blog.crawlex.net/blog/reverse-engineering-binary-protocols/); [FieldHunter / survey (Hindawi)](https://www.hindawi.com/journals/scn/2018/8370341/)
- Wireshark Lua dissector API (from the WSDG source): a dissector is `Proto(name, description)`, fields are `ProtoField.uint8("multi.protocol", "Protocol", base.DEC, valuestring_table)` / `ProtoField.string(...)`, assigned via `p.fields = {...}`; the dissector callback is `function p.dissector(buf, pkt, tree)` adding `tree:add(p, buf(0,2))` and `subtree:add(f_proto, buf(0,1))`; registration is `DissectorTable.get("udp.port"):add(7555, p_multi)` and can also be on `wtap_encap`/`ip.proto`. Scripts are loaded from the personal or global plugins directory ("all files ending with .lua ... processing them in ASCIIbetical order"), `init.lua` is a package entry point, and `-X lua_script:` loads a script from the command line (`-X lua_scriptN:` passes args). — [wsdg_lua_support.adoc](https://gitlab.com/wireshark/wireshark/-/raw/master/doc/wsdg_src/wsdg_lua_support.adoc); wiki example snippet: `udp_table = DissectorTable.get("udp.port")` then `udp_table:add(7777,trivial_proto)` — [Wireshark wiki Lua/Dissectors (snippet; domain blocked)](https://wiki.wireshark.org/Lua/Dissectors)
- Time-window filtering to line packets up with a GUI action log: `(frame.time >= "Dec 29, 2014 19:00:00") && (frame.time <= "Dec 29, 2014 20:00:00")` or `frame.time_epoch in {<first epoch> .. <last epoch>}`; timestamp format `"MMM DD, YYYY HH:MM:SS"`. — [Ask Wireshark: time range filter (snippet)](https://ask.wireshark.org/question/33466/how-to-filter-pcap-file-with-time-range-as-display-filter-using-tshark/); [Ask Wireshark: ignore before/after timestamps (snippet)](https://ask.wireshark.org/question/2664/is-it-possible-to-filter-to-ignore-capture-before-and-after-a-particular-time-stamps/)

### Inferences
- Practical differential workflow: (1) capture a baseline with no GUI activity for 30 s to learn keepalive/meter/poll traffic and its period; (2) perform exactly one change (e.g., gain +0.5 dB on one channel), wait, revert; (3) use `tshark -r cap.pcapng -Y "udp.port==N && frame.time_epoch >= X && frame.time_epoch <= Y" -T fields -e frame.number -e data.data` to dump payload hex for the window and diff the two states; (4) repeat with a different value of the same parameter to isolate which bytes move and how; (5) sweep the parameter across a known range and plot bytes-vs-value to distinguish IEEE754 float (mantissa bits change smoothly, exponent byte steps at powers of two, e.g., 0x3F800000 = 1.0f), fixed-point/int (linear steps), and dB vs linear encodings.
- Cheap Python heuristics (no source needed; standard library): for each candidate 4-byte window use `struct.unpack('<f'/'>f'/'<i'/'>i'/'<H'...)` and keep interpretations that are (a) monotonic with the GUI value across the sweep and (b) plausible in range; bytes that increment by one per packet are sequence numbers; a 16/32-bit field whose value equals (payload length - k) is a length; a trailing 1-4 bytes that change whenever *anything* else changes are checksum/CRC candidates -> feed message+CRC pairs to `reveng -w 16 -s ...` / `-w 32 -s ...`, choosing pairs that differ only in the last byte or two (per the RevEng README tip). Try simple sums/XORs before CRC.
- Minimal Lua skeleton (constructed from the WSDG API above; register on the observed UDP port; place in `%APPDATA%\Wireshark\plugins\` on Windows or `~/.local/lib/wireshark/plugins/` on Linux/macOS, then Analyze > Reload Lua Plugins (Ctrl+Shift+L), or run `tshark -X lua_script:lake.lua -r cap.pcapng`):
  ```lua
  local lake = Proto("lake", "Lake Controller (RE)")
  local f_magic = ProtoField.uint16("lake.magic", "Magic",   base.HEX)
  local f_seq   = ProtoField.uint16("lake.seq",   "Seq",     base.DEC)
  local f_type  = ProtoField.uint8 ("lake.type",  "MsgType", base.HEX, { [0x10]="SetParam", [0x11]="Ack" })
  local f_len   = ProtoField.uint16("lake.len",   "Length",  base.DEC)
  local f_val   = ProtoField.float ("lake.val",   "Value (guess f32 LE)")
  local f_rest  = ProtoField.bytes ("lake.rest",  "Undecoded")
  lake.fields = { f_magic, f_seq, f_type, f_len, f_val, f_rest }

  function lake.dissector(buf, pinfo, tree)
    if buf:len() < 7 then return 0 end
    pinfo.cols.protocol = "LAKE"
    local t = tree:add(lake, buf())
    t:add(f_magic, buf(0,2))
    t:add_le(f_seq, buf(2,2))          -- use add_le for little-endian fields
    t:add(f_type,  buf(4,1))
    t:add_le(f_len, buf(5,2))
    if buf:len() >= 11 then t:add_le(f_val, buf(7,4)) end
    if buf:len() > 11 then t:add(f_rest, buf(11)) end
    return buf:len()
  end

  DissectorTable.get("udp.port"):add(12345, lake)   -- replace with observed port
  -- For TCP: DissectorTable.get("tcp.port"):add(12345, lake)
  -- Or leave unregistered and use Analyze > Decode As... > LAKE on the port.
  ```
  Grow this incrementally: start with `f_rest` only, then move bytes out of `rest` as each field is understood. Put value-string tables for message types as they are identified so the packet list column becomes readable.
- If the protocol is TCP-based, add a `dissect_tcp_pdus`-style reassembly step (length-prefixed framing) once the length field is known; Wireshark's Lua API supports `pinfo.desegment_len` for this (standard WSDG behavior; not separately verified in this session).

### Gaps
- Could not access the Wireshark wiki, WSUG, or `ask.wireshark.org` directly; the Lua skeleton is written from the WSDG source example plus API knowledge and should be syntax-checked in Wireshark (`add_le` and `ProtoField.float` are standard Lua API calls but were not verified against a fetched page this session).
- Wireshark's old GTK-era "Statistics > Compare" (two-capture comparison) feature: I could not verify whether it still exists in current Qt Wireshark 4.x; treat it as unavailable and use external diff.
- "Protocol Informatics" (PI project) original site was not reachable; it is referenced only via secondary surveys.

---

## Key Question 3: Reproducible GUI driving on Windows and timestamp correlation

### Takeaway
pywinauto (UIA backend) or AutoHotkey can script Lake Controller actions and write a timestamped action log; the pcap and the log share the PC clock, so `frame.time_epoch` window filters (or a merged JSON timeline) tie each action to its packets. Screen recording via OBS/ffmpeg with a `%{localtime}` overlay, plus OCR only if the GUI is not automatable, is the fallback.

### Cited Findings
- pywinauto: "a set of python modules to automate the Microsoft Windows GUI ... send mouse and keyboard actions to windows dialogs and controls"; backends: `backend="win32"` (default) for "MFC/VB6/VCL/simple WinForms" and `backend="uia"` for "WinForms, WPF, Store apps, Qt5, browsers". Minimal usage: `Application(backend="uia").start('notepad.exe')`, `app.Window.Control.click()`, `type_keys()`, `invoke()`, `menu_select()`, and `print_control_identifiers()` to dump the control tree. Inspection tools referenced: Inspect.exe and py_inspect. — [pywinauto GitHub README](https://github.com/pywinauto/pywinauto); [pywinauto docs (snippet; domain blocked)](https://pywinauto.readthedocs.io/en/latest/getting_started.html)
- AutoHotkey logging: `A_Now` returns local time as `YYYYMMDDHH24MISS`; `FormatTime` converts it; in v2 `FileAppend FormatTime(, "HH:mm") '\`n', logFile` appends a timestamp; use `HH` (24h) for sortable logs. — [AutoHotkey Community: cleaner timestamp for logging](https://www.autohotkey.com/boards/viewtopic.php?t=113128); [AutoHotkey Community: record timestamps](https://www.autohotkey.com/boards/viewtopic.php?t=91592)
- Wireshark time-range display filter: `(frame.time > "Apr 5, 2018 10:00:00") && (frame.time < "Apr 5, 2018 12:00:00")` or `frame.time_epoch in {A .. B}`. — [Ask Wireshark (snippet)](https://ask.wireshark.org/question/33466/how-to-filter-pcap-file-with-time-range-as-display-filter-using-tshark/)
- tshark can emit `-T json`, `-T ek`, or `-T fields -e ...` with `-E` separators, and `-l` flushes per packet for live pipelines. — [tshark.adoc](https://gitlab.com/wireshark/wireshark/-/raw/master/doc/man_pages/tshark.adoc)
- ffmpeg on Windows: `-f gdigrab -framerate 30 -i desktop ... -c:v libx264 -preset ultrafast -pix_fmt yuv420p` records the screen; the `drawtext` filter with `text='%{localtime}'` (or `%{pts:hms}`) burns a clock into the video. — [ffmpeg-cookbook: screen recording (snippet; domain blocked)](https://ffmpeg-cookbook.com/en/articles/screen-recording/); [OTTVerse drawtext guide](https://ottverse.com/ffmpeg-drawtext-filter-dynamic-overlays-timecode-scrolling-text-credits/)
- Tesseract OCR engine (open source) — [tesseract-ocr/tesseract](https://github.com/tesseract-ocr/tesseract) (tool reference only; no OCR-of-audio-GUI source found).

### Inferences
- Because Lake Controller's UI toolkit is unknown (it is a legacy, heavily custom-drawn touchscreen-style app), first run `print_control_identifiers()` or Inspect.exe against it. If controls are exposed via UIA, drive them by name; if the app is custom-drawn, fall back to coordinate clicks (`click_input(coords=...)` / AHK `Click x,y`) with the window maximized at a fixed resolution so coordinates are reproducible.
- Correlation recipe: (1) sync nothing external, everything runs on the same PC clock; (2) the automation script writes one line per action as JSON (`{"t": <unix epoch float>, "action": "gain", "ch": 3, "value": -6.0}`) *before* and *after* the click; (3) after capture, `tshark -r cap.pcapng -T ek` or `-T fields -e frame.time_epoch -e udp.srcport -e udp.dstport -e data.data` produces a packet timeline; (4) a small Python join assigns packets within [t_action - 50 ms, t_action + 500 ms] to that action and excludes packets that also appear in the idle baseline (polls/meters). Wait 1-2 s between actions so windows do not overlap.
- Minimal pywinauto sketch (illustrative; control names must come from `print_control_identifiers()`):
  ```python
  import json, time
  from pywinauto import Application
  app = Application(backend="uia").connect(title_re=".*Lake Controller.*")
  win = app.top_window()
  def log(**kw):
      kw["t"] = time.time(); open("actions.jsonl","a").write(json.dumps(kw)+"\n")
  log(action="begin", desc="ch3 gain -6dB")
  win.click_input(coords=(812, 640))      # fallback: fixed coordinates
  win.type_keys("-6{ENTER}")
  log(action="end")
  time.sleep(2)
  ```
- Screen recording with a burned-in clock is mainly useful for a *human or remote agent* reviewing what was done; for machine correlation the JSON action log is better. OCR (Tesseract) of parameter fields is only worth it if the GUI cannot be scripted and you need to recover displayed values after the fact.

### Gaps
- Nothing was found about Lake Controller's UI framework or UIA exposure; the backend choice (win32 vs uia vs coordinates) must be determined empirically.
- Windows UI Automation (native, via C#/PowerShell `System.Windows.Automation` or FlaUI) was not researched beyond pywinauto's use of it.

---

## Key Question 4: Remote observation by an AI assistant (screen + pcaps)

### Takeaway
The most practical pattern is asynchronous: capture and GUI logs are produced on the Windows PC and pushed as files (pcapng + JSONL + optional MP4) to a place the agent can read; live screen viewing is possible through a browser-based remote desktop (Apache Guacamole for RDP/VNC in HTML5) or Claude in Chrome / desktop computer-use, but a cloud agent should never be given raw inbound access to the show LAN. A UDP relay to a cloud endpoint is technically trivial but a security anti-pattern for a control network.

### Cited Findings
- Apache Guacamole is "a clientless remote desktop gateway that supports standard protocols like VNC, RDP, and SSH", delivered "through HTML5"; `guacd` speaks RDP/VNC/SSH to targets and the Java web client serves the browser UI; Apache-2.0 licensed. — [Guacamole overview (xTom)](https://xtom.com/blog/how-to-setup-apache-guacamole-for-clientless-remote-desktop-access-via-web-browser/); [Wikipedia: Apache Guacamole](https://en.wikipedia.org/wiki/Apache_Guacamole)
- Claude in Chrome (Anthropic's browser extension) "reads pages you're signed into and takes screenshots to see content", "clicks, types, and fills forms", works across grouped tabs, is "available on all paid plans only", offers a "Permissions Mode" requiring site-by-site approval, and pauses before "purchases, financial actions, and other one-way doors"; a separate safety check reviews actions for prompt injection. — [claude.com/chrome](https://claude.com/chrome)
- CloudShark is "a hosted packet-analysis platform for examining PCAP ... through a web interface" that applies "Wireshark-style protocol dissection and display filtering" and lets analysis "be shared with a URL". — [QA Cafe CloudShark](https://www.qacafe.com/analysis-tools/cloudshark)
- Remote capture: sshdump lets Wireshark run "a remote capture binary" over SSH; rpcapd.exe is the Windows Remote Packet Capture Protocol daemon; on Windows sshdump must be selected during install under External Capture tools. — [sshdump(1) (snippet)](https://www.wireshark.org/docs/man-pages/sshdump.html); [Ask Wireshark (snippet)](https://ask.wireshark.org/question/35288/wireshark-remote-capture/)
- tshark streaming formats: `-T ek` (Elasticsearch bulk JSON lines) and `-T json`, with `-l` per-packet flushing, and `-w -` to write raw pcap to stdout. — [tshark.adoc](https://gitlab.com/wireshark/wireshark/-/raw/master/doc/man_pages/tshark.adoc)

### Inferences
- Recommended "share with Claude" pipeline, lowest risk first:
  1. **Files, not live access.** Ring-buffer pcapng files (Q1 command) + `actions.jsonl` + optional screen MP4 land in a synced folder (OneDrive/Dropbox/Google Drive) or are pushed to a private git repo / cloud bucket; the agent (cloud container) pulls them and runs `tshark -r ... -T json` itself. This needs no inbound ports on the show LAN.
  2. **Structured live stream (outbound only).** On the PC: `tshark -i 4 -f "host 192.168.1.50" -l -T ek | <ssh/websocket client> remote:port` (or `-T fields -e frame.time_epoch -e data.data`) so the agent gets decoded JSON lines in near real time. Outbound only; the PC initiates.
  3. **Live screen.** Claude desktop "computer use" or Claude in Chrome viewing a browser tab that shows the Windows desktop via Guacamole (RDP/VNC->HTML5) or a vendor remote-desktop web client. The agent can then see Lake Controller and Wireshark side by side. Screenshots are periodic, not video; combine with the burned-in clock from Q3 so the agent can quote the time it saw.
  4. **Avoid**: exposing rpcapd or a raw UDP mirror of the control network to the internet. rpcapd has no built-in encryption in its default mode and a UDP relay would let anything that reaches the cloud endpoint inject packets toward the amps. If a relay is used at all, make it one-directional (mirror only), bind it to a VPN (WireGuard/Tailscale) and never forward agent-originated packets to the device network during a show.
- Security cautions to state in the report: treat the amp control VLAN as production; keep the capture PC's remote-desktop reachable only over a VPN; keep pcaps (which may contain device credentials or config dumps) in private storage; and note that a remote agent acting on the Windows GUI could change live audio parameters.

### Gaps
- Anthropic's support article on Claude in Chrome and the computer-use documentation were blocked; capability statements above come from the product page only, and rate/limits on screenshot frequency were not found.
- rpcapd security posture (null auth vs. TLS mode in current Npcap/libpcap) was not verified this session.

---

## Key Question 5: iPadOS networking constraints (iOS 14-26)

### Takeaway
Unicast UDP/TCP to the device on the LAN works from any iPad app with Network.framework after the user accepts the Local Network prompt (no special entitlement). Sending or receiving UDP *broadcast or multicast* on a real iOS/iPadOS device additionally requires the Apple-approved `com.apple.developer.networking.multicast` entitlement (iOS 14+), and Apple DTS states plainly that Network.framework cannot do UDP broadcast -- you must use BSD sockets bound to a specific interface (multicast can use NWConnectionGroup). Background execution is not available for a UDP controller: once suspended, "everything just stops," so design for foreground use plus fast reconnect.

### Cited Findings
**Local Network privacy (which operations prompt)**
- "Outgoing traffic to a local network address requires local network access." Table (TN3179): outgoing TCP connect = yes; listening/accepting TCP = no; sending UDP unicast = yes; sending UDP multicast = yes; sending UDP broadcast = yes; connecting a UDP socket = yes; receiving UDP unicast = no; receiving UDP multicast = yes; receiving UDP broadcast = yes. "The system implements these TCP and UDP checks deep in the networking stack, and thus they apply to all networking APIs. This includes Network framework, BSD Sockets, URLSession..." — [Apple TN3179 Understanding local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
- "A local network is an IP network associated with a broadcast-capable network interface. Such interfaces include Wi-Fi and Ethernet, but not cellular (WWAN) or VPN. In addition, all multicast addresses (224.0.0.0/4, ff00::/8) and the IPv4 broadcast address (255.255.255.255) are local network addresses." — [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
- Privilege states: "Undetermined, Allowed, Denied. ... The first time it performs a local network operation, the system presents the local network alert." Background: "If an iOS app is in the background and performs a local network operation while its Local Network privilege is undetermined, the system denies that operation without presenting the local network alert." — [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
- Info.plist: "If your app accesses the local network, add the `NSLocalNetworkUsageDescription` property to its Info.plist"; "If your app's local network usage involves registering or browsing for specific Bonjour services, add a list of service types to the `NSBonjourServices` property"; for extensions, put both keys in the *app's* Info.plist. — [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy); [NSLocalNetworkUsageDescription doc](https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription)
- Triggering the prompt deliberately: "There's no API to explicitly bring up the local network privacy alert (FB8711182), but you can do this implicitly ... connect a UDP socket to a local network address. This triggers the local network alert without generating any network traffic." — [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
- Denial detection: the system "may deny the operation immediately, before the user has responded to the alert"; use "an API that supports waiting for connectivity, like Network framework"; check `connection.currentPath?.unsatisfiedReason == .localNetworkDenied` in `.waiting`; "If the user subsequently changes the Local Network privilege ... the system automatically retries the connection." Bonjour denial = `kDNSServiceErr_PolicyDenied` (-65570). — [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
- Simulator: "The simulator doesn't support local network privacy. Test your local network privacy behavior on a real device." Reset on iOS: delete the app, or Settings > General > Transfer or Reset > Reset > Reset Location & Privacy. — [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
- Version notes: "iOS 18 had a bug (FB14321888) that could cause the in-memory and persistent state of local network privacy to get out of sync after changing the user preference multiple times. This bug was fixed in iOS 18.6." macOS gained local network privacy in macOS 15 (bugs fixed in 15.1). — [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy). Developer reports of inconsistent enforcement across iOS 17.x/18.x exist. — [Apple Forums thread 790307](https://developer.apple.com/forums/thread/790307)
- Interface names: "Some iOS apps assume that the Wi-Fi interface name is always en0. This isn't a valid assumption. BSD interface names ... aren't considered API on any Apple platform." Use `getifaddrs` + `SIOCGIFFUNCTIONALTYPE` to pick interfaces by type. — [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)

**Multicast/broadcast entitlement**
- "Your app must have this entitlement to send or receive IP multicast or broadcast on iOS. It also allows your app to browse and advertise arbitrary Bonjour service types." Availability: iOS 14.0+, iPadOS 14.0+, visionOS 1.0+. "This entitlement requires permission from Apple before you can use it in your app. Request permission from the Multicast Networking Entitlement Request page." — [Entitlement reference](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.multicast); request form: https://developer.apple.com/contact/request/networking-multicast
- TN3179 table: on iOS the entitlement is required for sending UDP multicast, sending UDP broadcast, receiving UDP multicast, receiving UDP broadcast, and for "Working with arbitrary Bonjour service types" / "Browsing for all advertised service types"; "The multicast entitlement isn't required on macOS." Unicast send/receive is *not* in the entitlement table. — [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
- "You can test your app using the iOS and iPadOS simulators without an active entitlement, but using multicast and broadcast networking on physical hardware requires the entitlement." Apple recommends Bonjour for discovery, which needs only Info.plist declarations. — [Apple News: How to use multicast networking in your app](https://developer.apple.com/news/?id=0oi77447)
- Approval experience (anecdotal, 2020 thread): approval arrived after "approximately 5 calendar days"; "No automatic acknowledgment email"; one requester's justification was that the app "relies on UDP broadcasts for legacy functionality." — [Apple Forums thread 666240](https://developer.apple.com/forums/thread/666240)
- Enforcement timing: "The multicast entitlement restriction appears to be enforced inconsistently across devices" in early iOS 14 (worked on some older iPads, failed on newer). — [Apple Forums thread 666240](https://developer.apple.com/forums/thread/666240)

**Network.framework vs BSD sockets for broadcast/multicast**
- TN3151: "Network framework is by far the best choice. BSD Sockets is an acceptable choice if you have compatibility constraints"; "For UDP flows—where you have a sequence of unicast datagrams flowing between two peers—Network framework is the best choice"; "Network framework supports UDP multicast using the NWConnectionGroup class, but that support has limits and, specifically, it does not support UDP broadcast." "Regardless of the API you use, if you work with multicast or broadcast UDP on iOS, iPadOS, or visionOS, you must have the multicast networking entitlement." — [Apple TN3151 Choosing the right networking API](https://developer.apple.com/documentation/technotes/tn3151-choosing-the-right-networking-api)
- Quinn (Apple DTS), "Broadcasts and Multicasts, Hints and Tips" (posted 2025-01-16, revised 2025-09-01): Network framework's broadcast support is "so limited as to be useless in practice" (r. 122924701); multicast works via `NWConnectionGroup` + `NWMulticastGroup` (IPv4 only); "Prefer Network framework over BSD Sockets, except for UDP broadcasts and multicasts." Sending "Must target a specific interface"; receiving can bind to all broadcast-capable interfaces. Bind by interface *index* with `IP_BOUND_IF` (IPv4) / `IPV6_BOUND_IF`, from `if_nametoindex()`, not by address; do not hard-code `en0`; set `SO_BROADCAST` to send; `SO_REUSEADDR`/`SO_REUSEPORT` and bind `0.0.0.0:port` to receive. 255.255.255.255 behavior "is platform-dependent and can change; write code to be interface-specific to avoid surprises." Broadcasts are not necessarily faster than unicasts on Wi-Fi. — [Apple Forums thread 772642](https://developer.apple.com/forums/thread/772642)
- iOS 18 regression report: NWConnection to 255.255.255.255 that worked on iOS 17 failed on iOS 18 with "no route to host"/"Network is down" even with the entitlement; Quinn: "Much as I'm a huge fan of Network framework, it's not currently capable of dealing with UDP broadcasts" and "when you do this wrongly, your code ends up relying on undefined behaviour." — [Apple Forums thread 771139](https://developer.apple.com/forums/thread/771139)
- iPadOS 26 regression report (Oct 2025): NWConnection UDP broadcast that worked on iPadOS 18 fails with `sendmsg ... [13: Permission denied]` despite granted entitlement, regenerated profile, NSLocalNetworkUsageDescription and Local Network allowed; Quinn: "NWConnection isn't really set up to deal with UDP broadcasts... My advice, sadly, is that you use BSD Sockets for this", and "when working with broadcasts and multicasts, you should target a specific interface." — [Apple Forums thread 805719](https://developer.apple.com/forums/thread/805719)
- NWConnectionGroup: "An object you use to communicate with a group of endpoints, such as an IP multicast group on a local network"; iOS 14.0+; `start(queue:)` "Joins the group, registers to receive messages"; `send(content:to:message:completion:)` "Sends data to the entire group, or to a specific member"; `setReceiveHandler(...)` receives inbound messages; `NWMulticastGroup` is "A descriptor for a group you use to join an IP multicast group". Example from Apple: `NWMulticastGroup(for: [.hostPort(host: "224.0.0.251", port: 5353)])` then `NWConnectionGroup(from: multicast, using: .udp)`. — [NWConnectionGroup docs](https://developer.apple.com/documentation/network/nwconnectiongroup); [Apple News multicast article](https://developer.apple.com/news/?id=0oi77447)
- Interface selection in Network.framework: `NWParameters.requiredInterface` ("A specific interface to require on connections, listeners, and browsers", iOS 12+), `requiredInterfaceType`, `prohibitedInterfaceTypes`. — [NWParameters.requiredInterface](https://developer.apple.com/documentation/network/nwparameters/requiredinterface)
- `NWConnection(host:port:using:)` "Initializes a new connection to a host and port", iOS 12+. — [NWConnection init](https://developer.apple.com/documentation/network/nwconnection/init(host:port:using:))

**Background execution**
- "The general rule for networking in the background on iOS is that everything works as long as your process is running. Once your process gets suspended, you start running into edge cases"; "if the app gets suspended, there's no way to resume it based on UDP traffic"; recommended: "shut down your networking when you move to the background and restore it when you move to the foreground. Network framework doesn't do anything to help you out here." — [Apple Forums 757385](https://developer.apple.com/forums/thread/757385); [Apple Forums 41232](https://developer.apple.com/forums/thread/41232); [Apple Forums 765841](https://developer.apple.com/forums/thread/765841)
- Art-Net/sACN lighting-control thread (Apr 2026): "UDP receive stops reliably ~30 seconds after the screen locks"; Quinn: "There's no special affordance for UDP. So, your question is equivalent to 'How can my app run indefinitely in the background?'"; UIRequiresPersistentWiFi "only takes an effect when your app is in the foreground"; VoIP and Network Extension routes are not applicable; per TN2277 "If your app does get suspended, normal networking will just stop." — [Apple Forums 822012](https://developer.apple.com/forums/thread/822012)
- `UIRequiresPersistentWiFi`: "If YES, iOS opens a Wi-Fi connection when the app launches and keeps it open while the app is running. If NO, iOS closes the active Wi-Fi connection after 30 minutes." — [UIRequiresPersistentWiFi doc](https://developer.apple.com/documentation/bundleresources/information-property-list/uirequirespersistentwifi)

**Wired Ethernet on iPad**
- USB-C iPads (2018+ iPad Pro, 2020+ iPad Air, 2021 iPad mini, iPad 10) "can connect directly to USB-C Ethernet adapters"; iPadOS shows "a new Ethernet option in the Settings list underneath the Wi-Fi option"; "not all are compatible with iPad; ensure that you select an Adapter that explicitly states compatibility with iPad." — [9to5Mac: use Ethernet with iPad (snippet; domain blocked)](https://9to5mac.com/2023/05/17/use-ethernet-with-ipad/); [slatepad: Wired Internet on iPad (snippet)](https://slatepad.org/2025/06/08/ipad-ethernet/)
- Audinate (Dante AVIO USB-C) on iPad: USB-C iPads "can be connected directly to a Dante AVIO USB-C Adapter with a USB-C to USB-C cable"; "USB-C to Lightning cables do not support the host/peripheral roles required" — Lightning iPads need a Lightning-to-USB (type-A) camera adapter. — [Dante Support FAQ (snippet; domain blocked)](https://www.getdante.com/support/faq/do-the-dante-avio-usb-c-adapters-operate-with-lightning-to-usb-c-cables-to-allow-direct-connection-of-audio-and-power-to-a-ios-device/). Note: this concerns USB *audio* adapters, not Ethernet; Audinate's macOS guidance favors Realtek RTL8156 (USB CDC-NCM) USB Ethernet adapters for Dante — [Dante Support: DVS USB Ethernet adaptor choice for macOS](https://support.getdante.com/hc/en-gb/articles/5484806190367-DVS-USB-Ethernet-Adaptor-Choice-for-macOS-Systems)

### Inferences
- **What the Lake iPad app needs by traffic class**:
  - Unicast UDP/TCP to a known device IP: Network.framework `NWConnection`, plus `NSLocalNetworkUsageDescription`; the user sees the Local Network prompt once. No entitlement. (TN3179 tables.)
  - Discovery via broadcast (255.255.255.255 or subnet-directed) or receiving device broadcasts: entitlement required (iOS 14+), and per DTS use BSD sockets with `SO_BROADCAST` + `IP_BOUND_IF` on the chosen interface; expect NWConnection-to-broadcast to break across OS releases (documented regressions on iOS 18 and iPadOS 26).
  - Multicast: entitlement required; `NWConnectionGroup`/`NWMulticastGroup` is the supported Network.framework path.
  - If the protocol *only* needs broadcast for discovery, the app can ship without the entitlement by letting the user type the device IP (or scanning a /24 with unicast probes), and add broadcast discovery later once the entitlement is granted. Apple's own guidance steers toward Bonjour, which Lake devices are not known to advertise (gap).
- **Entitlement approval odds**: Apple documents no criteria; anecdotes show approvals within about a week for apps whose legacy protocol needs broadcast. A "control app for a specific hardware family whose discovery protocol is UDP broadcast" is exactly the case Apple's form targets, so approval is plausible but not guaranteed; request it early because the entitlement is also needed in the provisioning profile before device testing of broadcast paths (simulator ignores it).
- **Interface binding / Ethernet vs Wi-Fi**: for show use, a USB-C Ethernet adapter gives deterministic connectivity; iPadOS treats it as a broadcast-capable local interface (TN3179 definition includes Ethernet). For unicast, `NWParameters.requiredInterfaceType = .wiredEthernet` (or `requiredInterface`) pins the path; for broadcast via BSD sockets, enumerate interfaces with `getifaddrs` and bind by index. Do not hard-code `en0`/`en3`. Reliability data for specific adapters under show conditions was not found (gap); prefer adapters explicitly listed as iPad-compatible and test link-loss/re-plug behavior.
- **Backgrounding**: the controller must assume it is foreground-only. Tear down/reconnect on `scenePhase` changes; set `UIRequiresPersistentWiFi` (Wi-Fi case) and Guided Access / auto-lock off on the show iPad; treat a suspended app as "not connected" in the UI. No background mode exists for a UDP controller (DTS, 2026).
- **MTU**: no Apple-specific constraint found; keep control datagrams well under 1400 bytes so they traverse Wi-Fi and any VPN unchanged (general practice; unsourced).
- **Bridge/proxy alternative** (Raspberry Pi on the amp LAN speaking the raw Lake protocol, iPad speaking TCP/WebSocket to the Pi): pros -- no multicast entitlement, no BSD-socket broadcast code on iOS, one place to implement discovery/retries/rate-limiting, the Pi can also run the pcap/decoder for debugging, and it can hold state while the iPad is suspended; cons -- one more device and power supply in the rack, extra hop of latency and a new failure point, Bonjour or a fixed IP is still needed to find the Pi (Bonjour needs only Info.plist keys), and the Pi must be secured. For a show-critical tool, the bridge is the lower-risk path to a first working version; the native-broadcast path is the better end state if the entitlement is granted.
- **Minimal Swift sketch (unicast UDP, Network.framework)** -- illustrative, assembled from the documented APIs above:
  ```swift
  import Network

  final class LakeLink {
      private let conn: NWConnection
      init(host: String, port: UInt16, wired: Bool = false) {
          let params = NWParameters.udp
          if wired { params.requiredInterfaceType = .wiredEthernet }
          conn = NWConnection(host: NWEndpoint.Host(host),
                              port: NWEndpoint.Port(rawValue: port)!, using: params)
          conn.stateUpdateHandler = { [weak self] state in
              if case .waiting = state,
                 self?.conn.currentPath?.unsatisfiedReason == .localNetworkDenied {
                  // show "Local Network access denied" UI (TN3179)
              }
              if case .ready = state { self?.receiveLoop() }
          }
          conn.start(queue: .global(qos: .userInitiated))
      }
      func send(_ data: Data) {
          conn.send(content: data, completion: .contentProcessed { _ in })
      }
      private func receiveLoop() {
          conn.receiveMessage { [weak self] data, _, _, error in
              if let d = data { /* decode Lake reply */ _ = d }
              if error == nil { self?.receiveLoop() }
          }
      }
  }
  ```
  For a listener on a fixed local port (device sends unsolicited unicast replies): `NWListener(using: .udp, on: 12345)` with `newConnectionHandler`. For broadcast send/receive use the BSD-socket pattern quoted from Quinn's thread (SO_BROADCAST, IP_BOUND_IF by index, bind 0.0.0.0:port with SO_REUSEADDR/SO_REUSEPORT, and a Dispatch read source for async receive).

### Gaps
- Apple publishes no approval criteria or SLA for the multicast entitlement; evidence is anecdotal and from 2020.
- No Apple document states whether an *Ethernet adapter* interface is treated differently from Wi-Fi for the Local Network prompt (TN3179 groups both as local); no data on adapter reliability for iPad in live-sound use.
- MTU behavior on iPadOS USB Ethernet adapters and `NWListener` behavior when the device's unsolicited replies are broadcast (which would need the entitlement even to receive) could not be verified.
- Whether Lake devices advertise any mDNS/Bonjour service (which would avoid the entitlement for discovery) was out of scope and unverified.

---

## Key Question 6: App architecture for a show-critical controller

### Takeaway
Open-source OSC mixer controllers show the workable pattern: a single connection object with a serialized state store, periodic keepalive/subscription refresh, meter data coalesced into one blob at a modest rate, UI updates throttled/batched, and reconnection driven by foreground/background transitions. Prefer echo-confirmed state (apply device replies) with an optimistic local overlay only for the control being touched.

### Cited Findings
- X32Remote (SwiftUI iOS app for Behringer X32/M32 over OSC/UDP, port 10023): sends `/xremote` keep-alive "every 10 seconds"; changed meter polling "from sending 32 messages per 200ms to one /meters/1 blob per 500ms"; changed OSC state sync "from rebuilding full UI per message to 100ms throttled batching"; `X32Client.state` reads/writes protected by `NSLock`; requires Local Network access ("local network access to connect to X32/M32 mixers"); code split into `Sources/X32RemoteCore/` (protocol/state) and `App/Views/`, `App/Components/` (SwiftUI). — [glaypan/X32Remote](https://github.com/glaypan/X32Remote)
- Swift OSC libraries usable as templates for a UDP protocol layer: swift-osc "Modular: use one of the provided TCP/UDP network I/O layers, or implement your own" (CocoaAsyncSocket or SwiftNIO back-ends; iOS/macOS/Linux/Android). — [orchetect/swift-osc](https://github.com/orchetect/swift-osc); OSCKit — [orchetect/OSCKit](https://github.com/orchetect/OSCKit); C reference implementations for X32 (pmaillot) — [pmaillot/X32-Behringer](https://github.com/pmaillot/X32-Behringer)
- Network.framework recommended "waiting for connectivity" behavior and automatic retry after the user grants Local Network access (see Q5) — [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
- Lake control via third-party ecosystems: a Bitfocus Companion module for Lab.gruppen PLM/D series was requested (Jan 2022) noting "Qsys has a great plugin using the API already"; the request is marked Stale and no module was built. — [bitfocus/companion-module-requests #710](https://github.com/bitfocus/companion-module-requests/issues/710)

### Inferences
- Architecture sketch: `LakeTransport` (NWConnection per device; BSD broadcast socket only for discovery) -> `LakeCodec` (pure functions, unit-testable against pcap-derived fixtures; the same fixtures drive the Lua dissector) -> `DeviceStore` (actor or lock-protected model with monotonically applied device echoes) -> SwiftUI views via `@Observable`. Keep the codec platform-agnostic so it can also run in a Pi bridge or a test harness.
- State reconciliation: apply device-confirmed values as truth; while a fader is being dragged, show the optimistic local value and suppress echoes for that one parameter until N ms after touch-up, then reconcile. Rate-limit sends per control (e.g., 20-50 Hz) to avoid flooding and to keep sequence handling simple; if the protocol has sequence numbers/acks (to be determined in RE), track outstanding requests and resend on timeout.
- Reconnection: treat `.waiting`/`.failed` and app-suspension as disconnect; on foreground, re-create connections and re-request a full state snapshot rather than trusting stale state (DTS guidance that networking stops when suspended). For multiple devices, one connection per device plus a discovery pass (broadcast if entitled, otherwise last-known IPs + unicast probe sweep).
- Show-safety features worth designing in: a "lock" mode to prevent accidental changes, clear connected/stale indicators per device, and never auto-sending cached values on reconnect without confirmation.

### Gaps
- No open-source iPad Lake or Lab.gruppen controller was found; Mixing Station (closed source) was not researched because the search budget was exhausted before that query ran.
- No fetched source specifically documents optimistic-vs-echo reconciliation for audio controllers; the pattern above is an inference from X32Remote's throttling/keepalive design and general practice.
