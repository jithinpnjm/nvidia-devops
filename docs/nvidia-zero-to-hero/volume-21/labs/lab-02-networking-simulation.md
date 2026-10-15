---
title: Lab 02 — Networking Simulation
description: Model collective communication performance in various topologies. 90 minutes hands-on.
sidebar_position: 2
tags: [lab, networking, simulation, allreduce]
---

# Lab 02 — Networking Simulation (90 min)


> **Note:** This lab uses a deliberately simple analytic model (latency plus data divided by bandwidth). It illustrates scaling trends, not real NCCL behavior; NCCL uses pipelined rings and double binary trees, and real fabrics have protocol overhead. The printed values below were computed from the code shown, but validate any conclusion with nccl-tests on real hardware.

## Objective

Simulate AllReduce latency in different network topologies. Predict throughput impact; compare ring, tree, recursive doubling algorithms.

## Setup

```bash
# Install tools
pip install networkx matplotlib numpy scipy

# Download: nccl_allreduce_simulator.py (provided)
```

## Exercise 1: Ring AllReduce (20 min)

**Task:** Implement ring AllReduce simulator for N=64 GPUs.

```python
def ring_allreduce(N, data_size_mb, bandwidth_gbps):
    """
    Simulate ring AllReduce latency.
    
    Args:
      N: Number of GPUs
      data_size_mb: Gradient tensor size per GPU (MB)
      bandwidth_gbps: Per-link bandwidth (Gbps)
    
    Returns:
      latency_ms: Estimated time to complete AllReduce
    """
    
    steps = 2 * (N - 1)  # Total steps in ring
    per_step_data = data_size_mb / N  # Data per step
    per_step_time_ms = (per_step_data / bandwidth_gbps * 8) + 0.1  # +0.1ms latency
    
    total_time_ms = steps * per_step_time_ms
    return total_time_ms

# Test cases
configs = [
    (64, 1000, 400),  # 64 GPU, 1GB data, 400 Gbps (IB NDR)
    (64, 1000, 100),  # 64 GPU, 1GB data, 100 Gbps (Ethernet)
    (128, 1000, 400), # 128 GPU, 1GB data, 400 Gbps
]

for N, data_mb, bw in configs:
    latency = ring_allreduce(N, data_mb, bw)
    print(f"N={N}, data={data_mb}MB, bw={bw}Gbps → AllReduce time: {latency:.2f}ms")

# Output computed from the code above:
# N=64, data=1000MB, bw=400Gbps → AllReduce time: 51.97ms
# N=64, data=1000MB, bw=100Gbps → AllReduce time: 170.10ms
# N=128, data=1000MB, bw=400Gbps → AllReduce time: 65.09ms
```

**Rubric:** Simulation matches hand calculations (within ±10%). Explain why N=128 is only about 1.25x slower than N=64 (the bandwidth term 2(N-1)/N × S/B barely changes with N, while the latency term grows with the 2(N-1) steps).

## Exercise 2: Tree vs Ring (20 min)

**Task:** Compare tree and ring latencies for different N.

