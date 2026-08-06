---
title: Lab 02 — Benchmark Dynamic Batching
description: Measure how queue delay, preferred batch sizes, and concurrency scaling influence Triton inference throughput (RPS) and p95/p99 tail latency.
sidebar_position: 21
tags: [lab, batching, benchmarking, perf_analyzer, triton, latency]
---

# Lab 02 — Benchmark Dynamic Batching

## 1. Title and Metadata

```yaml
Title: Benchmark Dynamic Batching
Volume: 12
Chapter: 03
Difficulty: Intermediate
Estimated Time: 60 Minutes
Prerequisites: Completion of Lab 01, Linux CLI, Docker / NVIDIA Container Toolkit, Triton SDK
Target Platform: NVIDIA Ampere/Ada/Hopper/Blackwell GPUs, Ubuntu 22.04 LTS / Rocky Linux 9
Target Audience: Performance Engineers, MLOps Engineers, Inference SREs, Systems Architects
Lab Type: Hands-on Benchmarking & Tuning Lab
```

This lab provides an operational framework for tuning Triton Inference Server's dynamic batching engine. You will deploy multiple model configurations comparing unbatched, conservatively batched, and aggressively batched setups under variable client concurrency. Using NVIDIA `perf_analyzer`, you will profile queue delay, compute execution latency, batch size realization, and throughput trade-offs to establish an optimal operating point for latency-constrained inference pipelines.

---

## 2. Objective

By completing this lab, you will:
1. Construct and deploy three distinct Triton dynamic batching configurations (`config.pbtxt` variants).
2. Execute automated concurrency sweeps using NVIDIA `perf_analyzer` over gRPC channels.
3. Quantify the relationship between client concurrency ($C$), queue delay (`max_queue_delay_microseconds`), and realized batch sizes.
4. Extract server telemetry metrics (`nv_inference_queue_duration_us`, `nv_inference_compute_input_duration_us`) to isolate queue delay from GPU kernel execution time.
5. Identify the exact operating point that maximizes Requests Per Second (RPS) while satisfying a strict p99 Service Level Objective (SLO).
6. Inject misconfigured queue delays to observe tail latency degradation and low GPU occupancy.

---

## 3. Prerequisites

Before starting this lab, ensure you have:
- Completed **Lab 01 — Deploy and Validate Triton Inference Server**.
- Host GPU with at least 8 GB VRAM.
- Access to Docker with `nvidia-container-toolkit` enabled.
- Pinned Triton Server image (`nvcr.io/nvidia/tritonserver:24.03-py3`).
- Pinned Triton SDK image (`nvcr.io/nvidia/tritonserver:24.03-py3-sdk`) containing `perf_analyzer`.
- Available host ports: `8000` (HTTP REST), `8001` (gRPC), `8002` (Metrics).

---

## 4. Architecture and Lab Topology

The following diagram illustrates the interaction between `perf_analyzer` load generation, Triton's internal dynamic batcher queue, and GPU hardware execution:

```mermaid
flowchart TD
    subgraph ClientHost["Benchmarking Client"]
        PerfAnalyzer["perf_analyzer (SDK Container)
        Concurrency Sweeps: C=1 to C=64"]
    end

    subgraph ServerHost["Triton Server Host"]
        subgraph Container["Triton Container (:8001 gRPC / :8002 Metrics)"]
            gRPCServer["gRPC Front-End"]
            
            subgraph DynamicBatcher["Dynamic Batching Engine"]
                Scheduler["Batch Scheduler"]
                Queue["Request Queue
                Timer: max_queue_delay_us
                Preferred Sizes: [4, 8, 16]"]
            end

            ONNXEngine["ONNX Execution Engine
            Tensor Execution (Batch Size N)"]
            MetricsEngine["Prometheus Telemetry (:8002)"]
        end

        NVIDIAGPU["Physical GPU (A100 / L40S / H100)"]
    end

    PerfAnalyzer -->|gRPC Requests (Concurrency C)| gRPCServer
    gRPCServer --> Queue
    Queue -->|Formed Batch (Size N <= max_batch_size)| Scheduler
    Scheduler --> ONNXEngine --> NVIDIAGPU
    ONNXEngine -->|Update Queue & Compute Metrics| MetricsEngine
    PerfAnalyzer -->|Scrape Execution Telemetry| MetricsEngine
```

