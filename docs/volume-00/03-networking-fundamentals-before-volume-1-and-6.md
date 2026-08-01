---
title: "3 - Networking fundamentals: what you need before Volumes 1 and 6"
slug: "3-networking-fundamentals-before-volume-1-and-6"
sidebar_position: 3
description: "Networking fundamentals: what you need before Volumes 1 and 6 — Foundations Primer."
source_document: "Authored directly for the Foundations Primer — no DOCX source."
---

This chapter will not make you a networking expert. Its only job is to give you the vocabulary Volume 1's networking chapter and Volume 6's HPC/fabric material assume you already have, so those chapters read as depth on a known shape rather than a pile of new terms. As in the previous chapter, skim anything that's already obvious to you.

## What an IP address actually is

**The problem.** If many machines share the same physical network, something needs to identify *which* machine a piece of data is meant for — the network itself doesn't know "send this to the database server" unless there's a precise, unambiguous way to name that machine.

**The concept.** An **IP address** is a numeric address assigned to a machine (or more precisely, to a network interface on a machine) so that data can be directed to it specifically. It's directly analogous to a street address: just as a street address lets mail find one specific building among many on the same street, an IP address lets network data find one specific machine among many on the same network.

**The shape of it.** You'll most often see IP addresses written as four numbers separated by dots (like `192.168.1.10`) — this chapter doesn't need you to parse the internal structure of that, only to recognize it as "a specific machine's numeric address on a network."

**A first real example.** When your laptop connects to a website, your laptop has its own IP address, and the server hosting that website has a different one; every piece of data exchanged is labeled with both, so responses can find their way back to you specifically and not to every other machine on the network.

### Check your understanding

**Q1: Why can't a network just deliver data based on a machine's name (like "web-server-3") without any numeric address underneath?**
A: Because something still has to translate that name into a precise, structured address the network hardware and software can actually route data to — which is exactly the job DNS does, covered later in this chapter. The name and the address are separate concerns.

**Q2: If two machines are on the same network, what does an IP address let you do that would be impossible without it?**
A: Direct data to one specific machine rather than having every machine on the network try to process everything — the same way a street address lets mail reach one building instead of being dropped for the whole street to sort through.

## What a port is

**The problem.** A single machine with one IP address usually runs many independent network services at once — a web server, a database, an SSH login service. If data just arrived "at the machine" with no further detail, the machine would have no way to know which service it was meant for.

**The concept.** A **port** is a number that identifies a specific service running on a machine, so that many services can share the same IP address without their traffic colliding. This is directly analogous to apartment numbers at a single street address: the street address (IP address) gets mail to the right building, and the apartment number (port) gets it to the right unit inside that building.

**The shape of it.** Ports are numbers from 0 up to 65535. Certain numbers are conventional for certain services (for example, web servers conventionally listen on port 80 for plain HTTP or 443 for encrypted HTTPS), but the number itself is just an agreed-upon convention, not a technical requirement.

### Check your understanding

**Q1: If a database and a web server both run on the same machine, how does incoming data reach the right one?**
A: Each service listens on a different port; incoming data is labeled with the IP address (which machine) and the port (which service on that machine), so the machine's networking stack can route it to the correct service.

**Q2: Is port 443 magically tied to HTTPS by the network itself, or is that just a convention?**
A: It's a convention — nothing technically forces HTTPS to use port 443, but nearly everyone follows that convention so things interoperate predictably without every setup needing custom configuration.

## TCP vs. UDP, in plain language

**The problem.** Once data can be addressed to a specific machine and port, you still need to decide *how* it's delivered — and different situations want different trade-offs between reliability and speed.

**The concept.** **TCP** and **UDP** are two different ways of sending data over a network, with a fundamental trade-off between them. TCP is like a phone call: before either side says anything meaningful, a connection is established, and every piece of data sent is tracked, acknowledged, and re-sent if it goes missing, so both sides can be confident the full, ordered conversation arrived intact. UDP is like shouting into a crowd: you send your message immediately, with no setup and no confirmation that anyone heard it, or heard it in order — it's fast and low-overhead precisely because it skips all the guarantees TCP provides.

