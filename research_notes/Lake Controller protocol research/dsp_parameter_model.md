# Lake Processing Signal-Flow and Parameter Model (as exposed in Lake Controller)

**Purpose:** inventory of Lake frame/module parameters, ranges, steps and display units, organised by signal-flow position, to plan a one-parameter-at-a-time packet-capture campaign.

**Access caveat (read first).** This research ran under a hard egress restriction. Every primary source (Lake Controller Operation Manual mirrors at prodgsystems.com, eviaudio.fr, m3-eventtechnik.at, beetech-inc.com; PLM/PLM+/LM/D-series manuals at fullcompass.com, huss-licht-ton.de, manualslib, manualsdir, manualzz, scribd, studylib, silo.tips, yumpu, archive.org; Lab.gruppen/Music Tribe sites; adamson.ai release notes; felusch.de; eclipseaudio.com; mixonline.com; audiotechnology.com; liveforsound.com datasheet) was blocked at the proxy, and the WebSearch budget was exhausted mid-task. Only GitHub was reachable. Consequently:

- **CONFIRMED** = quoted or closely paraphrased text surfaced in search-engine snippets of the named document (URL given). The page could not be opened, so section/page references are as reported by the snippet.
- **UNVERIFIED** = recollection of the Lake Controller / PLM manuals from training data, or an inference. These are listed separately so the capture operator can confirm them live in the GUI tomorrow (the GUI itself shows min/max when a fader is dragged to its end stops, and the step size when nudged).
- Nothing in the tables is invented; where no source exists the cell says "not found".

**Key document set the capture team should have on hand tomorrow (all exist, all were blocked here):**

- Lake Controller Operation Manual Rev 1.6.1 (OM-LC): https://www.eviaudio.fr/wp-content/uploads/2020/04/Lake_Controller_Operation_Manual.pdf ; Rev 1.5.4: https://www.eviaudio.fr/wp-content/uploads/2020/04/Manuel-Lake-Controller.pdf ; Rev 1.5.2: https://prodgsystems.com/public/pdf/128_Lake%20Controller%20Manual.pdf ; another rev: https://prodgsystems.com/public/pdf/129_Lake%20Controller%20Operation%20Manual.pdf ; Rev 1.4.5: https://www.m3-eventtechnik.at/sites/default/files/dateien/verleih/lake_lm44_0.pdf ; Rev 1.3.6 (Japanese): https://beetech-inc.com/wp/wp-content/uploads/191218_Lake_Controller_Operation_Manual_136J.pdf
- Lake Controller v8.0.0 Release Notes: https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf ; v8.1.6 Release Notes: https://www.adamson.ai/support/downloads-directory/design-and-control/lake-controller/958-lake-controller-v8-1-6-release-notes/file
- PLM+ Series Operation Manual (PLM 20K44/12K44/5K44): https://www.huss-licht-ton.de/images/products_download/User_Manual_18113_1.pdf ; manualslib copy https://www.manualslib.com/manual/1379110/Lab-Gruppen-Plm-20k44.html
- PLM Series (original 10000Q/14000/20000Q) Operation Manual: https://www.manualslib.com/manual/638117/Lab-Gruppen-Plm-Series.html ; https://www.manualslib.com/manual/679702/Lab-Gruppen-Plm-Series.html ; https://studylib.net/doc/18304342/lab.gruppen-plm-series-operation-manual
- Lake LM Series Operation Manual Rev 1.2.8 (LM 26/LM 44): https://www.eviaudio.fr/wp-content/uploads/2020/04/LM-Series-Operation-Manual.pdf ; https://www.manualslib.com/manual/814603/Lake-Lake-Lm-Series.html ; LM Quick Start: https://www.manualslib.com/manual/1884060/Lake-Lm-Series.html
- Lab.gruppen D Series Operation Manual Rev 3.0.4: https://www.fullcompass.com/common/files/46498-LabGruppenDSeriesOperationManual.pdf ; D Series data sheet: https://prodgsystems.com/public/pdf/131_Data%20Sheet.pdf
- Dolby Lake Processor System Manual: https://www.scribd.com/document/490628933/Dolby-Lake-Processor-System-Manual ; https://www.yumpu.com/en/document/view/5103722/dolby-lake-processor-system-manual ; Dolby Lake Controller Manual Issue 5: https://manualzz.com/doc/6851284/dolby-lake-audio-processor-controller-manual ; Lake LPD manual (Contour/Mesa front-panel reference): https://www.manualslib.com/manual/1602366/Dolby-Laboratories-Lake-Lpd.html
- Legacy v3.2 Lake Controller User Mode / Designer Mode manuals (Contour Pro26D, Mesa Quad EQ): https://manualzz.com/doc/7199931/v3.2-lake-controller-user-mode-manual ; https://manualzz.com/doc/23390955/v3.2-lake-controller-designer-mode-manual
- Adamson PLM & Lake Handbook V5.0: https://djeaudio.djeproduction.com/wp-content/uploads/sites/2/2017/12/Adamson_PLM__Lake_Handbook_V5.0.pdf
- TW AUDiO Lab.gruppen PLM quick/field reference: https://twaudio.de/wp-content/-pdf_files/TW_AUDiO_Controlling_Software_Lab.Gruppen_PLM_Manual_EN_2.1.pdf
- K&F PLM 12K44 data sheet: https://www.kling-freitag.com/content/uploads/ds_plm-12k44_en.pdf

---

## Key Question 1: Device families and DSP topology (modules per frame, module types, I/O per module)

### Takeaway
Every Lake device is a "Frame" holding 1–4 processing "Modules"; a Module is either a Contour-type crossover module (Classic IIR, Linear Phase, or, since Lake Controller v8, "XP" with FIR) producing 2–6 outputs, or a Mesa EQ module (1 in / 1 out full-band). Module counts per frame are: Contour mode max 2 modules (A/B) on LM/PLM-class devices; LM 44 = 2 Contour or 4 Mesa; D-series and PLM+ = up to 4 modules / 12 module outputs. Super Modules span several frames.

### Cited Findings