---

## 5. Required Tools and Software

| Tool / Component | Version Requirement | Purpose |
|---|---|---|
| Triton Server | `24.03-py3` | AI model serving engine |
| Triton SDK (`perf_analyzer`) | `24.03-py3-sdk` | High-performance inferencing benchmarking tool |
| `jq`, `awk`, `gnuplot` / `python` | Any modern version | Metric extraction, aggregation, and visualization |
| `curl` | Any modern version | Querying Prometheus telemetry metrics |

---

## 6. Environment Setup

Set up the benchmarking directory structure and prepare the three model repository configuration profiles:

```bash
export LAB2_DIR="${HOME}/triton_lab2"
export MODEL_REPO_BASE="${LAB2_DIR}/model_repository"
export TRITON_IMAGE="nvcr.io/nvidia/tritonserver:24.03-py3"
export TRITON_SDK_IMAGE="nvcr.io/nvidia/tritonserver:24.03-py3-sdk"

# Create model directory hierarchy
mkdir -p "${MODEL_REPO_BASE}/dense_net_nobatch/1"
mkdir -p "${MODEL_REPO_BASE}/dense_net_conservative/1"
mkdir -p "${MODEL_REPO_BASE}/dense_net_aggressive/1"

cd "${LAB2_DIR}"

# Download model binary for all three test configurations
wget -O "${LAB2_DIR}/model.onnx" \
  https://github.com/onnx/models/raw/main/validated/vision/classification/densenet-121/model/densenet-3.onnx

cp "${LAB2_DIR}/model.onnx" "${MODEL_REPO_BASE}/dense_net_nobatch/1/model.onnx"
cp "${LAB2_DIR}/model.onnx" "${MODEL_REPO_BASE}/dense_net_conservative/1/model.onnx"
cp "${LAB2_DIR}/model.onnx" "${MODEL_REPO_BASE}/dense_net_aggressive/1/model.onnx"
```

Now configure the three test profiles in `config.pbtxt`:

### Profile A: No Dynamic Batching (`dense_net_nobatch/config.pbtxt`)
```bash
cat <<'EOF' > "${MODEL_REPO_BASE}/dense_net_nobatch/config.pbtxt"
name: "dense_net_nobatch"
platform: "onnxruntime_onnx"
max_batch_size: 0

input [
  {
    name: "data_0"
    data_type: TYPE_FP32
    dims: [ 1, 3, 224, 224 ]
  }
]
output [
  {
    name: "fc6_1"
    data_type: TYPE_FP32
    dims: [ 1, 1000, 1, 1 ]
  }
]
instance_group [
  {
    count: 1
    kind: KIND_GPU
    gpus: [ 0 ]
  }
]
EOF
```

### Profile B: Conservative Dynamic Batching (`dense_net_conservative/config.pbtxt`)
```bash
cat <<'EOF' > "${MODEL_REPO_BASE}/dense_net_conservative/config.pbtxt"
name: "dense_net_conservative"
platform: "onnxruntime_onnx"
max_batch_size: 16

input [
  {
    name: "data_0"
    data_type: TYPE_FP32
    dims: [ 3, 224, 224 ]
  }
]
output [
  {
    name: "fc6_1"
    data_type: TYPE_FP32
    dims: [ 1000, 1, 1 ]
  }
]
dynamic_batching {
  preferred_batch_size: [ 4, 8, 16 ]
  max_queue_delay_microseconds: 5000
}
instance_group [
  {
    count: 1
    kind: KIND_GPU
    gpus: [ 0 ]
  }
]
EOF
```

