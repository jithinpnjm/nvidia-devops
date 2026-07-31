# Chapter 4 — Networking: IP, routes, sockets, TCP, DNS, NAT and TLS
*(original text preserved in full; ➕ marks additions)*

**Learning outcome:** Trace a connection from name lookup through application response and identify what each diagnostic proves.

## 4.1 Addressing and routing
IP addressing identifies interfaces/endpoints; a subnet prefix describes which addresses are on-link; the routing table decides the next hop. Linux performs a longest-prefix match. Before debugging an application protocol, prove that the host selected the expected source interface and route.
```bash
ip addr
ip route
ip route get 10.20.30.40
ip neigh
```

➕ **Longest-prefix match, worked with real numbers (this is the mechanism, not just the term):**
```
Routing table:
  10.20.0.0/16  via eth0   (matches 10.20.30.40 — 16 bits match)
  10.20.30.0/24 via eth1   (matches 10.20.30.40 — 24 bits match, MORE specific)
  0.0.0.0/0     via eth0   (default — matches everything, LEAST specific)

Destination 10.20.30.40 → kernel picks the /24 route (eth1), not the /16 or default,
because 24 matching bits beats 16, which beats 0.
```
`ip route get 10.20.30.40` doesn't just show a route — it shows which one actually wins, including the source IP the kernel would use — this is the single fastest way to prove "the packet would even leave via the interface you think it would" before touching `tcpdump`.

➕ **CIDR-collision — the real customer-facing failure this feeds into:** if your K8s pod CIDR (`10.244.0.0/16`) overlaps a customer's existing on-prem range, longest-prefix-match means some destinations silently route wrong the moment the cluster peers with their network — this is exactly why discovering existing CIDR usage is a day-1 question in any SA network design conversation, not an afterthought.

## 4.2 Sockets and TCP state
A socket binds application I/O to a transport endpoint. For TCP, connection state reveals which phase failed. SYN-SENT often means the client sent a SYN but did not complete the handshake. ESTABLISHED means transport is up; an application can still be broken above it. TIME-WAIT is normal connection lifecycle behavior, though extreme churn can matter operationally.
```bash
ss -lntp
ss -tn state syn-sent
ss -tn state established
tcpdump -ni any host 10.20.30.40 and port 443
```

➕ **TCP handshake diagram, mapped to `ss` states you'll actually see:**
```
Client                          Server
  │──────── SYN ─────────────────▶│      state: SYN-SENT (client) / SYN-RECV (server)
  │◀─────── SYN-ACK ──────────────│
  │──────── ACK ──────────────────▶│      state: ESTABLISHED (both)
  │◀═══════ data flows ═══════════▶│
  │──────── FIN ──────────────────▶│      state: FIN-WAIT-1 → ... → TIME-WAIT (initiator)
```
Stuck in `SYN-SENT` forever = SYN left the box but nothing came back — either firewall dropping it silently, or nothing listening at the destination (a silent drop and "nothing listening" look identical from `ss` alone; `tcpdump` on both ends is what disambiguates them).

➕ **TIME_WAIT pileup — the socket-exhaustion failure mode worth naming unprompted:**
```bash
ss -tan | grep TIME-WAIT | wc -l    # climbing fast under load = ephemeral port exhaustion risk
```
A service opening a fresh outbound connection per request instead of pooling/keep-alive burns through the ephemeral port range under load. **Fix is connection reuse, not raising `net.ipv4.ip_local_port_range`** — the same "mitigation vs root cause" distinction from Chapter 1's fd-leak scenario, same pattern, different resource.

## 4.3 DNS is a dependency, not magic
Name resolution may involve /etc/hosts, NSS configuration, a local stub/cache and upstream resolvers. Distinguish "name does not resolve" from "name resolves to an unexpected address" and from "connection to the resolved address fails."
```bash
getent hosts api.example.com
resolvectl query api.example.com # systemd-resolved environments
dig +short api.example.com
cat /etc/resolv.conf
```

➕ **The K8s-specific DNS trap — `ndots:5` amplification:**
```bash
kubectl exec -it pod -- cat /etc/resolv.conf
# search default.svc.cluster.local svc.cluster.local cluster.local example.com
# options ndots:5
```
`ndots:5` means any name with fewer than 5 dots gets tried against *every* search-domain suffix first, before the literal name. A pod doing `curl api.external-vendor.com` (2 dots) will generate up to **4 extra DNS queries** (trying `.svc.cluster.local`, `.cluster.local`, etc. first, all of which fail) before the real external lookup succeeds — multiplying CoreDNS load and adding real latency, invisible unless you're looking at DNS query volume specifically. This is a very common, very fixable ("append a trailing dot to fully-qualify external names, or reduce ndots") production cost/latency finding.

## 4.4 NAT, firewall, TLS and HTTP
*(original diagram: media/image3.png — "prove each layer, a passing lower layer does not prove the higher layer" — preserved as Figure 3)*