**Why this trade-off exists at all.** Guaranteeing delivery and order (TCP) costs time and overhead — tracking what's been received, waiting for confirmations, resending lost pieces. Some traffic (loading a webpage, transferring a file) needs that reliability badly enough to be worth the cost. Other traffic (live video/audio streaming, some real-time gaming or sensor data) would rather drop an occasional piece of data than wait for it to be resent, because by the time a resend arrives it's already useless — for that traffic, UDP's speed is worth the lack of guarantees.

### Check your understanding

**Q1: You're designing a system that streams live sensor readings where a single missed reading doesn't matter, but a late one does. TCP or UDP, and why?**
A: UDP — because a resend of a dropped reading arrives too late to be useful anyway, TCP's reliability overhead buys you nothing here, and you'd rather have low-latency, best-effort delivery.

**Q2: Why does TCP need a "connection" established first, but UDP doesn't?**
A: Because TCP has to set up shared bookkeeping (what's been sent, what's been acknowledged) before it can track and guarantee delivery — that's the "phone call" setup. UDP makes no such guarantees, so there's nothing to set up first; it just sends.

## What DNS actually does

**The problem.** Numeric IP addresses are precise but not remotely memorable or stable for humans to use directly — you don't want to memorize a string of numbers for every website, and a service's underlying address can change over time anyway.