### Profile C: Aggressive Dynamic Batching (`dense_net_aggressive/config.pbtxt`)
```bash
cat <<'EOF' > "${MODEL_REPO_BASE}/dense_net_aggressive/config.pbtxt"
name: "dense_net_aggressive"
platform: "onnxruntime_onnx"
max_batch_size: 64

input [
  {
    name: "data_0"
    data_type: TYPE_FP32
    dims: [ 3, 224, 224 ]
  }
]
output [
  {
    name: "fc6_1"
    data_type: TYPE_FP32
    dims: [ 1000, 1, 1 ]
  }
]
dynamic_batching {
  preferred_batch_size: [ 16, 32, 64 ]
  max_queue_delay_microseconds: 50000
}
instance_group [
  {
    count: 1
    kind: KIND_GPU
    gpus: [ 0 ]
  }
]
EOF
```

---

## 7. Estimated Duration

- Total Time: **60 Minutes**
  - Setup & Configuration: 10 mins
  - Deployment & Verification: 10 mins
  - Concurrency Sweeping with `perf_analyzer`: 20 mins
  - Metrics Analysis & Latency Decomposition: 10 mins
  - Failure Injection & Teardown: 10 mins

---

## 8. Safety and Safeguards

- **Thermal and Compute Isolation**: Ensure benchmarking runs do not execute concurrently with other GPU workloads.
- **Port Reuse Safeguards**: Use dedicated container naming (`triton_bench_server`) to avoid conflicts with previous lab instances.
- **Controlled Benchmarking Duration**: Limit `perf_analyzer` measurement windows (`--measurement-interval 10000` ms) to prevent long-running GPU saturation that could trigger host thermal throttling.

---

## 9. Baseline Verification

Confirm Triton Server starts cleanly with all three model configurations loaded:

```bash
# Launch Triton Server with model auto-poll mode
docker run -d --name triton_bench_server \
  --gpus '"device=0"' \
  --shm-size=1g \
  --net=host \
  -v "${MODEL_REPO_BASE}:/models" \
  ${TRITON_IMAGE} \
  tritonserver \
  --model-repository=/models \
  --log-verbose=1

# Wait 10 seconds for initialization
sleep 10

# Verify model readiness for all 3 configurations
curl -s http://localhost:8000/v2/models/dense_net_nobatch/ready && echo "No-batch ready"
curl -s http://localhost:8000/v2/models/dense_net_conservative/ready && echo "Conservative ready"
curl -s http://localhost:8000/v2/models/dense_net_aggressive/ready && echo "Aggressive ready"
```

All three calls must return HTTP status 200.

---

## 10. Step-by-Step Task Instructions

### Task 1: Execute Concurrency Sweep on Profile A (No Batching)

Launch `perf_analyzer` inside the SDK container to sweep concurrency levels $C \in \{1, 4, 8, 16, 32, 64\}$ over gRPC:

```bash
docker run --rm --net=host \
  ${TRITON_SDK_IMAGE} \
  perf_analyzer \
  -m dense_net_nobatch \
  -u localhost:8001 \
  -i grpc \
  --concurrency-range 1:64:8 \
  --measurement-interval 10000 \
  -f "${LAB2_DIR}/results_nobatch.csv"
```

Inspect the benchmark summary output generated by `perf_analyzer`.

### Task 2: Execute Concurrency Sweep on Profile B (Conservative Dynamic Batching)

Run the benchmark sweep against `dense_net_conservative` (max batch size 16, max queue delay 5ms):

```bash
docker run --rm --net=host \
  ${TRITON_SDK_IMAGE} \
  perf_analyzer \
  -m dense_net_conservative \
  -u localhost:8001 \
  -i grpc \
  --concurrency-range 1:64:8 \
  --measurement-interval 10000 \
  -f "${LAB2_DIR}/results_conservative.csv"
```

### Task 3: Execute Concurrency Sweep on Profile C (Aggressive Dynamic Batching)

Run the benchmark sweep against `dense_net_aggressive` (max batch size 64, max queue delay 50ms):