**Frame/module structure**
- "In Contour Mode, a maximum of two Modules are contained within each Frame; these are referred to as Module A and Module B. ... in Contour Mode, each Module can be configured as a Classic Crossover (Bessel, Butterworth, Linkwitz-Riley), as a Linear Phase Crossover, or as multiple full bandwidth Auxiliary Outputs." — [Lake LM Series Quick Start Manual p.16 (manualslib snippet)](https://www.manualslib.com/manual/1884060/Lake-Lm-Series.html?page=16)
- "the default configuration for an LM 44 is four Mesa EQ Modules, providing a total of four Module outputs." — [same](https://www.manualslib.com/manual/1884060/Lake-Lm-Series.html?page=16)
- LM 44: "module configuration of 2 Contour or 4 Mesa modules with 6 processing channels in Contour mode and 4 in Mesa mode." — [LM 44 datasheet / retailer summaries](https://www.liveforsound.com/product/wp-content/uploads/2023/11/LAKE_LM44_DataSheet_liveforsound.pdf)
- "The Lake LM 44 can have a maximum of 2 Contour Modules within a frame." ; "The LM 44's default configuration is Mesa mode." — [LM Series Operation Manual (manualslib snippet)](https://www.manualslib.com/manual/814603/Lake-Lake-Lm-Series.html)
- LM 44 I/O: "4 x AES3 digital audio inputs and 4 x AES3 digital audio outputs"; "The LM 44 allows input from AES3 (Ch.5,6) and AES4 (Ch.7,8), in addition to AES1 and AES2 inputs provided for all LM Series devices." — [LM Series Operation Manual](https://www.manualslib.com/manual/814603/Lake-Lake-Lm-Series.html)
- D Series (D 80:4L / 120:4L / 200:4L, and 10:4L/20:4L/40:4L): "may be configured with up to four processing Modules containing a total of up to twelve processing Module outputs that can be routed to any of the four power output channels." Controllable via Lake Controller "version 6.3 for the D 80:4L". — [D Series Operation Manual (fullcompass PDF, via snippet)](https://www.fullcompass.com/common/files/46498-LabGruppenDSeriesOperationManual.pdf)
- Dolby Lake Processor: "Contour/MESA mode provides two three-way loudspeaker processors, plus four MESA EQs"; "Four-way, five-way and six-way crossover configurations are also available"; "Linear Phase Brick Wall 2-Way configurations include Classic Auxiliary Output options"; "Linear Phase Brick Wall 3-Way and 4-Way configurations are available". — [Dolby Lake Processor System Manual (scribd/yumpu snippets)](https://www.yumpu.com/en/document/view/5103722/dolby-lake-processor-system-manual)
- Lake Controller manual Chapter 9 "provides a reference for the available Module file types, including traditional crossovers, linear phase crossovers, and Mesa EQ Modules"; Chapter 6 covers the EQ/Levels menu. — [Lake Controller Operation Manual (prodgsystems snippet)](https://prodgsystems.com/public/pdf/129_Lake%20Controller%20Operation%20Manual.pdf)
- "A Contour 3way module initially has one parametric (PEQ1) and one graphic (GEQ1) overlay, in addition to the XOVER screen." — [v3.2 Lake Controller User Mode Manual (manualzz snippet)](https://manualzz.com/doc/7199931/v3.2-lake-controller-user-mode-manual)

**Super Modules**
- "The Super Module feature allows hardware processing modules in two or more separate PLM Series units to function as a single module in the Lake Controller software interface." — [PLM Series Operation Manual p.11 (manualslib)](https://www.manualslib.com/manual/679702/Lab-Gruppen-Plm-Series.html?page=11)

**Lake XP / FIR modules (Lake Controller v8)**
- "Lake XP (Extended Processing) Contour Modules are now available for the PLM+ and D Series Lake product series, available in XP1way, XP2way, XP3way and XP4way variants." "Each output has a configurable crossover supporting FIR". "each output includes Multiband Limiters supporting up to three independent frequency bands". Bug-fix items mention "Hide and Read only settings for Pre-Output EQ and Crossover for XP modules" and "importing FIR coefficients for XP module via Designer Worksheets". — [Lake Controller v8.0.0 Release Notes (beetech PDF, via snippet)](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf)
- XP module DSP budget (from a third-party FIR vendor's Lake integration page): "FIR: 384 taps per block; each with an effective tap length of 8ms @ 48 kHz, 16ms @ 24 kHz and 32ms @ 12 kHz." "Separate speaker processing block and 'optimizer' (for array processing) block on each output channel. IIR: 20 biquads per output channel; 16 for speaker processing and 4 for 'optimizer.'" — [Eclipse Audio, Lake FIR Filters](https://eclipseaudio.com/lake-fir-filter/)
- Newer LMX 48 / LMX 88 processors (4x8 and 8x8 analog/digital I/O, 8x8 Dante) also run Lake processing under Lake Controller. — [Professional Audio Design LMX 48 listing](https://www.proaudiodesign.com/products/lake-lmx-48); [B&H LMX 88](https://www.bhphotovideo.com/c/product/1931766-REG/lab_gruppen_lmx88_dsp_with_raised_cosine.html)

**Legacy Contour / Mesa Quad EQ**
- Lake Contour: "The Contour controller has both parametric and 28-band graphic EQ filters simultaneously available to the user." — [Mix, Field Test: Lake Technology Contour](https://www.mixonline.com/news/field-test-lake-technology-contour-425106)
- Lake Mesa Quad EQ is a "4x4 Digital Matrix Processor". — [Synthtopia](https://www.synthtopia.com/content/2004/06/17/new-lake-mesa-quad-eq-4x4-digital-matrix-processor/)

**Implementation platform (wire-encoding hint)**
- A former Lake engineer's portfolio: worked on "Lake Controller, Preset Manager and firmware for the Clair iO, Lake Contour/Mesa, Dolby Lake Processor (ARM) and Lab.gruppen PLM series (Ti C67x)"; PLM integration included "the front panel, 'Load Library' complex impedance load sensing, gain stage configuration, fault protection". Technologies "C, C++, Matlab ... Win32/DirectX, Nucleus RTOS, ARM (SAM7, Xscale), Ti C674x". — [tinybrain/tinybra.in lake.md (GitHub)](https://github.com/tinybrain/tinybra.in/blob/master/pages/portfolio/lake.md)
- LM 44 audio path: "Internal sample rate is 96 kHz with 24-bit conversion resolution and a 32-bit floating point internal data path." — [LM 44 datasheet summary](https://www.liveforsound.com/product/wp-content/uploads/2023/11/LAKE_LM44_DataSheet_liveforsound.pdf)

### Inferences
- Module-count table (CONFIRMED where cited; the PLM/PLM+ per-frame counts are UNVERIFIED recollection and should be read from the Lake Controller Frame/Module screen tomorrow):

| Device | Modules per frame | Module outputs | Amp channels | Status |
|---|---|---|---|---|
| Lake Contour (Pro26 / Pro26D) | 2 (A/B) | 6 | – | CONFIRMED (2 in / 6 out product) |
| Lake Mesa Quad EQ | 4 Mesa | 4 | – | CONFIRMED (4x4) |
| Dolby Lake Processor | 2 Contour 3-way + 4 Mesa (Contour/Mesa mode); other modes | up to 8 | – | CONFIRMED |
| LM 26 | 2 Contour (2 in / 6 out) or Mesa | 6 | – | CONFIRMED (2 Contour max) |
| LM 44 | 2 Contour or 4 Mesa | 6 (Contour) / 4 (Mesa) | – | CONFIRMED |
| PLM 10000Q / 14000 / 20000Q | 2 Contour or 4 Mesa (UNVERIFIED) | up to 4 amp ch | 4 (10000Q, 20000Q) / 2 (14000) | UNVERIFIED |
| PLM+ 5K44 / 12K44 / 20K44 | up to 4 (UNVERIFIED; D-series sibling platform is 4) | up to 12 | 4 | UNVERIFIED |
| D 10:4L / 20:4L / 40:4L / 80:4L / 120:4L / 200:4L | up to 4 | up to 12 | 4 | CONFIRMED |
| MY8-LAKE (Yamaha card) | not found | not found | – | GAP |

- Because the PLM DSP is a TI C67x (floating-point) and the data path is 32-bit float, parameter values on the wire are plausibly IEEE-754 32-bit floats (or fixed-point integers scaled by the GUI step); this is an inference to test against captures, not a documented fact.
- The XP module release note implies XP modules add per-output "Pre-Output EQ", a FIR-capable crossover, and 3-band multiband limiters as *new parameter groups* not present on Classic/Linear-Phase modules; captures should cover both a Classic module and an XP module if a PLM+/D-series frame is available.

### Gaps
- Exact module count and module-type menu for PLM (original) and PLM+ frames not confirmed (manuals blocked).
- MY8-LAKE module topology: no information retrieved.
- Full list of Module file types (Chapter 9 of the Lake Controller manual) not retrieved: e.g., "Classic 2way/3way/4way", "Linear Phase 2way/3way/4way", "Aux Out", "Mesa EQ", "XP1way–XP4way" are the names the operator should expect (UNVERIFIED).

---

## Key Question 2: Frame input stage (physical inputs, gain/trim, router, mixer, priority/fallback, headroom, delay)

### Takeaway
The frame input chain is: physical inputs (analog, AES3, Dante/AES67; AES50 on LMX) -> Input Routers, each with up to four prioritised fail-over sources (Force 1–4 or Autoselect) -> Module Input Mixer (any router output to any module) -> module. Confirmed analog spec on PLM+: +26 dBu max, 20 kohm, Iso-Float. Numeric ranges for input gain, headroom and input delay were not retrievable.

### Cited Findings
- "Input routers can be independently configured with up to four input fail-over priority settings, and the output of any of these input routers can go to any of the Modules via the Module Input Mixer, also be patched directly to any analog, AES3, Dante/AES67 or AES50 output." — [Lake Controller Operation Manual Rev 1.6.1 (eviaudio snippet)](https://www.eviaudio.fr/wp-content/uploads/2020/04/Lake_Controller_Operation_Manual.pdf)
- Global priority control: "instantly switch between input router priority Force 1, 2, 3 or 4, or set to Autoselect. [Prio 1] forces all online devices in the current system configuration to use forced priority 1 input for all input routers, and Prio 2, 3 and 4 work the same way ... [Alert] can be used in conjunction with Auto. When Alert is enabled, it will display the GSI (Global Status Indicator) warning if not all input routers are using Prio1". — [Lake Controller Operation Manual Rev 1.6.1](https://www.eviaudio.fr/wp-content/uploads/2020/04/Lake_Controller_Operation_Manual.pdf)
- "The input section (inputs, input router and input mixer) allows for mixing capabilities as well as redundant and prioritized inputs with automatic switch-over in case of signal failure." — [PLM+ / D-series product pages (prodgsystems snippet)](https://prodgsystems.com/3-33-121-producto-plm-series-plm-20k44.html)
- PLM+ analog inputs: "The impedance is 20 kohms with a maximum input level of +26 dBu. The analog inputs feature Lake Iso-Float circuitry." AES3: "Two latching XLR-3F connectors accept four channels of AES3 digital audio with an input impedance of 110 ohms." Dante "provides Dante audio along with control data." — [PLM+ Quick Start Guide / data sheets (prodgsystems snippets)](https://prodgsystems.com/public/pdf/121_Quick%20start%20guide.pdf)
- LM 44: "8 x 8 AES3 digital I/O and 4 x 8 Dante networked I/O"; supported sample rates "44.1 kHz, 48 kHz, 88.2 kHz, 96 kHz, 176.4 kHz, and 192 kHz (I/O individually selectable)"; AES3 I/O "up to 192 kHz sampling frequency". — [LM 44 datasheet / FOH summary](https://fohonline.com/articles/speaking-of-speakers/lake-lm-44-digital-audio-loudspeaker-processor/)
- PLM 12K44 manual has sections on "Automatic Detection and Dante Clock Configuration" (p.86/92). — [mans.io PLM 12K44 viewer](https://mans.io/files/viewer/663893/86)
- LM Series manual has "Dante clock configuration" and "Signal processing latency" application-guide sections (pp.65–66). — [manualsdir LM 44 p.65](https://www.manualsdir.com/manuals/738561/labgruppen-lm-44-lm-26.html?page=65); [manualslib LM p.66](https://www.manualslib.com/manual/814603/Lake-Lake-Lm-Series.html?page=66)

### Inferences
- Parameter list for the capture plan (frame input stage). Ranges marked UNVERIFIED are recollections to confirm on the GUI end-stops:

| Parameter | Location | Range | Step | Units | Status / notes |
|---|---|---|---|---|---|
| Input router source selection | Frame > I/O Config > Input Router n | Priority 1..4 each = {Analog n, AES n, Dante n, ...} | enum | – | CONFIRMED that 4 priorities exist |
| Router priority mode | Frame / global | Force 1, Force 2, Force 3, Force 4, Autoselect | enum | – | CONFIRMED |
| Router fallback threshold / hold time | Input Router | not found | – | dBu / s | GAP (Lake has a signal-loss detection threshold and dwell; UNVERIFIED) |
| Analog input headroom | Frame > I/O Config | not found (PLM analog max +26 dBu) | – | dBu | GAP; PLM/PLM+ let you choose analog input headroom (UNVERIFIED) |
| Input gain / trim per physical input | Frame I/O | not found | – | dB | GAP |
| Module Input Mixer | Module > Input Mixer | router output n -> module input, with per-crosspoint gain (UNVERIFIED) | – | dB | CONFIRMED mixer exists; gain range GAP |
| Input delay | Module input | shares the 2 s input-to-output budget (see Q3) | – | ms/ft/m | CONFIRMED 2 s total on Contour |
| Dante clock / sample rate | Frame | 44.1–192 kHz per I/O (LM 44) | enum | kHz | CONFIRMED for LM 44 |

### Gaps
- Input gain/trim range and step, headroom options, and the fail-over detection threshold/timing were not retrievable (all in the blocked PLM+/LM manuals and Lake Controller manual Ch. "I/O Configuration").

---

## Key Question 3: Module input stage — EQ types (PEQ, GEQ, Mesa), gain, delay, polarity, mute, overlays

### Takeaway
Module EQ is organised as stacked "overlays": parametric overlays (PEQ1..n, filters are parametric/shelf, either "classic" IIR shapes or Raised Cosine "Mesa" asymmetric filters) and Ideal Graphic EQ overlays (raised-cosine graphic bands that sum flat), with a system limit of 256 EQ filters across overlays. Maximum user delay on a Contour module is 2 s input-to-output. Exact numeric PEQ ranges (Hz, dB, Q/BW) and delay resolution were not retrievable.

### Cited Findings
- "Modules and groups of modules can have additional layers of EQ known as overlays, with up to 256 EQs across multiple overlays." — [Lab.gruppen Lake Processing page (snippet)](https://www.labgruppen.com/en/lake-processing)
- "a virtually unlimited number of EQ filters may be implemented" (marketing phrasing). — [Lake Contour review / product text (mixonline snippet)](https://www.mixonline.com/news/field-test-lake-technology-contour-425106)
- "The asymmetrical filtering of the Lake Mesa EQ Parametric Overlay provides the ability to separate the sides of a parametric section, change center frequencies and adjust slopes independently." — [Mix, Lake Mesa Quad EQ](https://www.mixonline.com/news/lake-technology-lake-mesa-quad-eq-421218)
- "the simple separation of the two combined shelf filters results in an asymmetric MESA filter with separately adjustable slope for the upper and lower cut-off frequency." — [Bodo Felusch, Raised Cosine Equalization in detail](https://felusch.de/en/lake-processing-raised-cosine-equalization-im-detail/)
- Mesa filter handles in the GUI: "placing the stylus/cursor in either one of the two 'out-on-the-full' regions of the Mesa filter adjusts the slope (which pivots around the centre of symmetry of the cosine shape), 'behinds' adjust the width of the flat Mesa region, and 'goals' move the entire filter back and forth along the frequency spectrum." — [AudioTechnology review, Lake Mesa Quad EQ](https://www.audiotechnology.com/PDF/REVIEWS/AT41_Lake_Mesa_Quad_EQ.pdf)
- "The raised cosine filters of the Ideal Graphic EQ Overlay sum flat to ensure that EQ controls precisely match response, offering superior selectivity compared to conventional filters with no interaction between adjacent bands." — [Mix, Lake Mesa Quad EQ](https://www.mixonline.com/news/lake-technology-lake-mesa-quad-eq-421218)
- "Raised Cosine Equalization serves as the foundation underlying the Ideal Graphic EQ and Lake Mesa EQ interfaces"; the DLP has "Parametric EQ with Mesa and Ideal Graphic equalizers, both utilizing Raised Cosine algorithms"; the manual contains a figure "comparing Raised Cosine and Traditional Third-Octave Filters". — [Dolby Lake Processor documentation (scribd/manualslib snippets)](https://www.scribd.com/document/710626802/Lake-LM44-Dolby)
- Contour has a "28-band graphic EQ". — [Mix, Field Test: Lake Technology Contour](https://www.mixonline.com/news/field-test-lake-technology-contour-425106)
- "A Contour 3way module initially has one parametric (PEQ1) and one graphic (GEQ1) overlay, in addition to the XOVER screen." — [v3.2 User Mode Manual](https://manualzz.com/doc/7199931/v3.2-lake-controller-user-mode-manual)
- "The maximum available user delay for Lake Contour modules is 2 seconds from any input to any output." — [Lake Contour product/manual text (svconline / cuesale snippets)](https://www.svconline.com/news/lake-technology-lake-contour-365806)
- The Lake Controller Operation Manual has a "Delay Units" section (ms/feet/metres selectable). — [Lake Controller Operation Manual (prodgsystems snippet)](https://prodgsystems.com/public/pdf/129_Lake%20Controller%20Operation%20Manual.pdf)
- Polarity: "Polarity buttons are provided next to the mute buttons for input and output channels in Designer Mode, while User Mode provides polarity of input channels only." — [Lake Controller Operation Manual (snippet)](https://www.eviaudio.fr/wp-content/uploads/2020/04/Manuel-Lake-Controller.pdf)
- "Parameters are any control functions which can be adjusted by the user to different values, such as input level, gain, delay, and limiter threshold." — [LM Series Operation Manual](https://www.manualslib.com/manual/814603/Lake-Lake-Lm-Series.html)
- Lake processing "offers precise settings for gain, delay, crossover slope, equalization and limiting". — [Lake Controller Operation Manual (snippet)](https://www.eviaudio.fr/wp-content/uploads/2020/04/Lake_Controller_Operation_Manual.pdf)

### Inferences
- Module-input parameter table. CONFIRMED rows have a citation above; UNVERIFIED rows are recollections of the Lake Controller EQ screens for the operator to confirm by dragging to end-stops:

| Parameter | Location | Range | Step | Units | Status |
|---|---|---|---|---|---|
| Module input gain (level fader) | Module > Levels | not found (recollection: -100/-inf .. +15 dB) | not found (recollection: 0.1 dB fine) | dB | UNVERIFIED |
| Module input mute | Levels | on/off | bool | – | CONFIRMED (mute buttons exist) |
| Module input polarity | Levels (Designer & User mode) | normal/inverted | bool | – | CONFIRMED |
| Module input delay | Levels / Delay | 0 .. 2000 ms total budget in+out | not found (recollection: 0.01 ms display; likely sample-quantised at 96 kHz = 10.4 us) | ms / ft / m (units selectable) | 2 s CONFIRMED; step UNVERIFIED |
| PEQ overlay count | EQ screen tabs | 1 overlay by default, more can be added; system cap 256 filters across overlays | – | – | CONFIRMED |
| PEQ filter type | PEQ overlay | Parametric, Low shelf, High shelf, Mesa (asymmetric); "classic" vs Raised Cosine shapes (recollection) | enum | – | Mesa/param/shelf CONFIRMED; classic-vs-RC toggle UNVERIFIED |
| PEQ frequency | PEQ filter | not found (recollection: ~10 Hz .. 20 kHz, displayed to 1 Hz / 3 sig. figs) | – | Hz | UNVERIFIED |
| PEQ gain | PEQ filter | not found | not found (recollection: 0.1 dB) | dB | UNVERIFIED |
| PEQ bandwidth | PEQ filter | not found | – | octaves or Q (display toggle, recollection) | UNVERIFIED |
| Mesa filter extra params | Mesa filter | lower edge freq, upper edge freq (flat-top width), lower slope, upper slope | – | Hz, dB/oct (recollection) | Existence CONFIRMED; numeric range GAP |
| GEQ (Ideal Graphic EQ) overlay | GEQ tab | 28 bands (Contour, per review; recollection for later LC: 31 bands 20 Hz–20 kHz) | – | dB per band | 28 CONFIRMED for Contour era; band gain range GAP |
| Overlay master gain / bypass | Overlay | on/off; gain | – | dB | UNVERIFIED |
| EQ "Hide"/"Read only" flags | Designer mode per overlay | flags | bool | – | CONFIRMED to exist for XP Pre-Output EQ (release notes); general UNVERIFIED |

- For decoding: a raised-cosine (Mesa) filter needs at least five values (centre or two edge frequencies, gain, two slopes); a "classic" parametric needs three (f, gain, Q/BW); shelves need f, gain and (for RC shelves) slope. Expect different message lengths or type tags per filter type.
- Since GEQ bands are raised-cosine filters, GEQ moves may be transmitted either as a 28/31-element gain vector or as individual band gains; capture both a single-band move and a "flatten" operation to see which.

### Gaps
- No retrievable numeric ranges/steps for PEQ frequency, gain, Q/bandwidth; GEQ band gain range; Mesa slope range; delay display resolution. These live in the blocked Lake Controller Operation Manual Chapter 6 (EQ/Levels) and the EQ "Preferences" (Q vs BW display) sections.
- Whether later Lake Controller versions changed the GEQ from 28 to 31 bands is unresolved (the 28-band figure is from a 2003-era Contour review).

---

## Key Question 4: Module output stage — crossovers, output PEQ, gain, delay, polarity, mute, limiters (LimiterMax/ISVPL), routing, Load Verification

### Takeaway
Classic crossovers are Bessel/Butterworth/Linkwitz-Riley at 6–48 dB/oct; Linear Phase crossovers offer >180 dB/oct "brick wall" slopes; XP modules add FIR crossovers and 3-band multiband limiters. LimiterMax = MaxPeak + MaxRMS; confirmed numbers: MaxRMS attack 1–500 ms in 0.1 ms steps, knee "Corner" in 0.1 dB steps (0 dB = hard knee), PLM+ ISVPL threshold 17.8–600 V.

### Cited Findings

**Crossovers**
- "Lake Processing provides Bessel, Butterworth and Linkwitz-Riley crossovers, selectable up to 48 dB per octave." ; "slopes ranging from 6 to 48 dB per octave". — [Lab.gruppen Lake Processing page](https://www.labgruppen.com/en/lake-processing); [Mix DLP field test](https://www.mixonline.com/technology/field-test-dolby-lake-processor-speaker-controller-370320)
- "Linear phase crossovers ... can match traditional crossover slopes such as 24 dB per octave and 48 dB per octave. Linear phase crossovers are capable of transition slopes exceeding 180 dB per octave." — [Lab.gruppen Lake Processing page](https://www.labgruppen.com/en/lake-processing)
- "The crossover interface allows you to quickly add low shelf, high shelf, and parametric filters to each output." — [Mix DLP field test](https://www.mixonline.com/technology/field-test-dolby-lake-processor-speaker-controller-370320)
- Output EQ on the DLP includes a "PEQ1 (parametric EQ 1) option as part of its output EQ capabilities". — [Mix DLP field test](https://www.mixonline.com/technology/field-test-dolby-lake-processor-speaker-controller-370320)
- XP modules: "Each output has a configurable crossover supporting FIR"; "Pre-Output EQ" exists as a hideable/read-only section; FIR coefficients imported "via Designer Worksheets". — [Lake Controller v8.0.0 Release Notes](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf)

**LimiterMax**
- "LimiterMax provides peak and RMS limiting features, referred to as MaxPeak and MaxRMS respectively." — [PLM Series Operation Manual p.39 (manualslib)](https://www.manualslib.com/manual/638117/Lab-Gruppen-Plm-Series.html?page=39)
- "The attack time of the MaxRMS limiter is selectable in 0.1 ms increments from 1mS to 500 ms which is the default setting unless another range has been specified in the Module settings. The release time of the MaxRMS limiter is also adjustable." — [PLM Series Operation Manual p.39](https://www.manualslib.com/manual/638117/Lab-Gruppen-Plm-Series.html?page=39)
- "A soft-knee or hard-knee corner may be applied to the RMS Limiter." "The Corner parameter is adjustable in 0.1 dB increments, subject to defined level limits. This figure represents the level below the limiter threshold at which compression commences; the larger this negative value, the softer the knee. A setting of 0 dB implies a hard-knee characteristic." — [PLM Series Operation Manual p.39 (MaxRMS Corner, "MaxRMSCor")](https://www.manualslib.com/manual/638117/Lab-Gruppen-Plm-Series.html?page=39)
- Front-panel abbreviations on PLM: "Inter-Sample Voltage Peak Limiter (ISVPL); MaxPeak Level (MaxPeakLvl); MaxRMS Level (MaxRMSLvl); MaxRMS Corner (MaxRMSCor)". PLM+ manual adds "ISVPL Threshold" and "ISVPL Profile". — [PLM manual p.39](https://www.manualslib.com/manual/638117/Lab-Gruppen-Plm-Series.html?page=39); [PLM+ manual p.58](https://www.manualslib.com/manual/679702/Lab-Gruppen-Plm-Series.html?page=58)
- "ISVPL is an abbreviation for Inter-Sample Voltage Peak Limiter, a proprietary Lab.gruppen technique for ensuring that voltage at the output terminals ... The ISVPL threshold may be set at any level between 17.8 V and 600 V via the PLM+'s menu system." — [PLM+ Operation Manual (huss-licht-ton PDF, via snippet)](https://www.huss-licht-ton.de/images/products_download/User_Manual_18113_1.pdf)
- "Full details regarding LimiterMax can be found in the Lake Controller Operation Manual." — [PLM manual](https://www.manualslib.com/manual/638117/Lab-Gruppen-Plm-Series.html?page=39)
- XP modules: "each output includes Multiband Limiters supporting up to three independent frequency bands". — [Lake Controller v8.0.0 Release Notes](https://beetech-inc.com/wp/wp-content/uploads/Lake_Controller_v8-Release-Notes.pdf)
- Groups carry "limiter offsets" (see Q6). — [ProSoundWeb, Lake Controller v6.4](https://www.prosoundweb.com/lab-gruppen-launches-new-lake-controller-v6-4/)

**Output routing / amplifier**
- D-series: module outputs "can be routed to any of the four power output channels". — [D Series Operation Manual](https://www.fullcompass.com/common/files/46498-LabGruppenDSeriesOperationManual.pdf)
- Input-router outputs can also be patched directly to any physical output. — [Lake Controller Operation Manual Rev 1.6.1](https://www.eviaudio.fr/wp-content/uploads/2020/04/Lake_Controller_Operation_Manual.pdf)
- PLM "Load Library" is complex-impedance load sensing implemented in PLM firmware/Controller. — [tinybrain portfolio (GitHub)](https://github.com/tinybrain/tinybra.in/blob/master/pages/portfolio/lake.md)

**Polarity / mute**
- Output polarity buttons available in Designer Mode only (User Mode: input only). — [Lake Controller Operation Manual](https://www.eviaudio.fr/wp-content/uploads/2020/04/Manuel-Lake-Controller.pdf)

### Inferences
- Output-stage parameter table:

| Parameter | Location | Range | Step | Units | Status |
|---|---|---|---|---|---|
| Crossover type (per band edge) | XOVER screen | Bessel / Butterworth / Linkwitz-Riley / Linear Phase (Classic vs LP is a module-type choice); XP: FIR | enum | – | CONFIRMED |
| Crossover slope | XOVER | 6, 12, 18, 24, 30, 36, 42, 48 dB/oct for classic (6–48 confirmed; individual steps inferred); LP: up to >180 dB/oct | enum | dB/oct | 6–48 CONFIRMED; step list inferred |
| Crossover frequency | XOVER | not found | – | Hz | GAP |
| Output PEQ / shelves | XOVER / Pre-Output EQ (XP) | same filter types as Q3 | – | – | CONFIRMED to exist |
| Output gain | Levels | not found (recollection: -100 .. +15 dB, 0.1 dB) | – | dB | UNVERIFIED |
| Output delay | Levels | within 2 s in-to-out budget | not found | ms/ft/m | CONFIRMED budget only |
| Output mute / polarity | Levels | bool | – | – | CONFIRMED |
| MaxPeak threshold (MaxPeakLvl) | Limiter | not found | not found (likely 0.1 dB, by analogy with Corner) | dBu (Lake) / V (PLM amp domain) | UNVERIFIED units |
| MaxPeak attack / release | Limiter | not found | – | ms / s | GAP |
| MaxRMS threshold (MaxRMSLvl) | Limiter | not found | – | dBu / V | GAP |
| MaxRMS attack | Limiter | 1 .. 500 ms (default range; module can restrict) | 0.1 ms | ms | CONFIRMED |
| MaxRMS release | Limiter | "adjustable"; range not found | – | s | GAP |
| MaxRMS corner (knee) | Limiter | 0 dB (hard) .. negative values (soft), "subject to defined level limits" | 0.1 dB | dB | CONFIRMED |
| ISVPL threshold (PLM+) | Amp/limiter | 17.8 .. 600 V | not found | V | CONFIRMED range |
| ISVPL profile (PLM+) | Amp/limiter | enum (e.g. universal / speaker-specific) | enum | – | CONFIRMED to exist |
| Multiband limiter bands (XP) | XP output | up to 3 bands | – | – | CONFIRMED |
| Output -> amp channel routing | Frame output config | any module output to any of 4 amp channels (D-series) | enum | – | CONFIRMED (D) |
| Amplifier gain / voltage gain (PLM) | Frame | not found | – | dB | GAP |
| Load Library / LoadSmart verification | PLM | impedance-curve match; tolerance params not found | – | ohm | GAP |
| Speaker preset lock | Module | lock + password (Designer Mode) | – | – | CONFIRMED (see Q5) |

- The 0.1 dB and 0.1 ms steps confirmed for MaxRMS strongly suggest the GUI quantises limiter values to tenths; whether the wire value is a float or an integer x10 is a primary thing to determine from tomorrow's captures (nudge one step and look for +1 in an integer field vs a float increment of 0.1).
- "Subject to defined level limits ... unless another range has been specified in the Module settings" indicates Module files can *restrict* parameter ranges (min/max clamps stored per module); expect range-limit fields in module-load messages, and expect the GUI end-stops to differ between module files.

### Gaps
- MaxPeak attack/release ranges, MaxRMS release range, threshold units and ranges, crossover frequency range/step, output gain range, LoadSmart/Load Library parameters, PLM amplifier gain range — all in blocked PLM/PLM+/Lake Controller manuals.

---

## Key Question 5: Global / frame level — gain, mute, presets, lock/security, sample rate, latency, clock, network, faults, meters

### Takeaway
Confirmed: LM 44 runs 96 kHz / 24-bit / 32-bit float with ~0.87–1.05 ms module latency; Frame Presets are created in Lake Controller (or LM Preset Manager); legacy Contour held 6 presets; Designer Mode can lock/password-protect a Module or Base Configuration; Dante clock configuration is a frame setting. Meter behaviour and preset counts on PLM/PLM+ were not retrievable.

### Cited Findings
- LM 44 propagation delay: "0.871 ms for AES synchronous 96 kHz to AES synchronous 96 kHz via module, 1.049 ms for analog input to analog output via module, and 0.158 ms for pass-through analog input to AES synchronous 96 kHz bypassing module." — [LM 44 datasheet summary](https://www.liveforsound.com/product/wp-content/uploads/2023/11/LAKE_LM44_DataSheet_liveforsound.pdf)
- "Internal sample rate is 96 kHz with 24-bit conversion resolution and a 32-bit floating point internal data path." — [same](https://www.liveforsound.com/product/wp-content/uploads/2023/11/LAKE_LM44_DataSheet_liveforsound.pdf)
- "Frame Presets must initially be created in the Lake Controller, and stored as a Preset using the Lake Controller or the LM Series Preset Manager." — [LM Series Operation Manual](https://www.manualslib.com/manual/814603/Lake-Lake-Lm-Series.html)
- PLM manual p.26 covers "Super Modules; Presets; Module Files; Frame Presets". — [PLM Series Operation Manual p.26](https://www.manualslib.com/manual/638117/Lab-Gruppen-Plm-Series.html?page=26)
- Legacy: "6 presets are now available on the Contour processor" (Lake Controller v3.2 release). — [Dolby Live Sound Forum, Lake Controller 3.2](http://dolby.invisionzone.com/index.php?showtopic=170)
- Designer Mode functions include "Lock and Password-Protect a Module or Base Configuration"; manuals have "Designer Mode Security" sections. — [Lake Controller Operation Manual (snippet)](https://www.eviaudio.fr/wp-content/uploads/2020/04/Manuel-Lake-Controller.pdf)
- Two operating modes: Designer Mode and User Mode (User Mode restricts e.g. output polarity). — [same](https://www.eviaudio.fr/wp-content/uploads/2020/04/Manuel-Lake-Controller.pdf)
- PLM 12K44 manual: "Automatic Detection and Dante Clock Configuration". — [mans.io](https://mans.io/files/viewer/663893/86)
- PLM manual has "Maintenance; Factory Default Settings" (p.79). — [PLM Series manual p.79](https://www.manualslib.com/manual/679706/Lab-Gruppen-Plm-Series.html?page=79)
- Lake Controller manual chapters include software installation and network configuration. — [manuals.plus Lake Controller manual](https://manuals.plus/m/8e3b70f4847d495aa867fed41e056954178270e4e526cb292b1e535cccfb686e)

### Inferences

| Parameter | Location | Range | Step | Units | Status |
|---|---|---|---|---|---|
| Frame preset recall/store | Frame > Presets | count not found (legacy Contour: 6) | int | – | CONFIRMED to exist; PLM/PLM+ count GAP |
| Module file load | Module | file (contains DSP config + optional range clamps + lock) | – | – | CONFIRMED |
| Lock / password | Designer Mode, per Module or Base Config | password string | – | – | CONFIRMED |
| Designer vs User mode | Controller-side | enum | – | – | CONFIRMED (may be controller-only, not on wire) |
| Sample rate / clock source | Frame > Dante/clock config | LM 44: 44.1–192 kHz per I/O; internal 96 kHz | enum | kHz | CONFIRMED |
| Network (IP, Dante names) | Frame | – | – | – | exists (GAP on detail) |
| Frame-wide mute / standby | Frame | bool | – | – | UNVERIFIED |
| Fault/temperature reporting | Frame status | read-only telemetry | – | – | UNVERIFIED |
| Meters | Module/Frame | input, output, limiter gain reduction, amp output (PLM) | – | dBFS/dBu/V | UNVERIFIED |

- Meters are almost certainly *device-to-controller* periodic messages rather than parameter writes; tomorrow's capture should include an idle period with a module window open (meter stream) and with it closed, to separate meter traffic from parameter traffic.

### Gaps
- Preset counts for PLM/PLM+/D-series, meter refresh rate and units, frame-level mute/standby, network setting parameters, and fault codes were not retrievable.

---

## Key Question 6: Group behaviour in Lake Controller (count, group EQ, gain/mute/delay overlays and how they combine)

### Takeaway
A device can belong to up to 28 Groups; Groups provide group level, delay, EQ overlays and limiter offsets that layer on top of module values. Whether the wire carries the combined value or the group layer separately is undocumented in what was retrievable, but the "overlay" architecture (up to 256 EQs across overlays) strongly suggests per-layer values are stored and summed in the device.

### Cited Findings
- "A single device can belong to multiple Groups (up to 28); for example, a traditional arena-sized system comprises several left and right main stacks, side-, front-, and down-fills, and multiple levels of delays to different subsystems." — [Lake Controller Operation Manual (snippet)](https://www.eviaudio.fr/wp-content/uploads/2020/04/Lake_Controller_Operation_Manual.pdf)
- "The Controller can use multiple Groups to send global adjustments to all PA areas while still providing independent control of individual system components." — [same](https://www.eviaudio.fr/wp-content/uploads/2020/04/Lake_Controller_Operation_Manual.pdf)
- "Groups provide group levels, delays, EQ overlays and limiter offsets." — [ProSoundWeb, Lab.gruppen Launches New Lake Controller v6.4](https://www.prosoundweb.com/lab-gruppen-launches-new-lake-controller-v6-4/)
- "Modules and groups of modules can have additional layers of EQ known as overlays, with up to 256 EQs across multiple overlays." — [Lab.gruppen Lake Processing](https://www.labgruppen.com/en/lake-processing)
- A user forum thread exists specifically on "Lake Controller GEQ+groups" (content not retrievable). — [Sound Forums](https://soundforums.net/community/threads/lake-controller-geq-groups.11629/)

### Inferences
- Group parameter table:

| Parameter | Range | Step | Units | Status |
|---|---|---|---|---|
| Group membership | up to 28 groups per device | – | – | CONFIRMED |
| Group level (gain) | not found | not found | dB | exists (CONFIRMED); range GAP |
| Group mute | bool | – | – | UNVERIFIED |
| Group delay | not found (within 2 s device budget) | – | ms/ft/m | exists (CONFIRMED); range GAP |
| Group EQ overlays (PEQ/GEQ) | counted within the 256-filter cap | – | – | CONFIRMED |
| Group limiter offset | not found | – | dB | exists (CONFIRMED); range GAP |

- Because a module can sit in up to 28 groups each with its own level/delay/EQ overlay, the device must either (a) store each group layer separately and sum internally, or (b) receive a controller-computed composite. The 256-filter cap being a *device-side* limit across overlays argues for (a) for EQ. For gain/delay it is undetermined; the capture plan should include: change module gain alone; change one group gain alone; change a group gain while the module is also in a second group; then compare payloads. If the payload equals module + group (composite) the values will differ from the GUI group fader; if per-layer, a group-ID/overlay-ID field should appear.
- Offsets ("limiter offsets") imply the device receives a delta applied to the module limiter threshold; expect a signed dB value.

### Gaps
- No retrievable text on the group summation model, group gain/delay ranges, or whether Groups have mute; the "Groups" chapter of the Lake Controller manual is the authority.

---

## Key Question 7: Documented internal representations / resolutions hinting at wire encoding

### Takeaway
The only resolution figures confirmed are 0.1 ms (MaxRMS attack, 1–500 ms), 0.1 dB (limiter knee corner), a 2 s delay ceiling, a 96 kHz/32-bit-float DSP path, and a floating-point TI C67x DSP in PLM. Everything else about encoding must come from the captures.

### Cited Findings
- 0.1 ms increments, 1–500 ms (MaxRMS attack). — [PLM Series Operation Manual p.39](https://www.manualslib.com/manual/638117/Lab-Gruppen-Plm-Series.html?page=39)
- 0.1 dB increments (MaxRMS corner). — [same](https://www.manualslib.com/manual/638117/Lab-Gruppen-Plm-Series.html?page=39)
- 2 s maximum user delay (Contour). — [svconline Lake Contour](https://www.svconline.com/news/lake-technology-lake-contour-365806)
- 96 kHz internal, 24-bit conversion, 32-bit floating-point data path (LM 44). — [LM 44 datasheet](https://www.liveforsound.com/product/wp-content/uploads/2023/11/LAKE_LM44_DataSheet_liveforsound.pdf)
- PLM firmware on TI C67x (C674x) floating-point DSP; DLP on ARM; Lake Controller Win32. — [tinybrain portfolio](https://github.com/tinybrain/tinybra.in/blob/master/pages/portfolio/lake.md)
- ISVPL 17.8–600 V (PLM+). — [PLM+ Operation Manual](https://www.huss-licht-ton.de/images/products_download/User_Manual_18113_1.pdf)
- FIR 384 taps per block at 48/24/12 kHz effective rates; 20 biquads per XP output. — [Eclipse Audio](https://eclipseaudio.com/lake-fir-filter/)

### Inferences
- 2 s at 96 kHz = 192,000 samples, which fits comfortably in an 18-bit or 32-bit integer; delay could be sent as integer samples (96 kHz) or as float ms. Test: set 1.000 ms and look for 96 (0x60) or 0x3F800000 (float 1.0).
- The XP FIR block running at 48/24/12 kHz "effective" rates implies multirate processing; FIR coefficient uploads (from Designer Worksheets) will be large bulk transfers distinct from the small parameter messages.
- 0.1-step parameters: if integers, expect value x10 (e.g., 250.0 ms -> 2500); if floats, expect IEEE-754 with 0.1 increments (0x3DCCCCCD for 0.1).
- The C67x is little-endian by default; a 32-bit float little-endian encoding is the first hypothesis to test.

### Gaps
- No documentation of the control protocol itself was found on the open web or GitHub (searches for "LimiterMax", "Lake Controller" + "Lab.gruppen", "Dolby Lake", PLM model names in GitHub code returned nothing relevant).

---

## Suggested capture-order checklist for tomorrow (derived from the above; items marked * have confirmed ranges)

1. Baseline idle: module window open (meter stream) vs closed.
2. Module input gain: nudge +0.1 dB, +1 dB, to max, to min (note GUI end-stops).
3. Module input mute on/off; input polarity flip (Designer Mode).
4. Module input delay: 1.000 ms, 10.000 ms, 2000 ms* max; switch display units ms -> ft -> m and re-send the same value (should produce identical payload if units are display-only).
5. PEQ: add parametric filter; move frequency; move gain 0.1 dB; change bandwidth; toggle Q/BW display; change type to low shelf, high shelf, Mesa; adjust Mesa upper/lower slope and edge separately; bypass filter; bypass overlay; add second overlay.
6. GEQ overlay: move one band; flatten all.
7. XOVER: change crossover frequency; change slope (6..48*); change type Bessel/Butterworth/LR*; on an LP module change LP slope; on XP module change FIR crossover and Pre-Output EQ.
8. Output gain, mute, polarity, delay (as in 2–4).
9. Limiters: MaxPeak threshold; MaxRMS threshold; MaxRMS attack 1.0 -> 1.1 ms* (0.1 ms step) -> 500 ms*; MaxRMS release; Corner 0 -> -0.1 dB* -> most negative; PLM+ ISVPL threshold 17.8 V* -> 600 V*; XP multiband limiter band edges.
10. Output-to-amp routing change (D/PLM); Load Library verify (PLM).
11. Groups: create group; add module; group gain, delay, EQ overlay, limiter offset; module in two groups; remove from group.
12. Frame: preset store/recall; module file load; lock/password; input-router priority Force 1..4/Auto; Dante clock/sample rate; frame mute/standby.
