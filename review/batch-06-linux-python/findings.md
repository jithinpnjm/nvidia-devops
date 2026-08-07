# Batch 06 — Linux & Python Foundations — Findings

Review of `docs/volume-01` (Linux internals) and `docs/volume-02` (Python for infrastructure) against NVIDIA JR2018680 interview readiness. See PROGRESS.md for chapter checklist status.

## Volume 01 — Foundations Beneath Kubernetes (Linux internals)

### 01-chapter-1-processes-threads-cpu-scheduling-and-load.md
No findings. This chapter meets the Volume-1 gold-standard bar: mechanism-first (page-fault/process-state diagrams driven by actual kernel transitions, not simplified chains), annotated real command output (`ps`, `vmstat`, `mpstat`, `pidstat`, `cpu.stat`), and GPU-tied worked scenarios (DataLoader/NUMA CPU starvation, CFS throttling sawtooth pattern). Scheduling-class table and `perf`/`bpftrace` section go beyond the base curriculum depth bar. No MDX issues — all `<PID>`/`<pid>` placeholders are inside code fences or inline code spans.

### 02-chapter-2-virtual-memory-page-cache-swap-and-oom.md
No findings. Strong treatment of VmSize/VmRSS/PSS, reclaim ordering, the three distinct OOM boundaries (container cgroup / node-wide / kubelet eviction) with a memorization-ready comparison table, and a GPU-specific scenario correctly emphasizing that GPU HBM is a completely separate memory plane invisible to cgroups/`free`/OOM killer — directly useful for JR2018680-style "what happens under memory pressure on a GPU node" questions.

### 03-chapter-3-files-file-descriptors-filesystems-and-block-i-o.md
- [SEVERITY: medium] No mention anywhere in the chapter of `O_DIRECT`, direct I/O, or GPUDirect Storage (GDS), despite the chapter covering the VFS/page-cache read path, fd leaks, and checkpoint-storm I/O patterns in detail.
  - Evidence: `grep -rn "O_DIRECT\|GPUDirect Storage\|GDS" docs/volume-01/*.md` returns no matches anywhere in the volume. Section 3.1's read-path diagram shows every path going through "page cache lookup" with no branch for bypassing it.
  - Why it matters for JR2018680: the task brief explicitly names "how the page cache interacts with O_DIRECT I/O for GPU data pipelines" as an expected interview mechanism — NVIDIA's own GPUDirect Storage stack exists specifically to bypass the page cache/CPU bounce buffer for NVMe-to-GPU transfers, and this is a natural, high-value extension of the existing VFS diagram and checkpoint-storm scenario already in this chapter.
  - Suggested fix: add a short subsection (or extend the existing VFS read-path diagram) showing the `O_DIRECT` bypass branch alongside the cached path, and tie it to GPUDirect Storage as the AI-infra-specific application of the same VFS/page-cache mechanism already taught here.
