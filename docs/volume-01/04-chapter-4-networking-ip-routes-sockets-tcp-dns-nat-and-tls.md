---
title: "Chapter 4 - Networking: IP, routes, sockets, TCP, DNS, NAT and TLS"
slug: "chapter-4-networking-ip-routes-sockets-tcp-dns-nat-and-tls"
sidebar_position: 4
description: "Chapter 4 - Networking: IP, routes, sockets, TCP, DNS, NAT and TLS — Foundations Beneath Kubernetes."
source_document: "Volume_01_Foundations_Beneath_Kubernetes(3).docx"
---
<!-- source-table:1 -->

> Learning outcome Trace a connection from name lookup through application response and identify what each diagnostic proves.


## 4.1 Addressing and routing

IP addressing identifies interfaces/endpoints; a subnet prefix describes which addresses are on-link; the routing table decides the next hop. Linux performs a longest-prefix match. Before debugging an application protocol, prove that the host selected the expected source interface and route.


<!-- source-table:2 -->

```text
ip addr
ip route
ip route get 10.20.30.40
ip neigh
```


## 4.2 Sockets and TCP state

A socket binds application I/O to a transport endpoint. For TCP, connection state reveals which phase failed. SYN-SENT often means the client sent a SYN but did not complete the handshake. ESTABLISHED means transport is up; an application can still be broken above it. TIME-WAIT is normal connection lifecycle behavior, though extreme churn can matter operationally.


<!-- source-table:3 -->

```text
ss -lntp
ss -tn state syn-sent
ss -tn state established
tcpdump -ni any host 10.20.30.40 and port 443
```


## 4.3 DNS is a dependency, not magic

Name resolution may involve /etc/hosts, NSS configuration, a local stub/cache and upstream resolvers. Distinguish “name does not resolve” from “name resolves to an unexpected address” and from “connection to the resolved address fails.”


<!-- source-table:4 -->

```text
getent hosts api.example.com
resolvectl query api.example.com  # systemd-resolved environments
dig +short api.example.com
cat /etc/resolv.conf
```


## 4.4 NAT, firewall, TLS and HTTP

![](pathname:///img/generated/volume-01-03.png)

Figure 3. Prove each layer. A passing lower layer does not prove the higher layer.

A TCP connect timeout, connection refused, TLS certificate failure and HTTP 503 are four different diagnoses. curl -v is valuable because it exposes DNS, connect, TLS and HTTP phases in one trace. tcpdump proves whether packets actually leave/return. Firewall/NAT rules explain packet transformation or filtering, while the application log explains a valid HTTP response such as 500/503.


<!-- source-table:5 -->

```text
curl -vk --connect-timeout 2 https://api.example.com/health
nft list ruleset
# older systems may use iptables-save
tcpdump -ni any 'host 203.0.113.10 and port 443'
```


## Worked scenario


<!-- source-table:6 -->

> Situation A Pod can resolve api.example.com, but HTTPS calls time out.


**1\. Record the resolved IP and ensure it is the expected endpoint.**

2\. From the same network namespace, inspect route to the IP and source interface.

3\. Attempt TCP/443 and capture packets. SYN with no SYN-ACK points below TLS/HTTP.

4\. Inspect Kubernetes NetworkPolicy/CNI policy, node firewall/NAT and cloud firewall/load-balancer path as applicable.

5\. If TCP connects, move upward to TLS certificate/SNI and HTTP response evidence.


<!-- source-table:7 -->

> Conclusion “DNS works” only removes one branch of the hypothesis tree.


## Practitioner lens


<!-- source-table:8 -->

> Vishakha Sadhwani: Kubernetes networking is Linux networking plus abstractions A recent public post traces north-south and east-west traffic through load balancers, Gateway/Ingress, Services, kernel rules/eBPF, CNI and pod IPs. This chapter deliberately teaches the underlying socket/route/filter path first so those Kubernetes components become inspectable control points.


[Public source](https://www.linkedin.com/in/vsadhwani)

## Practice

1\. Trace an HTTPS connection in a lab with getent, ip route get, curl -v and tcpdump. Write what each command proves.

2\. Explain timeout versus connection-refused versus TLS failure.

3\. Draw the return path as well as the forward path; identify where asymmetric routing could appear.