```bash
docker run --rm --net=host \
  ${TRITON_SDK_IMAGE} \
  perf_analyzer \
  -m dense_net_aggressive \
  -u localhost:8001 \
  -i grpc \
  --concurrency-range 1:64:8 \
  --measurement-interval 10000 \
  -f "${LAB2_DIR}/results_aggressive.csv"
```

### Task 4: Deconstruct Latency Components via Prometheus Metrics

Scrape Triton metric counters during an active benchmark run to observe realized queue delay versus compute execution time:

```bash
curl -s http://localhost:8002/metrics | grep -E 'nv_inference_queue_duration_us|nv_inference_compute_input_duration_us|nv_inference_exec_count'
```

Compute the average realization of batch sizes using Python:

```bash
python3 -c '
import urllib.request, re

content = urllib.request.urlopen("http://localhost:8002/metrics").read().decode("utf-8")
exec_counts = re.findall(r"nv_inference_exec_count{.*model=\"([^\"]+)\".*} (\d+)", content)
req_counts = re.findall(r"nv_inference_request_success{.*model=\"([^\"]+)\".*} (\d+)", content)

exec_dict = {m: float(c) for m, c in exec_counts}
req_dict = {m: float(c) for m, c in req_counts}

for model in req_dict:
    if exec_dict.get(model, 0) > 0:
        avg_batch = req_dict[model] / exec_dict[model]
        print(f"Model: {model:25s} | Realized Avg Batch Size: {avg_batch:.2f}")
'
```

---

## 11. Command Execution Standards

Detailed command specifications for key operations in this lab:

### Command 1: Execute `perf_analyzer` Concurrency Sweep
- **Purpose**: Measure throughput (RPS) and p99 latency across varying client concurrency levels.
- **Command**:
  ```bash
  docker run --rm --net=host ${TRITON_SDK_IMAGE} perf_analyzer -m dense_net_conservative -u localhost:8001 -i grpc --concurrency-range 1:64:8 --measurement-interval 10000
  ```
- **Expected Evidence**: Console displays output table listing Concurrency, Throughput (infer/sec), p50 Latency, p95 Latency, and p99 Latency.
- **Explanation**: `perf_analyzer` generates synthetic request traffic over gRPC, maintaining $C$ concurrent requests in flight. It measures client-side end-to-end latency and queries Triton server stats to break down queue, send, compute, and receive delays.
- **Common Failure Interpretation**: If throughput reads 0 RPS, check gRPC port 8001 connectivity or verify that model input tensor names match `config.pbtxt`.

### Command 2: Query Server-Side Latency Breakdown Metrics
- **Purpose**: Extract cumulative microsecond metrics for queue time and compute execution time.
- **Command**:
  ```bash
  curl -s http://localhost:8002/metrics | grep -E 'nv_inference_queue_duration_us|nv_inference_compute_input_duration_us'
  ```
- **Expected Evidence**: Prometheus text format counters `nv_inference_queue_duration_us{model="dense_net_conservative",...}`.
- **Explanation**: Reports hardware and software telemetry aggregated inside Triton core. Dividing total queue microseconds by successful request count yields mean queue time per request.
- **Common Failure Interpretation**: Metrics remaining at 0 indicates no traffic has been submitted to the model since server startup.

### Command 3: Export Benchmark Results to CSV
- **Purpose**: Save performance metrics for automated latency-throughput SLO curve plotting.
- **Command**:
  ```bash
  docker run --rm --net=host -v "${LAB2_DIR}:/out" ${TRITON_SDK_IMAGE} perf_analyzer -m dense_net_conservative -u localhost:8001 -i grpc --concurrency-range 1:64:8 -f /out/results_conservative.csv
  ```
- **Expected Evidence**: A structured CSV file created at `${LAB2_DIR}/results_conservative.csv`.
- **Explanation**: Exports raw data columns: `Concurrency`, `Inferences/Second`, `Client Send`, `Network+Server Queue`, `Server Compute Input`, `Client Recv`, `p99 latency`.
- **Common Failure Interpretation**: Permission denied writing CSV occurs if directory volume permissions inside container prevent non-root output writing.

---

## 12. Illustrative Output

