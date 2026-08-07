---
title: Chapter 03 — Verbs, Queue Pairs, and Completion Queues
description: Understand the InfiniBand execution model built from registered memory, protection domains, queue pairs, work requests, transport states, and completion processing.
sidebar_position: 4
tags:
  - infiniband
  - verbs
  - queue-pairs
  - rdma
---

# Verbs, Queue Pairs, and Completion Queues

## Introduction

Traditional socket programming hides much of the network device behind the operating system. An application writes bytes to a socket, the kernel processes them, and the network stack decides how the adapter should transmit them.

RDMA applications use a different model. They create explicit device resources, register memory, post operations to queues, and consume completion records. The application gains a shorter and more predictable data path, but it also becomes responsible for resource lifecycles, ordering, queue depth, memory protection, and error handling.

This chapter explains that execution model from first principles.

| Chapter field | Value |
|---|---|
| Volume | 08 — InfiniBand |
| Difficulty | Advanced |
| Estimated reading time | 60–80 minutes |
| Primary focus | RDMA resource and queue execution model |
| Previous | InfiniBand Architecture and Link Layers |
| Next | LIDs, GIDs, P_Keys, and Addressing |

## Story: The Network Was Healthy, but Every Queue Pair Failed

A distributed training environment passes physical fabric checks. All ports are active at expected speed and width. Host-memory bandwidth tests work between selected nodes.

A new service still fails during startup. The application logs show generic timeouts. The network team sees no significant errors on the switches.

The problem is eventually found inside the endpoint execution model. The application created queue pairs but did not transition them through the required states with consistent peer addressing. Several receive queues were never populated. Under load, completion entries reported receiver-not-ready and protection failures, but the application discarded the detailed status and printed only “network timeout.”

The incident illustrates a critical principle:

> A healthy fabric cannot compensate for an invalid queue, memory, or transport lifecycle.

## Learning Objectives

After completing this chapter, you will be able to:

- explain the purpose of the verbs interface;
- identify device contexts, protection domains, memory regions, queue pairs, and completion queues;
- describe send and receive queues;
- explain work requests, work queue elements, and scatter-gather entries;
- distinguish send/receive, RDMA write, RDMA read, and atomic operations;
- describe common queue-pair states;
- compare polling and event-driven completion;
- interpret common completion failures;
- design queue and memory lifecycles for production services;
- troubleshoot endpoint errors before blaming the fabric.

## Big Picture

```mermaid
flowchart TD
    App[Application] --> PD[Protection Domain]
    PD --> MR["Registered Memory Region<br/>(local key + optional remote key)"]
    PD --> QP[Queue Pair]
    SQ[Send Queue] --> QP
    RQ[Receive Queue] --> QP
    QP -->|"post_send / post_recv"| HCA[Host Channel Adapter]
    HCA -->|"transport ack proves<br/>remote received/placed data"| Fabric[InfiniBand Fabric]
    Fabric --> Remote[Remote Queue Pair and Memory]
    HCA -->|"completion entry: status +<br/>opcode + byte count"| CQ[Completion Queue]
    CQ --> App

    Fail["App reports timeout / hang"] --> Q1{"Did a CQE ever arrive<br/>for this work request?"}
    Q1 -->|"No CQE at all"| Q2{"Is the QP state RTS,<br/>or did it silently drop to ERR?"}
    Q2 -->|"ERR"| A1["Something upstream flushed this<br/>QP -- find the FIRST failing CQE,<br/>not this one"]
    Q2 -->|"RTS, still nothing"| A2["Receive queue likely starved:<br/>no receive WRs posted by peer"]
    Q1 -->|"CQE arrived, status != SUCCESS"| Q3{"Local or remote status?<br/>(e.g. LOC_PROT_ERR vs REM_ACCESS_ERR)"}
    Q3 -->|"Local"| A3["Local memory registration /<br/>key / address range is wrong"]
    Q3 -->|"Remote"| A4["Remote key, address, or<br/>protection domain mismatch"]
```

