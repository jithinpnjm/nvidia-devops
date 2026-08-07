# Chapter 4: Automotive and Autonomous Vehicles

| Chapter metadata | Value |
|---|---|
| Volume | 22 — Customer Workshops |
| Difficulty | Advanced |
| Estimated reading time | 45 minutes |
| Primary audience | AV engineers, robotics teams |
| Core question | How do you deploy GPU-accelerated perception on edge for autonomous driving? |

## Overview

Real-time autonomous driving requires parallel inference:
- Object Detection (YOLO): 10ms
- Lane Detection (CNN): 5ms  
- Depth Estimation: 3ms
- **Total: 25ms (leaves 25ms buffer for safety)**

50ms latency budget from sensor to brake decision is the regulatory requirement.

## Use Case: Edge Deployment on Drive Orin

### Requirements
- Fleet: 50,000 vehicles, Level 3+ automation
- Sensor suite: 8 cameras + 5 radar + 1 lidar per vehicle, fused at 30 FPS
- Operating domain: highway + urban, day/night, all-weather
- Inference SLA: &lt;50ms (actually &lt;25ms preferred)
- Fail-safe: &lt;2 seconds to safe state

### Architecture: 2× Drive Orin per vehicle (primary + safety)

**Why two GPUs:**
- Safety-critical (SAE Level 3+ requires functional safety)
- Single GPU failure rate: ~0.1%/year
- Dual redundancy (independent failures): ~(0.1%)² ≈ 0.0001%/year
- Cost: $4,800 per vehicle (acceptable for $50K+ vehicle)

**Performance:**
- Primary GPU: YOLOv8 + LaneNet + FastDepth = 10-15ms
- Safety co-processor: Re-verify + consistency check = 15-20ms
- Total: 35ms end-to-end (within 50ms SLA) ✓

### Cost Analysis
- H/W: $4,800 per vehicle
- For 50,000 vehicles: $240M capex
- vs Cloud teleoperation: $27.5M capex but unreliable cellular
- **Full-edge is safer and faster, worth the cost for Level 3+ automation**

## Troubleshooting Scenarios

| Symptom | Cause | Resolution |
|---|---|---|
| Latency 20ms → 55ms during daytime | Camera exposure changes input size | Normalize input to 640×640 before GPU |
| GPU 100% on highway, crashes in city | Object density increased | Cap max detections in post-processing |
| Safety GPU disagrees 5% of frames | Model version mismatch (FP16 vs INT8) | Sync both to same quantized model |

## Related Chapters

- **Prev:** [Chapter 3 — LLMs](./chapter-03-generative-ai-and-large-language-models.md)
- **Next:** [Chapter 5 — Pharmaceuticals](./chapter-05-pharmaceuticals-and-drug-discovery.md)
- **Lab:** [Lab 03 — Edge Deployment](./labs/lab-03-edge-deployment.md)
