---
title: "Chapter 4 - Kubernetes networking from Service to CNI"
slug: "chapter-4-kubernetes-networking-from-service-to-cni"
sidebar_position: 4
description: "Chapter 4 - Kubernetes networking from Service to CNI — Kubernetes and Platform Engineering."
source_document: "Volume_03_Kubernetes_and_Platform_Engineering(3).docx"
---
<!-- source-table:1 -->

> Learning outcome Trace DNS, Service selection, data plane implementation, CNI routing and NetworkPolicy.


![](pathname:///img/generated/volume-03-02.png)

Figure 2. North-south traffic crosses distinct components; prove each stage rather than restarting random Pods.

## 4.1 Service and EndpointSlice

A Service selects backend endpoints, typically represented through EndpointSlices. If a Service has no endpoints, kube-proxy/eBPF rules cannot send traffic to healthy Pods. Check selectors and readiness before debugging lower networking layers.


<!-- source-table:2 -->

```text
kubectl get svc api -o yaml
kubectl get endpointslice -l kubernetes.io/service-name=api -o wide
kubectl get pods -l app=api -o wide --show-labels
```


## 4.2 Data plane implementation

Depending on the cluster, Service forwarding may be implemented with iptables, IPVS or eBPF. The conceptual contract is stable: virtual Service address maps to eligible endpoints. Your troubleshooting commands should match the implementation rather than memorizing iptables for every environment.

## 4.3 DNS, CNI and policy

CoreDNS resolves cluster/service names; the CNI provides Pod interfaces/IP allocation/routing; NetworkPolicy is enforced by capable CNIs. For east-west timeouts, verify name resolution, EndpointSlice, routing and policy independently.


<!-- source-table:3 -->

```text
kubectl exec -it <pod> -- getent hosts api.default.svc.cluster.local
kubectl exec -it <pod> -- curl -sv http://api:8080/health
kubectl get networkpolicy -A
kubectl -n kube-system get pods -l k8s-app=kube-dns
```


## Practitioner lens


<!-- source-table:4 -->

> Vishakha Sadhwani: understand the traffic path Her public networking breakdown follows client -> LB -> Gateway/Ingress -> Service -> node rules/eBPF -> CNI -> Pod and an east-west path with CoreDNS and NetworkPolicy. This chapter uses the same path, then teaches what each component contributes and how to prove it.


[Public source](https://www.linkedin.com/in/vsadhwani)

## Worked scenario


<!-- source-table:5 -->

> Situation Service DNS resolves, but requests from one namespace time out while another namespace works.


**1\. Compare EndpointSlices: the backend set is common, so namespace-specific failure points toward source policy/path.**

2\. Inspect NetworkPolicies affecting source and destination namespaces and confirm CNI enforcement semantics.

3\. From both namespaces, compare route/connect behavior to Service and direct Pod IP if policy permits testing.

4\. Inspect service mesh/sidecar policy if present because mTLS/authz can introduce namespace-specific behavior.

5\. Use packet/eBPF observability on nodes only after object-level policy and endpoint evidence is collected.


<!-- source-table:6 -->

> Conclusion The differential clue—one namespace works—narrows the search toward source identity/policy rather than backend availability.
