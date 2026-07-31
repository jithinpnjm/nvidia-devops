---
title: "Senior Deep Dive 4 — Packet-level networking: routing, conntrack, TCP and DNS failure modes"
slug: "senior-deep-dive-4-packet-level-networking-routing-conntrack-tcp-and-dns-failu"
sidebar_position: 10
description: "Senior Deep Dive 4 — Packet-level networking: routing, conntrack, TCP and DNS failure modes — Foundations Beneath Kubernetes."
source_document: "Volume_01_Foundations_Beneath_Kubernetes(3).docx"
---
![](pathname:///img/generated/volume-01-05.png)

_Figure B. A Kubernetes request still traverses ordinary Linux networking mechanisms._

Debugging should follow the packet. Name resolution produces an address; routing selects an egress interface and next hop; ARP or neighbor discovery resolves a local next hop; TCP establishes state; TLS authenticates and negotiates encryption; an HTTP request then reaches the application. NAT, conntrack, overlay encapsulation, service meshes and policy can add more state, but they do not replace those fundamentals.

**Host commands: trace the network path**

\# Name resolution and route decision
dig +trace example.internal
getent ahostsv4 example.internal
ip route get 10.20.30.40
ip neigh show

# Socket and TCP state
ss -lntp
ss -s
ss -tan state syn-sent

# Packet evidence
sudo tcpdump -ni any host 10.20.30.40 and port 443

# Conntrack / firewall state (tooling varies by distro)
sudo conntrack -S
sudo nft list ruleset

For RDMA or GPU fabrics, these fundamentals remain useful because management traffic, discovery, DNS, control planes and many data services still use normal IP/TCP. RoCE adds lossless/congestion requirements and bypasses the TCP transport path for RDMA verbs, but you still need to understand interfaces, routing, MTU, VLANs and NIC topology.