**The concept.** **DNS** (Domain Name System) translates a human-readable name (like a website's domain name) into the numeric IP address that actually identifies the machine, similar to how a phone book translates a person's name into their phone number. It's worth noting explicitly that DNS is a *separate system* from the actual data delivery: DNS's only job is the name-to-address translation step; once your machine has the address, the actual network conversation (via TCP or UDP) happens independently of DNS.

**The shape of it.** Before your machine can talk to a website by name, it asks a DNS system to resolve that name into an IP address, then uses that address for the actual connection.

### Check your understanding

**Q1: If DNS is temporarily broken but the IP address of a server hasn't changed, could you still reach that server?**
A: Yes, if you already know or supply its IP address directly — DNS is only the name-to-address lookup step; the underlying network path to that address is unaffected by DNS being down.

**Q2: Why is it useful that DNS is a separate system from the actual data transfer, rather than baked into TCP/UDP themselves?**
A: Because it lets the address behind a name change over time (say, a service moves to new infrastructure) without anyone needing to change how the actual data-transfer protocols work — only the lookup table (DNS) needs updating.

## What a firewall conceptually does

**The problem.** Not all incoming or outgoing network traffic should be allowed — a machine or network needs a way to decide, deliberately, what's permitted and what's blocked, rather than accepting everything by default.

**The concept.** A **firewall** is a rule-based gate that inspects network traffic and decides what's allowed to pass and what's blocked, based on criteria like the addresses, ports, or protocols involved. Think of it as an access-control list for network traffic, the same conceptual tool as the file permissions from the previous chapter, just applied to network connections instead of files.

**The shape of it.** A firewall's rules typically say something like "allow traffic to port 443 from anywhere, but block everything else" — an explicit allow/deny decision made per rule, evaluated for every piece of traffic that tries to pass through.

**Why it matters for Volume 10.** Volume 10's security material builds directly on this idea — reasoning about attack surface, least-privilege network access, and segmentation all assume "a firewall is a rule-based allow/deny gate" is already solid ground.

### Check your understanding

**Q1: A firewall rule allows port 443 and blocks everything else. What happens to traffic aimed at port 80 on that machine?**
A: It's blocked — the rule set only explicitly allows port 443, and the described policy blocks everything else by default.

**Q2: How is a firewall conceptually similar to the file permission model from the Linux chapter?**
A: Both are rule-based access control: file permissions decide who (owner/group/other) can do what (read/write/execute) to a file; a firewall decides what traffic (by address/port/protocol) is allowed to pass. Same underlying idea — explicit rules deciding allowed access — applied to a different resource.

## A brief, honest preview: why HPC/AI networking is a different world

Everything above describes typical web-service networking — the kind of networking most backend and DevOps work deals with day to day. Volume 6 covers a genuinely different world: high-performance computing (HPC) and AI training networking, using technologies like **RDMA** and **InfiniBand**.

This chapter will not teach you RDMA or InfiniBand — that's Volume 6's job, done properly with the depth it deserves. The only thing worth planting here is the one core idea, so the term doesn't feel completely alien when Volume 6 introduces it: normal networking (what you just learned above) always goes through the operating system and the CPU on both ends — data gets copied into the kernel, then into the application, with CPU involvement at each step. **RDMA** (Remote Direct Memory Access) exists to skip that: it lets one machine (or GPU) write directly into another machine's (or GPU's) memory, bypassing the CPU and operating system on the data path entirely, which matters enormously when you're moving huge amounts of data between GPUs extremely fast and extremely often, as in large-scale AI training. InfiniBand is a specific high-speed networking technology commonly used to carry that kind of traffic.

That's genuinely all you need here: normal networking involves the CPU/OS at every step; RDMA is specifically about not doing that, for speed, in short, GPU-to-GPU-style transfers. Volume 6 will build the real mental model on top of that one sentence.

### Check your understanding

**Q1: What's the one core difference between typical web networking and RDMA, in plain terms?**
A: Typical networking routes data through the CPU and operating system on both ends; RDMA bypasses the CPU/OS and writes directly into the other side's memory, trading that overhead away for speed.

**Q2: Why would this matter specifically for AI training rather than, say, loading a webpage?**
A: AI training on multiple GPUs needs to move very large amounts of data between GPUs, very frequently, where the CPU/OS overhead of normal networking would become a serious bottleneck at that scale and frequency — a tradeoff that isn't relevant when loading one webpage occasionally.

## Glossary

- **IP address** — a numeric address identifying a specific machine (or network interface) on a network.
- **Port** — a number identifying a specific service on a machine, allowing many services to share one IP address.
- **TCP** — a connection-based network protocol that guarantees ordered, acknowledged delivery, at the cost of setup and overhead.
- **UDP** — a connectionless network protocol that sends data immediately with no delivery or order guarantees, favoring speed.
- **DNS** — the system that translates human-readable names into IP addresses, separate from the actual data-transfer protocols.
- **Firewall** — a rule-based gate that decides what network traffic is allowed to pass, based on criteria like address, port, or protocol.
- **RDMA (Remote Direct Memory Access)** — a technique that lets one machine/GPU write directly into another's memory, bypassing the CPU and OS on the data path, for speed.
- **InfiniBand** — a high-speed networking technology commonly used to carry RDMA-style traffic in HPC/AI environments.

## You're ready for Volume 1 (networking chapter) and Volume 6 when you can...

- Explain what an IP address identifies and why a port is needed in addition to it.
- Explain the TCP-vs-UDP trade-off in your own words, using the phone call / shouting-into-a-crowd analogy or an equivalent of your own.
- Explain why DNS is a separate system from the actual data transfer.
- Describe a firewall as a rule-based allow/deny gate, and connect it to the file-permission access-control idea from the Linux chapter.
- State the one-sentence core idea behind RDMA (bypassing CPU/OS for direct memory-to-memory transfer) without needing to explain its implementation.

**Continue to:** [Volume 1, Chapter 4 — Networking: IP, routes, sockets, TCP, DNS, NAT and TLS](/curriculum/volume-01/chapter-4-networking-ip-routes-sockets-tcp-dns-nat-and-tls) or [Volume 6, Chapter 1 — Distributed systems performance for GPU jobs](/curriculum/volume-06/chapter-1-distributed-systems-performance-for-gpu-jobs)