**Figure 8.3.1 — Verbs exposes explicit resources, and a completion queue entry is the actual evidence that separates a healthy operation from a silently stuck one.** The decision tree makes concrete the chapter's opening story: an application that discards CQE status and prints only "timeout" has thrown away exactly the field (`status`) that would have told it whether the fault was local memory, remote memory, or a starved receive queue — three completely different fixes.

## Why the Queue Model Exists

A high-performance adapter should not require a system call for every packet. Instead, the application prepares descriptors in memory that the HCA can consume.

The general pattern is:

1. allocate and register buffers;
2. create queue and protection resources;
3. connect or address a peer;
4. post work requests;
5. let the HCA execute them asynchronously;
6. consume completion entries;
7. reuse or release resources only after ownership is clear.

This separates the control path from payload movement.

## The Verbs Interface

“Verbs” refers to the programming interface used to create RDMA resources and submit operations.

The interface exposes actions such as:

- open a device context;
- query adapter and port capabilities;
- allocate a protection domain;
- register memory;
- create a completion queue;
- create and modify a queue pair;
- post send or receive work;
- poll or wait for completions;
- destroy resources.

Different software layers may wrap these operations. Communication libraries, MPI implementations, NCCL transports, storage software, and application frameworks often use verbs indirectly.

## Core Resource Objects

### Device context

A device context represents access to an RDMA-capable adapter. It is the starting point for querying capabilities and creating resources.

Important capability questions include:

- maximum queue depth;
- maximum scatter-gather entries;
- supported transport types;
- atomic capability;
- maximum registered-memory resources;
- port state and link-layer mode;
- completion and event capabilities.

Production software should query capabilities rather than assuming one adapter profile.

### Annotated `ibv_devinfo -v`: the capability answers that matter before you write a line of verbs code

```text
$ ibv_devinfo -v -d mlx5_0
hca_id: mlx5_0
    transport:                  InfiniBand (0)
    fw_ver:                     28.39.2048
    node_guid:                  08c0:eb03:00f1:a2c3
    sys_image_guid:             08c0:eb03:00f1:a2c3
    vendor_id:                  0x02c9
    vendor_part_id:             4129
    max_mr_size:                0xffffffffffffffff
    max_qp:                     262144
    max_qp_wr:                  32768
    max_sge:                    30
    max_cq:                     16777216
    max_cqe:                    4194303
    max_mr:                     16777216
    atomic_cap:                 ATOMIC_HCA (1)
        port:   1
            state:              PORT_ACTIVE (4)
            max_mtu:            4096 (5)
            active_mtu:         4096 (5)
            phys_state:         LINK_UP (5)
            link_layer:         InfiniBand
```

Every one of the seven capability questions listed above maps to a field here: `max_qp_wr` (32768) and `max_cq`/`max_cqe` answer the maximum-queue-depth question directly — a design that assumes 100,000 outstanding work requests per QP will fail resource allocation on this adapter, not fail gracefully. `atomic_cap: ATOMIC_HCA` answers whether atomics are supported at all before an application tries to post one. `max_sge: 30` bounds how many scatter-gather entries one work request can reference (Figure 8.3.3) — exceeding it is a local error, not a fabric problem. `active_mtu: 4096` matters for Scenario 1 below: two endpoints with mismatched active MTU can fail path negotiation even though both individually report `PORT_ACTIVE`.

### Protection domain

A Protection Domain (PD) groups resources that are permitted to interact.

A memory region registered under one protection domain should not automatically be usable by a queue pair in another. This boundary helps prevent accidental or unauthorized DMA.

```mermaid
flowchart TB
    PD1[Protection Domain A]
    QP1[Queue Pair A]
    MR1[Memory Region A]
    PD2[Protection Domain B]
    QP2[Queue Pair B]
    MR2[Memory Region B]

    PD1 --> QP1
    PD1 --> MR1
    PD2 --> QP2
    PD2 --> MR2
```

**Figure 8.3.2 — Protection domains bind compatible resources.** They are part of the memory-protection model, not merely object organization.

### Memory region

An application buffer must be registered before the HCA can access it through ordinary verbs operations.

Registration establishes:

- stable backing pages or device-memory mapping;
- DMA mappings;
- access permissions;
- a local key;
- optionally, remote-access permissions and a remote key.

The memory region includes an address range and length. Access outside that range or with an invalid key should fail.

