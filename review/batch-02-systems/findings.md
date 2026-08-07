# Batch 02 — NVIDIA Systems Portfolio — Findings

(Summary to be added at top once review is complete.)

## ZTH-04 — NVIDIA Hardware Portfolio

### index.md
- [SEVERITY: medium] Structural mismatch — "Planned Chapter Sequence" lists 12 chapters (including "Grace CPU and Grace Hopper Superchip" as #6 and "Memory Capacity, Bandwidth, and Precision Trade-offs" as #7), but only 6 chapters actually exist in the directory.
  - Evidence: `index.md` lines 49-62 list 12 planned topics; `ls docs/nvidia-zero-to-hero/volume-04/` shows only 6 chapter files.
  - Why it matters for JR2018680: the missing Grace CPU/Grace Hopper Superchip topic is a real content gap — Grace CPU and superchip designs (GH200, GB200) are explicitly named in NVIDIA's current product lineup and are a likely interview probe area, and this volume advertises coverage it doesn't deliver.
  - Suggested fix: either author the missing chapters (Grace CPU/superchip, memory/precision trade-offs, power/cooling, decision framework, customer scenarios, summary) or trim the "Planned Chapter Sequence" list to match the 6 chapters that exist.

- [SEVERITY: high] No coverage anywhere in Volume 04 (or Volumes 05/06) of Grace CPU, Grace Hopper Superchip (GH200), or Grace Blackwell Superchip (GB200/GB200 NVL72) — confirmed via repo-wide grep for "Grace", "GB200", "GH200", "Superchip", "NVL72" across all three assigned volumes; only the index.md planned-list and two passing one-word mentions turn up, with zero dedicated technical treatment.
  - Evidence: `grep -rn "GB200|GH200|NVL72|Superchip" docs/nvidia-zero-to-hero/volume-04 volume-05 volume-06` returns only the index.md planned-chapter-list line and one "Integrated superchip" table cell in chapter-03 with no further elaboration.
  - Why it matters for JR2018680: the task brief explicitly names Grace CPU and GB200 as products a NVIDIA interviewer will probe (CPU-GPU coherent memory via NVLink-C2C, superchip vs. discrete GPU tradeoffs, DGX GB200 NVL72 rack-scale architecture) — this is a structural gap across the whole batch, not a single-chapter issue.
  - Suggested fix: add a chapter (or a substantial section) covering Grace CPU architecture, NVLink-C2C coherent memory, and how GH200/GB200 superchips change the DGX/HGX system story — this is the single biggest content gap found in this batch.

### chapter-01-why-nvidia-has-multiple-gpu-families.md
- No significant findings. Depth, accuracy, and diagram quality match the Volume 1 gold standard — concrete `nvidia-smi`/`nccl-tests` evidence walkthroughs, first-person interview answers, and a defensible workload-classification framework.

### chapter-02-workload-first-gpu-selection.md
- No significant findings. Strong workload-to-hardware translation framework with worked memory-capacity arithmetic and realistic troubleshooting evidence.

### chapter-03-accelerator-generations-and-design-shifts.md
- [SEVERITY: low] Chapter title and planned scope ("Data Center GPU Generations: Volta to Blackwell") suggest a generation-by-generation spec comparison, but the chapter stays conceptual (feedback-loop model, six evaluation dimensions) and only gives two concrete generation data points (A100 vs H100 in one `nvidia-smi` table). This is a deliberate pedagogical choice (avoid stale spec tables) but leaves the reader without a single at-a-glance generation comparison.
  - Evidence: Section 3's worked example compares only A100-SXM4-80GB and H100-SXM5-80GB; V100, H200, B200 are not given any numeric treatment in this chapter (they appear in chapter-06 narratively but also without numbers).
  - Why it matters for JR2018680: interviewers frequently ask for ballpark numbers (HBM bandwidth by generation, TDP, NVLink bandwidth) — a reader relying solely on this curriculum would have the reasoning framework but no memorized/derived reference numbers to anchor answers.
  - Suggested fix: add one reference table with approximate, appropriately-caveated generation numbers (memory capacity, HBM bandwidth, TDP, NVLink generation/bandwidth) alongside the existing "specs vary, check current docs" caution.

### chapter-04-pcie-sxm-and-platform-integration.md
- No significant findings. Excellent treatment of `nvidia-smi topo -m`, NUMA placement, and PCIe vs SXM tradeoffs with realistic evidence walkthroughs — this chapter is a strong interview-prep asset as-is.

### chapter-05-inference-accelerators-t4-l4-and-l40s.md
- [SEVERITY: medium] Despite being titled "T4, L4, and L40S," the chapter body never states these accelerators' actual specs (memory capacity, TDP, memory bandwidth) — it only gives qualitative "tendencies" (Architectural Positioning table, line 100) and defers to "current product documentation." Concrete numbers only appear later, in Lab 01 and Lab 02 (T4 16GB/70W, L4 24GB/72W, L40S never gets a number anywhere in the volume).
  - Evidence: line 108, "Exact suitability must be validated against the current product documentation..."; L40S memory/TDP is never stated in any chapter or lab in this volume.
  - Why it matters for JR2018680: a NVIDIA interviewer comparing T4/L4/L40S would expect the candidate to know approximate memory (16GB/24GB/48GB), TDP (70W/72W/350W), and generation (Turing/Ada/Ada) — the chapter builds excellent reasoning scaffolding but a candidate who only studied this chapter could not state these numbers.
  - Suggested fix: add a compact reference table (with a staleness caveat) giving approximate memory, TDP, and architecture generation for T4, L4, and L40S directly in this chapter rather than only in the labs.

### chapter-06-training-accelerators-v100-to-b200.md
- [SEVERITY: medium] Same pattern as chapter-05: the chapter explicitly declines to give concrete specs ("Exact specifications... vary by product variant," line 134-136 caution box) for V100/A100/H100/H200/B200, relying entirely on qualitative generation narrative. The only numeric memory figures that appear (16-32GB V100, 40-80GB A100, 80GB H100, 141GB H200, ~192GB B200-class) are in the Figure 4.6.1 diagram labels, not in prose or a table, and TDP/NVLink bandwidth numbers are never given for any generation.
  - Evidence: Figure 4.6.1 (lines 43-53) is the only place any capacity numbers appear; no TDP, HBM bandwidth (GB/s), or NVLink generation/bandwidth numbers appear anywhere in the chapter.
  - Why it matters for JR2018680: the task brief explicitly calls out "real specs (memory capacity, bandwidth, TDP, interconnect bandwidth per generation)" as expected interview depth — this chapter's title promises exactly this comparison (V100 to B200) but the caution box explicitly opts out of providing it.
  - Suggested fix: add a reference table with approximate memory capacity, HBM generation/bandwidth, TDP, and NVLink generation for V100/A100/H100/H200/B200, keeping the existing "verify against current docs" caveat for exact figures.

### labs/lab-01-build-a-gpu-selection-scorecard.md
- No significant findings. Good use of concrete specs (T4 16GB/70W, L4 24GB/72W, H100 80GB/700W) in the worked example — this is exactly the numeric grounding chapters 05-06 lack, just not surfaced there.

### labs/lab-02-benchmark-an-inference-accelerator-shortlist.md
- No significant findings. Strong, realistic benchmark methodology with correctly-scaled illustrative telemetry output (L4 72W cap, T4 70W cap match Lab 01 and real specs).

## ZTH-05 — DGX Systems

### index.md
- [SEVERITY: low] Same pattern as ZTH-04: "Planned Chapter Sequence" lists 15 topics (lines 51-65) but only 6 chapters exist. Notably absent as a dedicated chapter: "GPU Fabric: NVLink and NVSwitch" (#3) and "Multi-DGX Cluster Architecture" (#13) — though NVLink/NVSwitch topology is well covered inside chapter-02 and chapter-06 in practice, so this is a navigation/labeling issue more than a content gap for this particular volume.
  - Evidence: `index.md` lines 49-65 vs. 6 actual chapter files.
  - Why it matters for JR2018680: minor — the actual chapters compensate for most of the missing topics with strong integrated coverage; mainly a documentation-hygiene issue.
  - Suggested fix: trim the planned list to match delivered chapters, or note which existing chapter now covers each originally-planned topic.

- [SEVERITY: medium] No coverage of DGX GH200/GB200 NVL72 rack-scale systems anywhere in this volume — all six chapters discuss "a DGX system" and "DGX cluster" in generic/traditional (8-GPU node) terms only; the newer superchip-based, rack-as-a-unit DGX designs (GB200 NVL72, liquid-cooled rack-scale NVLink domain spanning 72 GPUs) are never mentioned. This compounds the batch-wide Grace/GB200 gap noted under ZTH-04.
  - Evidence: grep for GB200/GH200/NVL72/Superchip across volume-05 returns zero matches.
  - Why it matters for JR2018680: DGX GB200 NVL72 is NVIDIA's current flagship rack-scale AI system and a very likely interview topic (72-GPU NVLink domain in one rack, liquid cooling as a first-class requirement, not an option) — this volume's power/cooling chapter (ch04) discusses liquid cooling as "one option among considerations" rather than the necessity it is for current-generation rack-scale systems.
  - Suggested fix: add a section (in ch02 or ch04) contrasting traditional 8-GPU-node DGX with GB200 NVL72's rack-as-a-single-NVLink-domain design and its mandatory liquid cooling.

### chapter-01-why-dgx-exists.md
- No significant findings. Strong systems-integration argument with realistic multi-layer evidence (driver drift, NVLink degradation) and honest "what DGX does not solve" framing.

### chapter-02-inside-a-dgx-system.md
- No significant findings. Thorough domain breakdown (compute, fabric, host I/O, network, storage, management, power/cooling) with strong NUMA/topology troubleshooting evidence.

### chapter-03-dgx-management-plane.md
- No significant findings. Clear BMC vs. host-OS vs. BCM layering with realistic IPMI/Redfish-style evidence and a sound unreachable-node decision tree.

### chapter-04-power-cooling-and-rack-readiness.md
- No significant findings. Excellent power/cooling depth with concrete worked numbers (nameplate vs. sustained draw, throttle-reason disambiguation) that matches the depth bar this batch is checking for.

### chapter-05-dgx-storage-and-data-paths.md
- No significant findings. Good treatment of storage roles, GPUDirect Storage caveats, and a strong worked checkpoint-size/I-O-tax calculation.

### chapter-06-dgx-networking-and-fabric-integration.md
- No significant findings. Strong scale-up/scale-out distinction, realistic NCCL_DEBUG/ibv_devices troubleshooting, and an honest Ethernet-vs-InfiniBand comparison that avoids declaring a false winner.

### labs/lab-01-build-a-dgx-health-baseline.md
- No significant findings. Realistic, well-annotated baseline-capture lab with a genuinely useful Xid-severity discussion (Xid 79 vs. corrected AER errors).

### labs/lab-02-validate-dgx-data-and-network-paths.md
- No significant findings. Strong layered acceptance methodology with realistic fio/ethtool/NCCL output and correct bandwidth-scaling interpretation.

## ZTH-06 — HGX Platform

(pending)
