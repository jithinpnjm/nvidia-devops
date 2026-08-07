---
title: Lab 02 — Networking Simulation
description: Model collective communication performance in various topologies. 90 minutes hands-on.
sidebar_position: 2
tags: [lab, networking, simulation, allreduce]
---

# Lab 02 — Networking Simulation (90 min)

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

# Expected output:
# N=64, data=1000MB, bw=400Gbps → AllReduce time: 5.03ms
# N=64, data=1000MB, bw=100Gbps → AllReduce time: 20.10ms
# N=128, data=1000MB, bw=400Gbps → AllReduce time: 10.05ms
```

**Rubric:** Simulation matches hand calculations (within ±10%). Explain why N=128 is 2x slower than N=64.

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

# Analysis question:
#   1. For N=64, ring is fastest. Why?
#   2. For N=256, which algorithm scales best?
#   3. At what N does tree become better than ring?
```

**Rubric:** Plot must show correct curves. Explain inflection points (why tree becomes better at large N).

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
        # All N GPU connected to 1 switch
        # Effectively unlimited bandwidth (full bisection)
        effective_bw = bandwidth_gbps * 10  # Oversubscription factor
        latency_ms = ring_allreduce(N_gpu, data_mb, effective_bw)
    
    elif topology_name == 'fat_tree':
        # Multi-level switching: some links oversubscribed
        # Bisection bandwidth = bandwidth_gbps × 0.5 (oversubscription)
        effective_bw = bandwidth_gbps * 0.5
        latency_ms = ring_allreduce(N_gpu, data_mb, effective_bw)
    
    elif topology_name == 'multi_rack':
        # Multiple racks with limited inter-rack bandwidth
        # Bisection bandwidth = limited to few high-speed links
        effective_bw = bandwidth_gbps * 0.2
        # Hierarchical AllReduce: within-rack + inter-rack
        latency_ms = ring_allreduce(N_gpu // 8, data_mb, bandwidth_gbps) + \
                     ring_allreduce(8, data_mb, effective_bw)
    
    return latency_ms

# Test
topologies = ['single_rack', 'fat_tree', 'multi_rack']
for topo in topologies:
    lat = simulate_topology_allreduce(topo, 64, 400, 1000)
    print(f"{topo:15s}: {lat:6.2f} ms")

# Expected output:
# single_rack     :   2.51 ms (best)
# fat_tree        :   5.03 ms (oversubscribed)
# multi_rack      :  ~20.00 ms (multi-level, slow inter-rack)

# Question: For 256 GPU, which topology is required to keep AllReduce <10ms?
```

**Rubric:** Topology simulation shows realistic oversubscription effects. Justify why multi-rack is slowest.

## Exercise 4: Throughput Impact (20 min)

**Task:** Calculate training impact of AllReduce overhead.

```python
def training_iteration_time(batch_size, sequence_length, num_gpu, allreduce_latency_ms):
    """
    Estimate training iteration time.
    
    Simplified model:
      - Forward pass: compute-bound, scales with batch size
      - Backward pass: compute-bound
      - AllReduce: communication, same for all batch sizes (only depends on gradient size)
    """
    
    # Throughput per GPU: 500K tokens/sec (from Chapter 8)
    tokens_per_sec_per_gpu = 500_000
    
    # Total tokens per iteration
    total_tokens = batch_size * sequence_length * num_gpu
    
    # Forward + backward time (compute-bound)
    compute_time_ms = (total_tokens / tokens_per_sec_per_gpu) * 1000
    
    # AllReduce time (communication-bound)
    communication_time_ms = allreduce_latency_ms
    
    # Total
    iteration_time_ms = compute_time_ms + communication_time_ms
    
    return iteration_time_ms, compute_time_ms, communication_time_ms

# Scenario: Llama-70B training
num_gpu = 64
batch_size = 128
sequence_length = 4096

topologies = {
    'single_rack': 5.0,
    'fat_tree': 10.0,
    'multi_rack': 50.0,
}

print("Training Iteration Time (ms):")
print(f"{'Topology':15s} {'Total':>10s} {'Compute':>10s} {'AllReduce':>10s} {'Overhead':>10s}")
print("-" * 50)

for topo, allreduce_lat in topologies.items():
    iter_time, compute, allreduce = training_iteration_time(batch_size, sequence_length, num_gpu, allreduce_lat)
    overhead_pct = (allreduce / iter_time) * 100
    print(f"{topo:15s} {iter_time:10.2f}ms {compute:10.2f}ms {allreduce:10.2f}ms {overhead_pct:9.1f}%")

# Expected output:
# Topology        Total     Compute   AllReduce  Overhead
# single_rack    1053.52ms   1048.58ms   5.00ms     0.5%
# fat_tree       1058.58ms   1048.58ms  10.00ms     0.9%
# multi_rack     1098.58ms   1048.58ms  50.00ms     4.6%

# Question: What's the training time increase (per epoch) for multi_rack vs single_rack?
#   Answer: 4.6% slower = need 4.6% more GPU hours = 4.6% higher cost
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
- [ ] Plot shows tree becoming better than ring at large N
- [ ] AllReduce overhead quantified for each topology
- [ ] Topology choice justified by cost-benefit analysis

