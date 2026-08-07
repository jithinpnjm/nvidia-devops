---
title: "Chapter 12 - Incident Response and Troubleshooting"
slug: "chapter-12-incident-response-troubleshooting"
sidebar_position: 12
description: "Execute incident response playbooks for common attacks, practice containment and recovery, design security runbooks for AI infrastructure."
---

# Chapter 12 — Incident Response and Troubleshooting

**Learning outcome:** Execute incident response procedures for common security incidents, practice containment and recovery, design and test security runbooks.

## 12.1 Common AI infrastructure security incidents and response playbooks

**Incident 1: Model weights leaked via API**

```
INCIDENT: Production model weights downloaded by unauthorized actor
TIMELINE:
  14:00 - Alert: Model secret accessed 50 times in 5 min by unknown-user
  14:05 - Investigation: Audit logs show API token = prod-inference-old-v1
  14:10 - Conclusion: Token leaked (likely left in GitHub commit)
  
RESPONSE:
  Step 1: CONTAIN
    - Revoke token immediately: kubectl delete secret prod-inference-old-v1
    - Rotate all model registry credentials
    - Pull affected pod: kubectl delete pod inference-xxx
  
  Step 2: ASSESS
    - Query audit logs: what else accessed during breach window?
    - Check if multiple models were accessed
    - Determine if data was egressed (check network logs)
  
  Step 3: NOTIFY
    - Alert customers: "Model weights may have been accessed"
    - Provide audit evidence showing time and scope
    - Offer rollback to pre-breach model version
  
  Step 4: REMEDIATE
    - Scan codebase for leaked secrets (git-secrets, TruffleHog)
    - Rotate all service account tokens
    - Force password reset for personnel with access
    - Update incident response procedures (why was old token still active?)
  
  Step 5: VERIFY
    - Confirm new token works for legitimate inference
    - Confirm old token no longer authenticates
    - Re-run audit query to verify no new leaks
```

**Incident 2: Unauthorized GPU access from adjacent pod**

```
INCIDENT: Pod-B reads GPU memory from Pod-A via side-channel attack
TIMELINE:
  10:30 - Performance anomaly: Pod-A latency 2x normal
  10:35 - Audit: Pod-B repeatedly calling nvidia-smi during Pod-A run
  10:40 - Investigation: Both pods sharing same physical GPU with time-slicing
  
RESPONSE:
  Step 1: ISOLATE
    - kubectl cordon node-01  (mark node as no-new-pods)
    - kubectl drain node-01 --delete-emptydir-data (evict all pods safely)
    - Switch Pod-A and Pod-B to separate GPUs (or dedicated GPU per pod)
  
  Step 2: VERIFY ISOLATION
    - Confirm Pod-B cannot access Pod-A's GPU memory:
      kubectl exec pod-b -- nvidia-smi  # Should not see Pod-A's allocations
    - Run memory access test: Pod-B attempts cache eviction; measure latency
      (Should see no side-channel signal if properly isolated)
  
  Step 3: REVIEW
    - Was Pod-B marked as untrusted? If yes, why did it get time-slicing?
    - Should Pod-B have ever had GPU access at all?
    - Update Pod Security Policy to prevent future co-location
```

**Incident 3: Container escape via runtime vulnerability**

```
INCIDENT: Container process gained shell access to host
TIMELINE:
  03:45 - Alert: Container executed /bin/sh on host (detected by falco)
  03:46 - Network: Attacker spawned reverse shell to 203.0.113.99
  03:47 - Investigation: runc version has known CVE-2024-XXXXX
  
RESPONSE:
  Step 1: IMMEDIATE CONTAINMENT
    - Kill the container: kubectl delete pod malicious-pod --grace-period=0 --force
    - Isolate the node: firewall rule to deny all traffic from node to external
    - Change SSH keys: recreate all host SSH keys
  
  Step 2: FORENSICS (preserve evidence)
    - Copy /var/log/audit/audit.log from affected node (before it's erased)
    - Export pod logs: kubectl logs malicious-pod > /archive/malicious-pod.log
    - Take filesystem snapshot of node: `dd if=/dev/sda of=/archive/node-disk.img`
  
  Step 3: REMEDIATION
    - Patch runc vulnerability: apt update && apt upgrade container-runtimes
    - Reboot host (or reimage from known-good image)
    - Restart Kubelet
  
  Step 4: VERIFY NO OTHER COMPROMISE
    - Scan all running pods for same CVE: check container image versions
    - Audit: check if attacker accessed other nodes via lateral movement
    - Review network logs: did attacker exfiltrate data?
  
  Step 5: HARDEN
    - Update container runtime scanning to catch known CVEs at admission time
    - Add seccomp profile to prevent certain syscalls (to reduce escape surface)
    - Deploy Falco + alerts for future suspicious shell spawning
```

## 12.2 Runbook template: step-by-step incident response

