# Volume 18 — Security

## Overview

Production AI infrastructure must protect models, data, and computational resources from multiple threat vectors. This volume covers the complete security architecture for AI systems: from hardware trust through incident response.

| Chapter | Topic | Focus |
|---|---|---|
| 1 | Threat Modeling | Identify assets, attackers, trust boundaries, attack surfaces |
| 2 | Hardware & Firmware Trust | Secure Boot, driver signing, GPU firmware, attestation |
| 3 | Containers & Supply Chain | Image signatures, SBOMs, scanning, NGC trust |
| 4 | Kubernetes RBAC | Access control, namespace isolation, secret protection |
| 5 | Pod Security & Network Policies | PSS, capabilities, seccomp, network isolation |
| 6 | GPU Sharing Security | MIG isolation, time-slicing, vGPU, side-channels |
| 7 | DMA, IOMMU, SR-IOV | Device isolation, DMA attacks, virtual functions |
| 8 | BlueField & DOCA | DPU security, network enforcement, attestation |
| 9 | Confidential Computing | TEEs, SGX, GPU CCM, remote attestation |
| 10 | Data & Model Protection | Encryption in motion/at rest, model versioning, signing |
| 11 | Audit & Compliance | Logging, incident investigation, regulatory evidence |
| 12 | Incident Response | Playbooks, containment, recovery, lessons learned |

## Learning Path

**Prerequisite knowledge:** Kubernetes fundamentals (Volume 10), GPU basics (Volume 4), AI workload patterns (Volume 12-13).

**Expected outcome:** Ability to design and verify security controls across an AI infrastructure platform; respond to security incidents with evidence-based investigation; demonstrate compliance to auditors.

## Key Principles

1. **Defense in depth:** No single control is sufficient; layer controls across multiple boundaries.
2. **Trust verification:** Don't assume; verify every boundary (Secure Boot, RBAC, network policy, GPU isolation).
3. **Evidence over assertions:** Security incidents must be investigated using audit logs and observable evidence, not assumptions.
4. **Trade-offs are explicit:** Security always costs (performance, complexity, cost); document trade-offs clearly.
5. **Insider threat is real:** Even with external attack prevention, internal access must be controlled and audited.

## Labs

- Lab 1: Validate Secure Boot and Driver State
- Lab 2: Build and Verify a Signed Container
- Lab 3: Design and Verify Multi-Tenant RBAC
- Lab 4: Deploy Restricted Pod with Network Policy

## Production Checklist

- [ ] Secure Boot enabled on all nodes; audit boot logs
- [ ] Kernel module signing enforced; GPU drivers signed
- [ ] Container images scanned for CVEs; only approved versions deployed
- [ ] RBAC policies deployed; least-privilege verified for all workloads
- [ ] Pod Security Standards enforced at admission time
- [ ] Network policies deployed; default-deny with explicit allow rules
- [ ] GPU isolation verified (MIG or dedicated GPUs for sensitive workloads)
- [ ] IOMMU enabled and configured; DMA faults monitored
- [ ] DPU deployed with security policy enforcement (if using BlueField)
- [ ] Confidential computing enabled for high-value models (if available)
- [ ] Model artifacts signed and verified before deployment
- [ ] Audit logging enabled and centralized; retention ≥90 days
- [ ] Incident response playbooks written and tested quarterly
- [ ] Security assessments completed; compliance evidence collected

## Related Volumes

- **Volume 4:** GPU and CUDA architecture (foundation for understanding GPU security boundaries)
- **Volume 10:** Kubernetes GPU Operator (device integration layer)
- **Volume 11:** GPU Sharing (architecture for MIG, time-slicing)
- **Volume 16:** Observability (audit logs, monitoring for security signals)