### Representative `perf_analyzer` Output Snippet (`dense_net_conservative`)

```text
*** Measurement Settings ***
  Batch size: 1
  Service Kind: TritonServer
  Using "grpc" protocol
  Concurrency limit: 64
  Measurement interval: 10000 msec

Request concurrency: 1
  Client:
    Request count: 4500 secs
    Throughput: 450.0 infer/sec
    Avg latency: 2218 usec (latency p99: 3100 usec)
  Server:
    Inference count: 4500
    Execution count: 4500
    Successful request count: 4500
    Avg request latency: 1950 usec (overhead 150 usec + queue 200 usec + compute input 1600 usec)

Request concurrency: 16
  Client:
    Request count: 28000 secs
    Throughput: 2800.0 infer/sec
    Avg latency: 5680 usec (latency p99: 8900 usec)
  Server:
    Inference count: 28000
    Execution count: 2150
    Successful request count: 28000
    Avg request latency: 5200 usec (overhead 180 usec + queue 2400 usec + compute input 2620 usec)
```

### Comparative Benchmark Summary Table

| Profile Name | Max Batch Size | Queue Delay (`max_queue_delay_us`) | Peak Throughput (RPS @ C=64) | Latency p99 @ C=1 | Latency p99 @ C=64 | Realized Avg Batch Size |
|---|---|---|---|---|---|---|
| `dense_net_nobatch` | 0 (Disabled) | N/A | 520 RPS | 2.1 ms | 121.5 ms | 1.0 |
| `dense_net_conservative` | 16 | 5,000 (5ms) | 2,850 RPS | 3.1 ms | 8.9 ms | 13.0 |
| `dense_net_aggressive` | 64 | 50,000 (50ms) | 3,400 RPS | 51.2 ms | 48.5 ms | 48.2 |

---

## 13. Failure Injection

In this exercise, you will inject an excessive queue delay misconfiguration to observe severe tail latency degradation under low-concurrency workloads.

### Failure Scenario: Over-Allocated Queue Delay Under Low Load

1. Create a misconfigured model configuration (`dense_net_misconfigured`):
   ```bash
   mkdir -p "${MODEL_REPO_BASE}/dense_net_misconfigured/1"
   cp "${LAB2_DIR}/model.onnx" "${MODEL_REPO_BASE}/dense_net_misconfigured/1/model.onnx"

   cat <<'EOF' > "${MODEL_REPO_BASE}/dense_net_misconfigured/config.pbtxt"
   name: "dense_net_misconfigured"
   platform: "onnxruntime_onnx"
   max_batch_size: 64

   input [ { name: "data_0", data_type: TYPE_FP32, dims: [ 3, 224, 224 ] } ]
   output [ { name: "fc6_1", data_type: TYPE_FP32, dims: [ 1000, 1, 1 ] } ]
   dynamic_batching {
     preferred_batch_size: [ 64 ]
     max_queue_delay_microseconds: 500000  # 500ms delay!
   }
   instance_group [ { count: 1, kind: KIND_GPU, gpus: [ 0 ] } ]
   EOF
   ```

2. Wait for Triton to auto-load the new model (verify readiness):
   ```bash
   curl -s http://localhost:8000/v2/models/dense_net_misconfigured/ready
   ```

3. Run `perf_analyzer` at low concurrency ($C=2$):
   ```bash
   docker run --rm --net=host ${TRITON_SDK_IMAGE} perf_analyzer \
     -m dense_net_misconfigured \
     -u localhost:8001 \
     -i grpc \
     --concurrency-range 2:2 \
     --measurement-interval 10000
   ```

4. **Observe Anomaly Evidence**:
   - **Throughput**: Drops drastically to ~4 RPS.
   - **p99 Latency**: Spikes to **> 500,000 $\mu s$ (500 ms)**.
   - **Realized Batch Size**: Inspect metrics — average batch size is **2**, but requests waited the full 500ms timeout trying to reach preferred batch size 64.