A TCP connect timeout, connection refused, TLS certificate failure and HTTP 503 are four different diagnoses. curl -v is valuable because it exposes DNS, connect, TLS and HTTP phases in one trace. tcpdump proves whether packets actually leave/return. Firewall/NAT rules explain packet transformation or filtering, while the application log explains a valid HTTP response such as 500/503.
```bash
curl -vk --connect-timeout 2 https://api.example.com/health
nft list ruleset
# older systems may use iptables-save
tcpdump -ni any 'host 203.0.113.10 and port 443'
```

➕ **Annotated `curl -v` output — this is the single highest-value diagnostic trace to have memorized, phase by phase:**
```
* Trying 203.0.113.10:443...                    ← DNS resolved, attempting TCP connect
* Connected to api.example.com (203.0.113.10) port 443   ← TCP handshake succeeded (Ch4.2 done)
* TLS handshake, Client hello (1):                ← now entering TLS phase
* TLS handshake, Server hello (2):
* TLS handshake, Certificate (11):
* SSL certificate verify ok.                      ← TLS trust chain validated
* using HTTP/2
> GET /health HTTP/2                              ← request sent
< HTTP/2 503                                       ← ← THIS is the actual failure — everything below TCP/TLS worked
< retry-after: 30
```
**Interview-ready framing:** every line above is a proof point for one layer. A `curl -v` that dies after "Trying..." = routing/firewall (Ch4.1). Dies after "Connected" but before TLS completes = TLS/cert issue, not network. Completes TLS but returns 503 = the network stack is entirely exonerated — it's an application-layer problem now, stop looking at `tcpdump`.

➕ **NAT — a Kubernetes Service, precisely, not hand-waved:**
```bash
iptables -t nat -L KUBE-SERVICES -n | head     # the actual NAT rules kube-proxy wrote
```
A `ClusterIP` is not a listening process — it's a set of DNAT rules (or ipvs virtual server entries) redirecting to real pod IPs, written by kube-proxy. **There's nothing to `netstat`/`ss` for on the node for the ClusterIP itself — only the rule.** This is the sentence that separates "I know kubectl commands" from "I understand the mechanism," and it directly extends this chapter's NAT section into the Kubernetes networking chapter (Vol 3).

## Worked scenario
**Situation:** A Pod can resolve api.example.com, but HTTPS calls time out.

1. Record the resolved IP and ensure it is the expected endpoint.
2. From the same network namespace, inspect route to the IP and source interface.
3. Attempt TCP/443 and capture packets. SYN with no SYN-ACK points below TLS/HTTP.
4. Inspect Kubernetes NetworkPolicy/CNI policy, node firewall/NAT and cloud firewall/load-balancer path as applicable.
5. If TCP connects, move upward to TLS certificate/SNI and HTTP response evidence.

**Conclusion:** "DNS works" only removes one branch of the hypothesis tree.

➕ **Full hop-by-hop trace of `curl service-name:80` inside a pod — the synthesis exercise tying this whole chapter together:**
```
1. DNS:     CoreDNS resolves service-name.namespace.svc.cluster.local → ClusterIP  [4.3]
2. Routing: pod's route table sends ClusterIP traffic out its veth to the node    [4.1]
3. NAT:     node's iptables/ipvs DNAT-rewrites ClusterIP → a real pod IP           [4.4]
4. ARP/L2:  if destination pod is same-subnet, ARP resolves the next hop           [Ch1 tie-in]
5. TCP:     3-way handshake to the real pod IP/port                                [4.2]
6. TLS:     if HTTPS, certificate/SNI validation                                   [4.4]
7. HTTP:    application-layer response, only now is a 503 "the app's fault"        [4.4]
```
This exact 7-step trace, said out loud without hesitation, is close to a complete answer to "explain how a Service routes traffic" for a Senior SA interview.

## Practitioner lens
**Vishakha Sadhwani: Kubernetes networking is Linux networking plus abstractions**
A recent public post traces north-south and east-west traffic through load balancers, Gateway/Ingress, Services, kernel rules/eBPF, CNI and pod IPs. This chapter deliberately teaches the underlying socket/route/filter path first so those Kubernetes components become inspectable control points.
[Public source](https://www.linkedin.com/in/vsadhwani)

## Practice
1. Trace an HTTPS connection in a lab with getent, ip route get, curl -v and tcpdump. Write what each command proves.
2. Explain timeout versus connection-refused versus TLS failure.
3. Draw the return path as well as the forward path; identify where asymmetric routing could appear.

➕ 4. Deliberately set `ndots` mismatched behavior by curling an external domain from inside a pod while running `tcpdump -ni any port 53` in another terminal — count how many DNS queries actually fire for one `curl`.
➕ 5. Write the 7-step hop trace above from memory, then verify each step against a real `curl -v` + `tcpdump` capture on a lab cluster — this is the single best rehearsal for the "explain how a Service works" interview question.