```python
def tree_allreduce(N, data_size_mb, bandwidth_gbps):
    """Tree AllReduce (balanced binary tree)"""
    depth = int(np.ceil(np.log2(N)))
    per_step_data = data_size_mb  # Full data per step (tree broadcasts aggregates)
    per_step_time_ms = (per_step_data / bandwidth_gbps * 8) + 0.5
    total_time_ms = 2 * depth * per_step_time_ms  # 2 phases: reduce + broadcast
    return total_time_ms

def recursive_doubling(N, data_size_mb, bandwidth_gbps):
    """Recursive doubling (logarithmic rounds, parallel communication)"""
    rounds = int(np.ceil(np.log2(N)))
    per_round_data = data_size_mb
    per_round_time_ms = (per_round_data / bandwidth_gbps * 8) + 0.2
    total_time_ms = rounds * per_round_time_ms
    return total_time_ms

# Comparison
N_values = [8, 16, 32, 64, 128, 256]
results = []

for N in N_values:
    ring = ring_allreduce(N, 1000, 400)
    tree = tree_allreduce(N, 1000, 400)
    rd = recursive_doubling(N, 1000, 400)
    results.append((N, ring, tree, rd))
    print(f"N={N:3d}: Ring={ring:6.2f}ms, Tree={tree:6.2f}ms, RD={rd:6.2f}ms")

# Plot
import matplotlib.pyplot as plt
N_vals, rings, trees, rds = zip(*results)
plt.figure(figsize=(10,6))
plt.plot(N_vals, rings, 'o-', label='Ring')
plt.plot(N_vals, trees, 's-', label='Tree')
plt.plot(N_vals, rds, '^-', label='Recursive Doubling')
plt.xlabel('Number of GPUs')
plt.ylabel('AllReduce Latency (ms)')
plt.legend()
plt.title('AllReduce Latency: Algorithm Comparison')
plt.grid()
plt.savefig('allreduce_comparison.png')

# Output for a 1000 MB message at 400 Gbps (computed from the code above):
# N=  8: Ring= 36.40ms, Tree=123.00ms, RD= 60.60ms
# N= 16: Ring= 40.50ms, Tree=164.00ms, RD= 80.80ms
# N= 32: Ring= 44.95ms, Tree=205.00ms, RD=101.00ms
# N= 64: Ring= 51.97ms, Tree=246.00ms, RD=121.20ms
# N=128: Ring= 65.09ms, Tree=287.00ms, RD=141.40ms
# N=256: Ring= 90.84ms, Tree=328.00ms, RD=161.60ms
#
# Now repeat with a 1 MB message (small, latency-bound):
# N=  8: Ring=  1.44ms, Tree=  3.12ms, RD=  0.66ms
# N= 32: Ring=  6.24ms, Tree=  5.20ms, RD=  1.10ms
# N= 64: Ring= 12.64ms, Tree=  6.24ms, RD=  1.32ms
# N=256: Ring= 51.04ms, Tree=  8.32ms, RD=  1.76ms
#
# Analysis questions:
#   1. For a 1000 MB message at N=64, ring is fastest. Why? (Hint: this simple tree sends the full
#      buffer at every level; ring is bandwidth-optimal.)
#   2. For a 1 MB message, which algorithm scales best as N grows, and why?
#   3. At what N does this model's tree beat ring for 1 MB messages? (Answer from the numbers: N=32.)
#   4. NCCL's real tree pipelines the message through a double binary tree, which removes most of
#      the full-buffer penalty seen here. What does that change in the conclusion?
```

**Rubric:** Plot must show correct curves for both message sizes. Explain the crossover: for small messages latency (number of steps) dominates and logarithmic-step algorithms win at larger N; for large messages bandwidth dominates and ring wins.

## Exercise 3: Topology Simulation (30 min)

**Task:** Simulate AllReduce on different cluster topologies.

```python
import networkx as nx

def simulate_topology_allreduce(topology_name, N_gpu, bandwidth_gbps, data_mb):
    """
    Simulate AllReduce latency for different cluster topologies.
    
    topology_name: 'single_rack', 'fat_tree', 'multi_rack'
    """
    
    if topology_name == 'single_rack':
        # Non-blocking fabric: every GPU gets its full link bandwidth
        effective_bw = bandwidth_gbps
        latency_ms = ring_allreduce(N_gpu, data_mb, effective_bw)

    elif topology_name == 'fat_tree':
        # Multi-level switching with 2:1 oversubscription (assumption)
        effective_bw = bandwidth_gbps * 0.5
        latency_ms = ring_allreduce(N_gpu, data_mb, effective_bw)

    elif topology_name == 'multi_rack':
        # Hierarchical AllReduce: across 8 racks at full speed, then 8 GPUs sharing a link
        # whose inter-rack bandwidth is limited to 20% (assumption)
        effective_bw = bandwidth_gbps * 0.2
        latency_ms = ring_allreduce(N_gpu // 8, data_mb, bandwidth_gbps) + \
                     ring_allreduce(8, data_mb, effective_bw)

    return latency_ms

# Test
topologies = ['single_rack', 'fat_tree', 'multi_rack']
for topo in topologies:
    lat = simulate_topology_allreduce(topo, 64, 400, 1000)
    print(f"{topo:15s}: {lat:6.2f} ms")

# single_rack     :  51.97 ms (best)
# fat_tree        :  91.35 ms (oversubscribed)
# multi_rack      : 212.80 ms (multi-level, slow inter-rack)

# Question: With a 1000 MB message at 400 Gbps, the bandwidth term alone is about
# 2(N-1)/N × 20 ms ≈ 40 ms. Can any topology reach <10 ms at 256 GPUs? What would you
# change (message size, sharding, overlap) instead?
```