### Completion queue

A Completion Queue (CQ) receives completion queue entries generated by completed or failed operations.

A completion entry can contain information such as:

- operation identifier;
- status;
- operation type;
- transferred length;
- immediate data;
- source information for datagram operations;
- error syndrome or vendor-specific detail.

A completion is evidence. Discarding its status removes the best endpoint-level clue during a failure.

### Queue pair

A Queue Pair (QP) consists conceptually of:

- a Send Queue (SQ);
- a Receive Queue (RQ).

The send queue accepts outbound work requests, including operations that may not be conventional “send” messages. The receive queue holds posted receive buffers for operations that require remote send/receive semantics.

## Work Requests and Work Queue Elements

An application posts a Work Request (WR). The provider translates or links it into a Work Queue Element (WQE) that the HCA processes.

A work request commonly describes:

- operation type;
- local buffer list;
- remote address and key where applicable;
- destination or connected peer;
- completion signaling behavior;
- inline data options;
- ordering or fencing flags;
- application-defined work identifier.

### Scatter-gather entries

A Scatter-Gather Entry (SGE) describes a local buffer segment.

Multiple SGEs allow one operation to reference data stored in several memory regions or discontiguous buffers.

```mermaid
flowchart LR
    WR[Work Request]
    SGE1[SGE 1: Header]
    SGE2[SGE 2: Tensor Chunk]
    SGE3[SGE 3: Metadata]
    WQE[HCA Work Queue Element]

    WR --> SGE1
    WR --> SGE2
    WR --> SGE3
    WR --> WQE
```

**Figure 8.3.3 — One work request may reference several local segments.** Capability limits determine how many segments are supported efficiently.

## Operation Types

### Send and receive

A send operation delivers a message to a peer’s receive queue. The receiver must generally have a suitable receive work request posted before the message arrives.

This model is useful when the receiver owns buffer placement and message boundaries matter.

Operational risk includes receive-queue starvation. If receive buffers are not replenished, the sender may encounter receiver-not-ready behavior, retries, or failure depending on the transport.

### RDMA write

RDMA write places local data into an authorized remote memory region.

The initiator supplies:

- remote virtual address;
- remote key;
- local source buffers;
- operation length.

The remote CPU does not need to post a matching receive for the payload placement itself. The application still needs a protocol for ownership, readiness, and notification.

### RDMA read

RDMA read retrieves data from an authorized remote memory region into local registered memory.

Read can be useful when the consumer decides when to pull data. It also creates different load and scaling behavior at the remote adapter and fabric.

### Atomic operations

Supported atomic operations can update or compare remote memory values under defined semantics.

They are useful for narrow synchronization problems, but they do not replace complete distributed coordination. Capability, alignment, transport, and memory constraints must be validated.

## Transport Types

Queue pairs can use different transport services.

A simplified comparison is:

| Transport style | Connection model | Reliability | Typical use |
|---|---|---|---|
| Reliable Connected | One logical peer per QP | Reliable, ordered | RDMA read/write and reliable messaging |
| Unreliable Connected | Connected peer | Unreliable | Specialized low-overhead cases |
| Unreliable Datagram | Addressed per message | Unreliable | Datagram and discovery patterns |
| Other specialized transports | Varies | Varies | Platform- or workload-specific behavior |

The exact operation support differs by transport. Software must not assume that every queue pair supports every verb.

## Queue-Pair State Machine

A queue pair is not ready immediately after creation. It progresses through states as local and remote transport attributes are configured.

```mermaid
stateDiagram-v2
    [*] --> RESET
    RESET --> INIT: Configure local port and access
    INIT --> RTR: Configure remote path and receive readiness
    RTR --> RTS: Configure send sequencing and retries
    RTS --> SQD: Drain for controlled transition
    RTS --> ERR: Transport or local failure
    SQD --> RTS: Resume
    ERR --> RESET: Recreate or reset lifecycle
```

**Figure 8.3.4 — Queue pairs require valid state transitions.** The exact required attributes depend on transport and provider.

Common conceptual states include:

- **RESET:** newly created or reset;
- **INIT:** local attributes established;
- **RTR (Ready to Receive):** remote path information and receive-side state established;
- **RTS (Ready to Send):** outbound sequencing and retry parameters established;
- **SQD (Send Queue Drained):** controlled pause after outstanding sends drain;
- **ERR:** queue entered an error condition.

A queue pair in the wrong state may exist successfully but reject work or fail every operation.

## Completion Semantics

A completion must be interpreted in context.

Questions to ask include:

- Was the completion successful?
- Was it local or remote in significance?
- Does it mean the local buffer can be reused?
- Has the remote application observed the data?
- Was the operation signaled?
- Were earlier operations ordered before it?
- Did a queue error flush later work?

### Signaled and unsignaled work

Generating a completion for every work request can create overhead. Some applications signal only selected operations and use ordering guarantees to infer progress for earlier work.

This optimization requires careful queue-depth management. If too few operations are signaled, the application may not reclaim resources or detect errors promptly.

## Polling Versus Events

### Busy polling

The application repeatedly checks the completion queue.

Advantages:

- low wake-up latency;
- predictable progress under load;
- simple high-performance loops.

Costs:

- consumes CPU continuously;
- can interfere with preprocessing or control work;
- requires NUMA-aware CPU placement.

### Event-driven completion

The application arms notification and sleeps until an event indicates completions may be available.

Advantages:

- lower idle CPU consumption;
- appropriate for intermittent traffic.

Costs:

- wake-up and interrupt latency;
- more complex re-arming logic;
- risk of missed-progress bugs when the sequence is incorrect.

Hybrid designs often poll briefly and then sleep.

## Queue Depth and Backpressure

Queue depth is a capacity decision.

Too shallow:

- insufficient work is in flight;
- throughput is limited by round trips;
- receive queues exhaust quickly.

Too deep:

- memory usage grows;
- failures flush many operations;
- latency and recovery time increase;
- resource accounting becomes difficult.

Queue depth should be derived from message rate, latency, batching, completion strategy, and adapter limits.

## Resource Lifecycle

A safe lifecycle is:

```mermaid
flowchart TD
    Discover[Open and Query Device]
    Allocate[Allocate PD and CQ]
    Register[Register Memory]
    Create[Create Queue Pair]
    Connect[Transition and Connect]
    Post[Post Receives and Sends]
    Complete[Drain Completions]
    Quiesce[Stop New Work]
    Drain[Drain or Fail Outstanding Work]
    Destroy[Destroy QP, MR, CQ, PD]

    Discover --> Allocate --> Register --> Create --> Connect --> Post --> Complete --> Quiesce --> Drain --> Destroy
```

**Figure 8.3.5 — Teardown is part of correctness.** Memory must not be deregistered while in-flight work can still reference it.

## Production Architecture Considerations

### Performance

Key variables include:

- registration strategy;
- queue depth;
- batching;
- inline-data threshold;
- scatter-gather count;
- completion signaling rate;
- polling CPU locality;
- HCA and NUMA placement.

### Scalability

At large scale, resources multiply by process, peer, rail, and queue.

Capacity planning should include:

- queue-pair count;
- completion-queue entries;
- memory-region count;
- pinned or registered memory;
- adapter contexts;
- receive buffers;
- CPU threads for progress.

### Availability

A peer can disappear with operations in flight. Production software needs:

- timeouts;
- retry policy;
- queue error handling;
- connection teardown;
- memory cleanup;
- partial-job failure strategy;
- observability for flushed work.

### Security

The resource model protects memory through:

- protection domains;
- local and remote keys;
- address ranges;
- access flags;
- process and container device permissions;
- scheduler and tenant boundaries.

A leaked remote key or incorrectly shared memory region can create serious risk.

## Production Troubleshooting

### Scenario 1 — Queue pair never reaches ready-to-send

**Symptoms**

- resource creation succeeds;
- first work request fails or is rejected;
- peer connection establishment times out.

**Diagnosis**

Compare both endpoints:

- QP number;
- transport type;
- port and path attributes;
- LID or GID selection;
- packet sequence configuration;
- MTU;
- service level;
- retry and timeout values.

**Root cause**

One endpoint was configured with inconsistent peer or path attributes.

