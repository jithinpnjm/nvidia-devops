---
title: "Senior Deep Dive 8 — Complete project: GPU fleet health CLI"
slug: "senior-deep-dive-8-complete-project-gpu-fleet-health-cli"
sidebar_position: 25
description: "Senior Deep Dive 8 — Complete project: GPU fleet health CLI — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
Build one tool that combines the concepts: discover GPU nodes, query Kubernetes allocatable resources, run or consume GPU health telemetry, optionally query Prometheus, classify findings and produce both human and JSON output. The architecture below separates policy from transport so the same classifier can be used in a CLI, scheduled job or API service.

**Recommended production package shape**

\# package layout
fleetcheck/
  pyproject.toml
  src/fleetcheck/
    \_\_init\_\_.py
    cli.py          # argparse/click/typer boundary
    model.py        # dataclasses / enums
    kubernetes.py   # K8s API adapter
    gpu.py          # DCGM/nvidia-smi adapter
    prometheus.py   # metrics adapter
    classify.py     # pure health decisions
    report.py       # table/json output
  tests/
    test\_classify.py
    test\_gpu\_parser.py
    test\_retry.py

**Keep health policy pure and explicit; UNKNOWN is not HEALTHY**

from dataclasses import dataclass
from enum import StrEnum

class Health(StrEnum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    FAILED = "failed"
    UNKNOWN = "unknown"

@dataclass(frozen=True)
class GpuSample:
    uuid: str
    temperature\_c: int | None
    power\_w: float | None
    xid\_errors: int | None


def classify\_gpu(s: GpuSample) -> Health:
    if s.xid\_errors is None or s.temperature\_c is None:
        return Health.UNKNOWN
    if s.xid\_errors > 0:
        return Health.FAILED
    if s.temperature\_c >= 85:
        return Health.DEGRADED
    return Health.HEALTHY
