# Chapter 5: Pharmaceuticals and Drug Discovery

| Chapter metadata | Value |
|---|---|
| Volume | 22 — Customer Workshops |
| Difficulty | Intermediate |
| Estimated reading time | 40 minutes |

## Overview

GPU-accelerated drug discovery compresses 10-15 year development cycles by 5-10 years through:
- High-throughput molecular docking (10M molecules in 3.5 hours)
- Protein folding prediction (50K proteins in 2 weeks)
- Molecular dynamics simulations

## Use Case 1: Virtual Screening (10M molecules)

### Requirements
- Molecules: 10 million
- Algorithm: AutoDock Vina
- Current time: 232 days (CPU)
- Target: 2 weeks via GPU acceleration
- Model: FP32 (accuracy critical for collision detection)

### Architecture: 8 A100s

**Performance:**
- CPU baseline: ~0.5 molecules/sec effective throughput (unaccelerated single-node reference, consistent with the 232-day current time)
- GPU (8 A100s): 800 molecules/sec (~1,600× faster)
- Total: 10M molecules in 3.5 hours ✓
- Cost: $320K hw vs $500K+ for CPU cluster

**Cost vs cloud:**
- Cloud docking: $50K per 1M molecules
- 10M: $500K
- On-prem: 8 A100s = $320K hardware + $1.2K power
- **3-year TCO: $400K (vs $1.5M cloud)**

## Use Case 2: Protein Folding (AlphaFold2)

### Requirements
- Proteins: 50,000
- Model: AlphaFold2 (5 min/protein)
- Goal: Complete in 2-3 weeks (acceptable for research)
- Precision: FP32 (numerical stability required)

### Architecture: 4 H100s

**Why H100 (not A100):**
- AlphaFold2 on H100: 5 min/protein
- AlphaFold2 on A100: 10 min/protein (2× slower)
- 4 H100s run 50K proteins in ~25 days (within 2-3 week goal)

## FDA Compliance

**Requirement: Full reproducibility**

Every simulation logged with:
- Model version and checksum
- Hardware (GPU model, CUDA/cuDNN versions)
- Random seed
- Full audit trail

## Related Chapters

- **Prev:** [Chapter 4 — Automotive](./chapter-04-automotive-and-autonomous-vehicles.md)
- **Next:** [Chapter 6 — Telecommunications](./chapter-06-telecommunications.md)