**Evidence.** A minimal `rdma_cm`-based or raw-verbs connection attempt that fails during the RTR transition typically surfaces as an explicit modify-QP error rather than a silent hang:

```text
$ ./rc_pingpong -d mlx5_0 -g 0 <server-ip>
  local address:  LID 0x000c, QPN 0x00012a, PSN 0x3a1f2e, GID ::
  remote address: LID 0x0051, QPN 0x0000e3, PSN 0x0091ab, GID ::
Couldn't modify QP to RTR
ibv_modify_qp: Invalid argument (path_mtu mismatch)
```

`Invalid argument (path_mtu mismatch)` names the exact attribute: one side is configured for a 4096-byte active MTU and the other for 2048, and the RTR transition (which requires agreeing on remote path attributes, per Figure 8.3.4) rejects the mismatch outright rather than silently degrading. This is a direct instance of the `ibv_devinfo -v` capability check above — `active_mtu` differing between two "healthy" ports is invisible until a QP actually tries to connect.

### Scenario 2 — Receiver-not-ready or missing receives

**Symptoms**

- send/receive traffic stalls under bursts;
- retry counters increase;
- completions report receiver-side readiness problems.

**Diagnosis**

Inspect receive-queue occupancy and replenishment logic. Confirm buffer ownership and application processing rate.

**Resolution**

Pre-post enough receives, replenish before the low-water mark, and monitor receive-queue pressure.

### Scenario 3 — Protection error

**Symptoms**

- local protection error;
- remote access error;
- invalid key or address completion;
- one buffer works while another fails.

**Diagnosis**

Check:

- memory-region address and length;
- local and remote keys;
- access flags;
- protection-domain membership;
- buffer lifetime;
- whether memory was deregistered or reused.

### Scenario 4 — Queue enters error and later work is flushed

**Symptoms**

- one operation reports the original error;
- many later completions report flushed work;
- application logs hundreds of secondary failures.

**Resolution**

Find the first failing completion. Treat flushed completions as consequences. Quiesce the queue, rebuild transport state, and verify peer health before resuming.

**Evidence.** A trimmed `ibv_poll_cq` loop's output, decoded, makes the "find the first one" instruction concrete:

```text
wr_id=1042  status=IBV_WC_SUCCESS          opcode=RDMA_WRITE
wr_id=1043  status=IBV_WC_RETRY_EXC_ERR    opcode=RDMA_WRITE   vendor_err=0x81
wr_id=1044  status=IBV_WC_WR_FLUSH_ERR     opcode=RDMA_WRITE
wr_id=1045  status=IBV_WC_WR_FLUSH_ERR     opcode=SEND
wr_id=1046  status=IBV_WC_WR_FLUSH_ERR     opcode=SEND
```

`wr_id=1043` is the first real failure: `IBV_WC_RETRY_EXC_ERR` means the HCA exhausted its retry count without receiving an ACK — typically because the remote peer stopped responding (crashed process, network partition, or a receive queue that ran dry). Everything after it (`1044`-`1046`) is `IBV_WC_WR_FLUSH_ERR` — the QP entered the error state and the provider is draining every subsequent posted work request with a flush status, not reporting new independent failures. A support ticket that lists "hundreds of RDMA errors" and treats each equally will miss that 1043 is the only one worth investigating; 1044-1046 are noise generated by 1043.

### Scenario 5 — High CPU despite RDMA

**Diagnosis**

Separate:

- busy polling;
- application serialization;
- memory registration;
- progress threads;
- interrupt processing;
- payload copying.

High CPU can be an intentional latency trade-off rather than proof of failed RDMA.

## Customer Scenario

A customer wants one queue pair per GPU-to-GPU peer across a very large cluster.

The architect asks:

- how many processes and peers exist;
- whether the communication library shares transports;
- how many rails are used;
- what the HCA resource limits are;
- how failures are recovered;
- how much registered memory is required;
- whether the connection model will scale operationally.

The design may use shared endpoints, connection management, hierarchical communication, or library-managed transports rather than multiplying one dedicated queue pair for every theoretical peer.

## Interview Preparation

### Knowledge Questions

