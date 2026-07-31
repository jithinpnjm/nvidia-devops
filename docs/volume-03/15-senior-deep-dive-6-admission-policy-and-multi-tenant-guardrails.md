---
title: "Senior Deep Dive 6 — Admission, policy and multi-tenant guardrails"
slug: "senior-deep-dive-6-admission-policy-and-multi-tenant-guardrails"
sidebar_position: 15
description: "Senior Deep Dive 6 — Admission, policy and multi-tenant guardrails — Kubernetes and Platform Engineering."
source_document: "Volume_03_Kubernetes_and_Platform_Engineering(3).docx"
---
Authentication answers who; authorization answers whether that identity may perform an API verb; admission can mutate or validate the object after authorization and before persistence. Pod Security Admission enforces Pod Security Standards at namespace boundaries. ValidatingAdmissionPolicy provides in-process CEL policy and is a strong choice for deterministic validation without webhook availability risk. Webhooks remain useful for integrations and mutations but they extend the control-plane failure path.

**Policy evidence**

\# Can this identity perform the action?
kubectl auth can-i create pods --as=system:serviceaccount:team-a:builder -n team-a

# Namespace Pod Security Admission example
kubectl label ns team-a pod-security.kubernetes.io/enforce=restricted

# Inspect admission webhooks and policies
kubectl get validatingwebhookconfigurations,mutatingwebhookconfigurations
kubectl get validatingadmissionpolicies,validatingadmissionpolicybindings