```yaml
---
# Security Incident Runbook Template
incident-type: "Unauthorized GPU Access"
severity: "High"
detection-method: "Audit log anomaly alert"
response-time-target: "15 minutes to containment"

steps:
  - name: "Detect and Alert"
    owner: "Security monitoring"
    action: |
      Alert fires when:
      - Single user/pod accesses model secret 10+ times in 5 min
      - Alert includes: user ID, resource, access time, source IP
  
  - name: "Page on-call"
    owner: "PagerDuty escalation"
    action: |
      - Page security on-call engineer
      - Create incident ticket (auto-populated with alert context)
  
  - name: "Assess Scope"
    owner: "Security engineer (0-5 min)"
    action: |
      - Is attacker still active? (grep recent audit logs)
      - How many resources compromised? (count distinct objects accessed)
      - Is egress happening? (check network flow logs for external IPs)
  
  - name: "Contain"
    owner: "Security engineer (5-10 min)"
    action: |
      - Revoke attacker's token/credentials
      - Rotate model registry tokens
      - Block attacker's IP via firewall/network policy
  
  - name: "Investigate"
    owner: "Security engineer (10-15 min)"
    action: |
      - Export audit logs for analysis
      - Determine: how did attacker gain credentials? (phishing? leaked code? insider?)
  
  - name: "Notify"
    owner: "Incident commander"
    action: |
      - Alert affected customers
      - Provide timeline and scope (audit log evidence)
  
  - name: "Remediate"
    owner: "Platform team"
    action: |
      - Fix root cause (revoke old tokens, scan code for leaks, etc.)
      - Update runbook based on lessons learned
  
  - name: "Verify"
    owner: "Security engineer"
    action: |
      - Confirm incident is closed (no new suspicious activity)
      - Confirm fix prevented recurrence (test with red team)
```

## 12.3 Security testing: red team exercises and tabletop drills

**Tabletop drill: model exfiltration scenario**

```
Facilitator: "It's 2pm on a Tuesday. A researcher reports their model is on GitHub.
            The model was trained 3 days ago. What do you do?"

Team answer (good):
  "First, we'd check when the GitHub repo was created (timestamp).
   Then we'd query audit logs from that window to see who accessed the model.
   We'd check network logs for data exfiltration to external IPs.
   We'd revoke any credentials used during that window.
   We'd notify the researcher and any customers using the model."

Facilitator: "The audit logs show no suspicious access, but the model appears
            on GitHub an hour after the researcher finished training."

Team answer (better):
  "If audit logs are clean but model is exfiltrated, either:
   1. The researcher themselves uploaded it (check their GitHub account)
   2. Audit logs were tampered with (check audit log integrity)
   3. Exfiltration happened outside our audit scope (e.g., via physical copy)
   
   We'd ask: does the GitHub model hash match our model?
   If yes: someone with legitimate access uploaded it
   If no: model was modified; possible incident"
```

## 12.4 Troubleshooting: security issues vs. false positives

| Alert | Interpretation | Check | Action |
|---|---|---|---|
| "Pod denied access to secret" | Pod trying to read secret it shouldn't | Audit log shows verb=get, status=403; check RBAC | Is RBAC rule correct? If yes, pod is misconfigured or malicious; fix or isolate |
| "High IOMMU faults" | GPU DMA blocked by IOMMU repeatedly | Check IOMMU logs; identify source device | Malicious GPU driver or misconfiguration; reset device |
| "NetworkPolicy: dropped packet" | Packet violation of network policy | Check policy rules; identify src/dst/port | Is policy rule correct? If yes, traffic is unauthorized; investigate |
| "Repeated attestation failures" | GPU CCM attestation fails every 5 min | Check GPU firmware version; check attestation cert | Stale cert or firmware update needed; rotate cert; update firmware |
| "Secret access spike" | Unusual frequency of secret reads | Correlate with legitimate operations (e.g., deployment rollout) | If correlated: normal; if not: investigate |

## 12.5 Lessons learned: improving after incidents

After an incident is closed, schedule a blameless postmortem:

```
Incident: Model weights leaked via hardcoded token in GitHub
Date: 2026-08-05

TIMELINE:
  Jul 20 - Dev accidentally commits prod token to GitHub private repo
  Aug 05 - Token leaked when repo is made public (3 weeks later)
  Aug 05 14:00 - Alert fires
  Aug 05 14:15 - Incident contained

LESSONS LEARNED:
  1. Secret detection (git-secrets) should run in pre-commit hook
     Action: Enable pre-commit hook in all repos; scan existing repos

  2. Token rotation should be weekly, not yearly
     Action: Implement automated token rotation via Vault

  3. Alerts should fire after 1st unauthorized access, not 50th
     Action: Lower alert threshold from 50 to 5 attempts

  4. We didn't know repo was made public until alert fired
     Action: Add monitoring for private -> public repo changes

OWNER & DEADLINE:
  Infosec: Enable git-secrets (1 week)
  Platform: Implement Vault token rotation (2 weeks)
  Monitoring: Lower alert threshold (1 week)
  Repos: Audit for leaked secrets (1 month)
```

## Key Takeaways

- Have written incident response playbooks for common attacks; practice regularly.
- Containment is the first priority; investigation can happen in parallel.
- Audit logs are your primary evidence for determining scope and root cause.
- After each incident, update runbooks and controls to prevent recurrence.
- Red team exercises and tabletop drills prepare teams for real incidents.

## Cross References

- Previous: [Chapter 11 — Audit, Logging, and Compliance](./chapter-11-placeholder.md)
- Related labs: All previous labs (practice validates procedures)

---

# Volume 18 Summary

This volume covered the complete security landscape for AI infrastructure:

1. **Threat Modeling** — Identify assets, attackers, and attacks
2. **Hardware & Firmware** — Secure Boot, drivers, attestation
3. **Supply Chain** — Image signatures, SBOMs, container scanning
4. **Kubernetes Access Control** — RBAC, namespace isolation, secret protection
5. **Pod Security** — PSS, capabilities, seccomp, network policies
6. **GPU Sharing** — MIG isolation, time-slicing trade-offs, side-channels
7. **DMA & Isolation** — IOMMU, SR-IOV, device assignment
8. **BlueField/DOCA** — DPU-based security, network enforcement
9. **Confidential Computing** — TEEs, attestation, model protection
10. **Data Protection** — Encryption in motion and at rest, model versioning
11. **Audit & Compliance** — Logging, evidence collection, regulatory alignment
12. **Incident Response** — Playbooks, containment, recovery, lessons learned

Each layer builds on the previous; a complete security posture requires all layers working together.