1. What is a protection domain?
   **Model answer:** "It's the grouping boundary that says which queue pairs are allowed to use which memory regions. A QP in protection domain A can't touch a memory region registered under protection domain B, even on the same host. It's the mechanism that stops one tenant's or one connection's misbehaving pointer arithmetic from reaching another tenant's buffers."

2. Why must memory be registered?
   **Model answer:** "The HCA does DMA directly against physical or IOMMU-mapped addresses — it can't page-fault the way a CPU access can. Registration pins the pages, sets up the DMA mapping, and issues a key that proves the HCA is authorized to touch that exact address range. Without it, the HCA has no safe way to know a buffer won't move or disappear mid-transfer."

3. What is the difference between a queue pair and a completion queue?
   **Model answer:** "A queue pair is where work goes in — send and receive queues holding work requests waiting to execute. A completion queue is where results come out — it's a separate object, and multiple queue pairs can actually share one CQ, which matters for scaling: you don't need a dedicated polling thread per QP."

4. Why are receive buffers pre-posted?
   **Model answer:** "Because for send/receive semantics, the HCA needs somewhere to place incoming data the instant it arrives — it can't ask the application for a buffer mid-packet the way a socket read blocks and waits. If the receive queue is empty when a send arrives, you get a receiver-not-ready condition, which is exactly the failure mode in this chapter's opening story: unreplenished receive queues masquerading as a generic network timeout."

5. What does an RDMA-write completion prove?
   **Model answer:** "On the initiator's side, a local completion proves the local work request was processed and, depending on signaling, that the operation was placed on the wire — it does not by itself prove the remote application has consumed or even noticed the data, because RDMA write doesn't require the remote CPU to post a matching receive. If the application needs the remote side to know data arrived, it needs its own notification protocol — a follow-up send, an immediate-data value, or a polled flag — RDMA write's completion alone doesn't give you that."

### Architecture Questions

1. Draw the objects required for one reliable-connected RDMA path.
   **Model answer:** "Protection domain at the top, with a registered memory region and a queue pair both hanging off it — that pairing is what makes the memory usable by that QP. The QP has its send and receive queues, connects through the HCA, and every operation eventually reports into a completion queue. I'd draw the CQ as a sibling of the QP, not a child of it, to make the point that one CQ can serve several QPs."

2. Explain how a work request becomes a completion entry.
   **Model answer:** "Application calls `post_send` or `post_recv`, which hands a descriptor to the HCA — that's a work queue element now, not just an application-side request. The HCA executes it asynchronously: DMA's the data, transmits, waits for a transport ack if it's a reliable connection. Once that's done — success or failure — the HCA writes a completion queue entry with status, opcode, and byte count, and the application picks it up by polling or via an armed notification."

3. Design a reusable registered-buffer pool.
   **Model answer:** "Pre-register a fixed set of fixed-size buffers at startup rather than registering per-message — registration has real setup cost. Track ownership with a simple free-list, and the critical invariant is: a buffer only goes back on the free list after its completion has actually been consumed, not when the application logically 'thinks' it's done with it. I'd size the pool from expected queue depth times message size times a safety margin, and monitor pool exhaustion as a first-class metric, because a starved pool looks identical to a network stall from the outside."

### Scenario Questions

1. A QP reaches INIT but not RTR. What information is probably missing?
   **Model answer:** "RTR requires remote path information — the peer's LID or GID, QP number, and packet-sequence starting point, plus path attributes like MTU. If it's stuck at INIT, I'd check whether the application actually completed the out-of-band exchange of that connection information with the peer before attempting the transition — that exchange is the application's job, verbs doesn't do peer discovery for you."

2. Completions show protection errors. What do you inspect?
   **Model answer:** "Whether the error is local or remote first, since that changes which side I'm debugging. Then memory-region address range and length against what the work request actually referenced, the local or remote key, protection-domain membership, and whether the buffer's lifetime might have ended — deregistered or reused — before the operation completed."

3. One error causes hundreds of flushed completions. Which completion matters most?
   **Model answer:** "The first one — everything after it is `IBV_WC_WR_FLUSH_ERR`, which just means the QP entered an error state and the provider is draining the rest of the queue with a flush status. I've seen incident reports built around counting flush errors when the actual root cause was one `RETRY_EXC_ERR` at the front of the list."

