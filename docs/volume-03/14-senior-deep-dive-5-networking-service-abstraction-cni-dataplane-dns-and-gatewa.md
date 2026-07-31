---
title: "Senior Deep Dive 5 — Networking: Service abstraction, CNI dataplane, DNS and Gateway API"
slug: "senior-deep-dive-5-networking-service-abstraction-cni-dataplane-dns-and-gatewa"
sidebar_position: 14
description: "Senior Deep Dive 5 — Networking: Service abstraction, CNI dataplane, DNS and Gateway API — Kubernetes and Platform Engineering."
source_document: "Volume_03_Kubernetes_and_Platform_Engineering(3).docx"
---
Trace north-south and east-west traffic explicitly. A Service is an API abstraction over endpoints; implementation may use iptables, IPVS or eBPF depending on the dataplane. CNI configures Pod interfaces and routing; CoreDNS implements service discovery; NetworkPolicy is enforced by the chosen network plugin. A service-mesh proxy adds another hop and another failure domain.

**Network triage follows the actual packet path**

\# Service -> EndpointSlice -> Pod
kubectl get svc mysvc -o yaml
kubectl get endpointslice -l kubernetes.io/service-name=mysvc -o yaml
kubectl get pod -l app=myapp -o wide

# DNS from inside the workload namespace
kubectl exec deploy/client -- cat /etc/resolv.conf
kubectl exec deploy/client -- getent hosts mysvc.default.svc.cluster.local

# Node dataplane - varies by CNI/proxy implementation
ip route
ip neigh
nft list ruleset | head -100

Gateway API is replacing many ad-hoc Ingress patterns with a more expressive role-oriented model. AI inference adds model-aware routing concerns such as cache locality, request criticality and token-aware metrics; the Gateway API Inference Extension exists because ordinary HTTP round-robin is often insufficient for long-running, stateful-ish LLM serving requests.