5. **Recovery**:
   - Reduce `max_queue_delay_microseconds` to `5000` (5ms) or add smaller preferred batch sizes (`[4, 8, 16]`). Remove `dense_net_misconfigured` directory when complete.

---

## 14. Troubleshooting and Recovery

### Diagnostic Flowchart: Dynamic Batching Bottlenecks

```mermaid
flowchart TD
    Start["High p99 Inference Latency"] --> CheckMetrics["Inspect Prometheus Metrics (:8002)"]
    CheckMetrics --> CompareTimes{"Queue Time >> Compute Time?"}

    CompareTimes -- Yes --> CheckConcurrency{"High Concurrency Load?"}
    CheckConcurrency -- Yes --> IncreaseBatch["Increase `max_batch_size` or add GPU Model Instances (`count: 2`)"]
    CheckConcurrency -- No --> HighDelay["`max_queue_delay_microseconds` set too high! Reduce to <= 5ms"]

    CompareTimes -- No --> ComputeBound{"Compute Time High?"}
    ComputeBound -- Yes --> OptimizeEngine["Convert model to TensorRT FP16 / INT8 precision"]
    ComputeBound -- No --> NetworkBound["Inspect gRPC/HTTP network transfer and serialization"]
```

---

## 15. Validation and Verification Checklist

| Verification Item | Pass Condition | Status |
|---|---|---|
| Model Configuration Setup | `dense_net_nobatch`, `conservative`, `aggressive` models loaded | [ ] |
| `perf_analyzer` Execution | SDK container successfully executes concurrency sweeps | [ ] |
| Throughput Scaling Verified | Conservative batching yields &gt; 4x RPS improvement over no-batching | [ ] |
| Metrics Telemetry Analysis | Extracted `nv_inference_queue_duration_us` and compute time | [ ] |
| Realized Batch Size Computed | Calculated average realized batch size matches expectation | [ ] |
| Failure Mode Reproduced | 500ms delay with low concurrency reproduces p99 SLO violation | [ ] |
| Clean Teardown Executed | Benchmarking server container terminated and files removed | [ ] |

---

## 16. Cleanup and Teardown

Execute the following cleanup commands to restore host state:

```bash
# 1. Stop and remove benchmarking Triton container
docker stop triton_bench_server && docker rm triton_bench_server

# 2. Remove lab workspace directory
rm -rf "${LAB2_DIR}"

# 3. Unset environment variables
unset LAB2_DIR MODEL_REPO_BASE TRITON_IMAGE TRITON_SDK_IMAGE

# 4. Verify no remaining benchmark containers
docker ps | grep triton
```

---

## 17. Production Considerations

When deploying dynamic batching in enterprise production serving infrastructure:

1. **Service Level Objective (SLO) Latency Budgeting**:
   - Allocate `max_queue_delay_microseconds` as a strict fraction (e.g. 10–20%) of your total end-to-end SLA budget. If total SLA is 20ms, queue delay must not exceed 2–4ms.
2. **Preferred Batch Size Selection**:
   - Align `preferred_batch_size` values with Tensor Core execution thresholds. On NVIDIA Ampere, Hopper, and Blackwell architectures, batch sizes that are multiples of 8 or 16 maximize matrix multiplication (GEMM) efficiency.
3. **Multi-Instance Model Execution**:
   - Combine dynamic batching with multi-instance execution (`instance_group [ { count: 2, kind: KIND_GPU } ]`). This permits Triton to execute CUDA kernels for one batch while building the next batch in parallel.

---

## 18. Summary and Next Steps

In this lab, you configured Triton's dynamic batching engine, performed concurrency sweeps using NVIDIA `perf_analyzer`, and decomposed inference latency into queue delay and kernel execution components. You proved that dynamic batching can increase inference throughput by over 400% with negligible impact on low-concurrency latency when properly tuned.

**Next Lab**: In **Lab 03 — Deploy an LLM with vLLM**, you will transition to Large Language Model (LLM) serving architectures. You will deploy vLLM with PagedAttention, evaluate continuous batching, and profile Time To First Token (TTFT) and Inter-Token Latency (ITL).