### Customer Questions

1. Does RDMA eliminate the operating system?
   **Model answer:** "No — it removes the OS and CPU from the per-message payload path, not from the system. The CPU still creates resources, registers memory, sets up queues, handles errors, and does security and orchestration work. What changes is that the expensive, per-packet kernel involvement that a socket-based path pays for every message is gone."

2. Should every operation generate a completion?
   **Model answer:** "Not necessarily — generating a completion for every single work request adds overhead, and high-performance applications often signal only a subset and rely on ordering guarantees to infer that earlier unsignaled work also succeeded. The trade-off is that you need careful queue-depth management, because you lose per-operation visibility for the unsignaled ones."

3. How do queue-pair counts affect architecture at scale?
   **Model answer:** "Naively, one QP per peer pair multiplies badly — thousands of nodes means potentially millions of QPs, and each one consumes HCA resources: context, memory, queue state. In practice, communication libraries share transports, use connection management, or build hierarchical communication patterns instead of a fully connected mesh of dedicated QPs. I'd ask early in a design conversation what the actual peer-connectivity pattern is before assuming 'one QP per pair' is even the right model."

### Whiteboard Question

Draw a queue pair with send and receive queues, registered memory, an HCA, a remote queue pair, and a completion queue. Mark ownership changes for a send and an RDMA write.

**What I'd actually say while drawing:** "Local QP with its send and receive queues, memory region hanging off the same protection domain, HCA in between, then the same picture mirrored on the remote side. For a send: I post to my send queue, the remote side must have already posted to its receive queue — ownership of that remote buffer transfers to the HCA the moment it's posted, and back to the application only after the receive completion fires. For an RDMA write: there's no matching post on the remote receive queue at all — I'm writing directly into a remote memory region the peer authorized ahead of time via its remote key, and the remote CPU may not even know the write happened until some separate notification tells it to look."

## Summary

The verbs model exposes explicit resources so the HCA can execute communication asynchronously with less kernel involvement in the payload path. This efficiency depends on correct memory registration, protection domains, queue state, work submission, completion handling, and teardown.

Endpoint evidence is often more useful than switch counters when the failure is inside the queue lifecycle. Always inspect the first meaningful completion status before concluding that the fabric is at fault.

## Key Takeaways

- Verbs exposes explicit adapter resources.
- Queue pairs contain send and receive work queues.
- Completion queues report success and failure.
- Memory keys and protection domains enforce DMA boundaries.
- QPs must transition through valid states.
- Receive queues and completion queues are finite resources.
- Teardown must wait for in-flight work or force it into a known error path.

## Quick Revision Sheet

| Object | Purpose |
|---|---|
| Device context | Access and query an RDMA adapter |
| Protection domain | Groups compatible protected resources |
| Memory region | Authorizes HCA access to a buffer range |
| Queue pair | Holds send and receive work queues |
| Work request | Describes one requested operation |
| SGE | Describes one local buffer segment |
| Completion queue | Reports completed or failed work |
| Local key | Authorizes local HCA access |
| Remote key | Authorizes permitted remote access |

## Lab Checklist

Before moving on, confirm that you can:

- identify all verbs objects in a test application;
- explain QP state transitions;
- interpret completion status;
- recognize receive-queue starvation;
- calculate approximate queue resource requirements;
- describe safe memory deregistration and teardown.

## Cross References

- Previous: [InfiniBand Architecture and Link Layers](./chapter-02-infiniband-architecture-and-link-layers)
- Next: [LIDs, GIDs, P_Keys, and Addressing](./chapter-04-lids-gids-pkeys-and-addressing)
- Related chapter: [DMA, RDMA, and Peer-to-Peer](pathname://../volume-07/chapter-04-dma-rdma-and-peer-to-peer)
- Related lab: [Benchmark InfiniBand Bandwidth and Latency](./labs/lab-02-benchmark-infiniband-bandwidth-and-latency)

## Further Reading

Use the current rdma-core and NVIDIA networking documentation for the exact verbs API, provider capabilities, queue-pair attributes, completion status values, and adapter limits used in your environment.