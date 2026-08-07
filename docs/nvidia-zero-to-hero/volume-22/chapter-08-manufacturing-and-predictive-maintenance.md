# Chapter 8: Manufacturing and Predictive Maintenance

| Chapter metadata | Value |
|---|---|
| Volume | 22 — Customer Workshops |
| Difficulty | Intermediate |
| Estimated reading time | 35 minutes |

## Overview

Predictive maintenance reduces equipment downtime 30-50%, saving $100Ks-$1Ms per facility annually.

## Use Case: Bearing Failure Prediction (50 production lines, 1,250 bearings)

### Requirements
- Production lines: 50
- Bearings per line: 25
- Total bearings: 1,250
- Sensors: 3-axis accelerometer per bearing
- Data rate: 10 kHz → 1 sec aggregates
- Prediction window: 7-14 days before failure

### Architecture: 1 Jetson Orin NX per production line

**Why Jetson Orin NX:**
- Cost: $449 × 50 = $22.5K (within $50K budget)
- Power: 25W (acceptable for factory)
- Model: XGBoost + Isolation Forest locally
- Latency: <100ms for 25 bearings

**Performance:**
- Inference: 5ms per bearing × 25 = 125ms total
- Monitoring: Real-time, detect failures 7-14 days ahead
- Latency requirement: <100ms ✓

### ROI

**Current state:**
- 10 failures/year × $50K downtime = $500K/year

**With predictive maintenance:**
- Detected failures: 7/10 (70% detection)
- Avoided downtime: 7 × $150K = $1.05M/year
- Infrastructure cost: $22.5K hardware + $67.5K ops = $90K/year
- **Net benefit: $960K/year**
- **Payback: 3 weeks**

## Troubleshooting

| Symptom | Cause | Resolution |
|---|---|---|
| False alarms (health drops then recovers) | Sensor drift or electrical noise | Recalibrate or add shielded cable |
| Missed failures (bearing fails with high health) | Model trained on different equipment | Retrain on field data |
| Edge offline every 6 hours | Power brownout on production line | Add UPS or upgrade line power |

## Related Chapters

- **Prev:** [Chapter 7 — Healthcare](./chapter-07-healthcare-and-medical-imaging.md)
- **Next:** [Chapter 9 — Scientific Research](./chapter-09-scientific-research-and-simulation.md)