**Rubric:** Topology simulation shows oversubscription effects. Justify why the limited inter-rack bandwidth dominates the multi-rack result, and note that these multipliers are assumptions.

## Exercise 4: Throughput Impact (20 min)

**Task:** Calculate training impact of AllReduce overhead.

```python
def training_iteration_time(batch_size, sequence_length, num_gpu, allreduce_latency_ms,
                            tokens_per_sec_per_gpu=940):
    """
    Estimate training iteration time for a data-parallel job with NO compute/communication overlap.

    Simplified model:
      - Forward + backward: compute-bound, scales with tokens per GPU
      - AllReduce: communication, depends on gradient size, not batch size
    """

    # Llama-70B on H100 at ~40% MFU: 0.40 × 989e12 / (6 × 70e9) ≈ 940 tokens/s per GPU (Chapter 01)
    # batch_size is the GLOBAL batch size, split across num_gpu GPUs in data parallelism
    tokens_per_gpu_per_iteration = (batch_size / num_gpu) * sequence_length

    compute_time_ms = (tokens_per_gpu_per_iteration / tokens_per_sec_per_gpu) * 1000
    communication_time_ms = allreduce_latency_ms
    iteration_time_ms = compute_time_ms + communication_time_ms
    return iteration_time_ms, compute_time_ms, communication_time_ms

# Scenario: Llama-70B training. BF16 gradients are ~140,000 MB; use the ring model from Exercise 1.
num_gpu = 64
batch_size = 128
sequence_length = 4096
grad_mb = 140_000

topologies = {name: simulate_topology_allreduce(name, num_gpu, 400, grad_mb)
              for name in ['single_rack', 'fat_tree', 'multi_rack']}

print("Training Iteration Time (ms), no overlap:")
print(f"{'Topology':15s} {'Total':>10s} {'Compute':>10s} {'AllReduce':>10s} {'Overhead':>10s}")
print("-" * 60)

for topo, allreduce_lat in topologies.items():
    iter_time, compute, allreduce = training_iteration_time(batch_size, sequence_length, num_gpu, allreduce_lat)
    overhead_pct = (allreduce / iter_time) * 100
    print(f"{topo:15s} {iter_time:10.1f}ms {compute:10.1f}ms {allreduce:10.1f}ms {overhead_pct:9.1f}%")

# Output computed from the code above:
# Topology        Total     Compute   AllReduce  Overhead
# single_rack    14240.0ms   8714.9ms   5525.1ms      38.8%
# fat_tree       19752.5ms   8714.9ms  11037.6ms      55.9%
# multi_rack     38117.7ms   8714.9ms  29402.8ms      77.1%

# Question: What is the training-time increase for multi_rack vs single_rack?
#   Answer: 38,117.7 / 14,240.0 ≈ 2.7x slower in this no-overlap, unsharded model.
#   Real jobs use sharding (FSDP/ZeRO), tensor/pipeline parallelism, and overlap with backward
#   compute, so the communicated volume per GPU and the exposed time are much smaller. The
#   lesson is how strongly topology and overlap decide communication overhead for a 70B model,
#   not the absolute numbers.
```

**Rubric:** Calculations correct. Explain why single-rack is cost-optimal despite higher CAPEX.

## Deliverables

1. **Simulation code** (runnable Python)
2. **Results summary** (table + plot):
   - AllReduce latencies for different N, topologies
   - Training overhead percentages
3. **Analysis** (1 page):
   - Why is ring AllReduce preferred for 64+ GPU?
   - When would you choose tree over ring?
   - What topology would you choose for 256-GPU cluster?

## Success Criteria

- [ ] Ring AllReduce simulation matches hand calculations
- [ ] Results show ring winning for large messages and tree/recursive doubling winning for small messages at larger N
- [ ] AllReduce overhead quantified for each topology
- [ ] Topology choice justified by cost-benefit analysis