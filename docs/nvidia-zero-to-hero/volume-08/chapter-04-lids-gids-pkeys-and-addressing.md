---
title: Chapter 04 — LIDs, GIDs, P_Keys, and Addressing
description: Understand InfiniBand identities, local forwarding, global identifiers, path records, partition membership, and the troubleshooting consequences of choosing the wrong address context.
sidebar_position: 5
tags:
  - infiniband
  - addressing
  - lids
  - gids
  - pkeys
---

# LIDs, GIDs, P_Keys, and Addressing

## Introduction

An InfiniBand port can have several identities at the same time. A hardware GUID identifies an object. A Local Identifier (LID) supports forwarding within a subnet. A Global Identifier (GID) represents a port in a globally structured address space. A Partition Key (P_Key) determines which logical fabric partition an endpoint may use.

These values solve different problems. Treating them as interchangeable creates fragile inventories, failed path resolution, and weak isolation.

| Chapter field | Value |
|---|---|
| Volume | 08 — InfiniBand |
| Difficulty | Advanced |
| Estimated reading time | 55–75 minutes |
| Primary focus | Identity, path resolution, and partitioning |
| Previous | Verbs, Queue Pairs, and Completion Queues |
| Next | Subnet Management and OpenSM |

## Story: The Node That Changed Identity After Maintenance

A cluster node is serviced and its HCA firmware is updated. After the maintenance window, the port becomes active and receives a different LID from the subnet manager.

An operations script still assumes that the old LID permanently identifies the node. The script updates the wrong inventory record, and a troubleshooting engineer spends hours investigating an apparent duplicate endpoint.

At the same time, one application selects a different GID index than before. It now uses an identity associated with another address context. Another tenant loses connectivity because a partition update was applied to only one side of a path.

Nothing is wrong with InfiniBand addressing. The design confused stable identity, assigned forwarding identity, global identity, and partition membership.

The operational lesson is:

> Inventory should anchor on stable identities, while runtime diagnostics must capture the exact LID, GID, P_Key, port, and path selected for the current session.

## Learning Objectives

After completing this chapter, you will be able to:

- distinguish node, system-image, and port GUID concepts;
- explain how LIDs support local subnet forwarding;
- explain why LIDs may change;
- describe the structure and purpose of GIDs;
- explain why one port can expose multiple GIDs;
- describe P_Key membership and limited versus full membership;
- explain path records and the attributes they carry;
- identify common address-selection failures;
- design a source of truth for fabric identity;
- troubleshoot partition and path mismatches.

## Big Picture

```mermaid
flowchart TD
    Device[InfiniBand Device]
    Port[Physical Port]
    GUID[Persistent GUID Identity]
    LID[Subnet-Assigned LID]
    GID1[GID Entry 1]
    GID2[GID Entry 2]
    PKEY[P_Key Table]
    Path[Resolved Path Record]

    Device --> Port
    Port --> GUID
    Port --> LID
    Port --> GID1
    Port --> GID2
    Port --> PKEY
    LID --> Path
    GID1 --> Path
    PKEY --> Path
```

**Figure 8.4.1 — One port participates in several identity systems.** Stable hardware identity, local forwarding identity, global identity, partition membership, and path attributes must all align.

## Why Multiple Identity Types Exist

A single address cannot efficiently answer every question.

The fabric needs to answer:

- Which physical object is this?
- How should packets be forwarded inside this subnet?
- How should a port be represented in a globally structured namespace?
- Which logical communication partition may the endpoint use?
- Which MTU, service level, rate, and lifetime should a path use?

InfiniBand separates these concerns.

## GUIDs: Stable Object Identity

A Globally Unique Identifier (GUID) is used to identify InfiniBand objects such as nodes, ports, and system images.

Conceptually, operators may encounter:

- **node GUID:** identifies an InfiniBand node object;
- **port GUID:** identifies a particular port;
- **system-image GUID:** associates related ports or functions within a system image.

The exact values and exposure depend on the adapter and platform.

### Why GUIDs matter operationally

GUIDs are more suitable than LIDs for durable inventory because they are intended to remain associated with hardware objects.

A production source of truth should map:

- server name;
- rack and unit;
- HCA PCI address;
- HCA device name;
- port number;
- port GUID;
- connected switch and switch port;
- cable identifier;
- intended fabric and rail;
- firmware and driver versions.

A GUID is not a complete security identity. It is an object identifier used within the fabric architecture.

## LIDs: Local Subnet Forwarding

A Local Identifier (LID) is assigned by subnet management and used for forwarding within an InfiniBand subnet.

```mermaid
flowchart LR
    HCAA[HCA Port LID 12]
    SW1[Switch]
    SW2[Switch]
    HCAB[HCA Port LID 87]

    HCAA -->|Destination LID 87| SW1 --> SW2 --> HCAB
```

**Figure 8.4.2 — LIDs are forwarding identities within a subnet.** Switch forwarding tables direct packets toward the destination LID.

The subnet manager:

- discovers ports;
- assigns LIDs;
- calculates routes;
- programs switch forwarding tables;
- updates state after topology changes.

### Why LIDs can change

LIDs are assigned operational state, not immutable hardware identity.

They may change after:

- subnet-manager restart or policy change;
- topology modification;
- device replacement;
- fabric reconfiguration;
- LID-mask-control changes;
- recovery from stale state.

Scripts should not assume that a LID permanently identifies one server.

### LID Mask Control

A port may be assigned a range of LIDs depending on LID Mask Control (LMC). Multiple LIDs can provide path diversity by allowing routes to distribute traffic toward one port identity range.

This is a routing and scale design topic, not merely an addressing curiosity. Operations should record the current assigned range and the policy that produced it.

## GIDs: Globally Structured Port Identity

A Global Identifier (GID) is a 128-bit identity associated with a port and address context.

A GID combines a subnet prefix with an interface-identifier portion.

Conceptually:

```text
GID = Subnet Prefix + Interface Identifier
```

A port can expose multiple GID-table entries because it may participate in multiple address contexts, protocols, virtual functions, or network configurations.

### Why GID index matters

Applications and communication libraries may select a GID by table index. Choosing the wrong entry can produce:

- path-resolution failure;
- use of an unintended interface or address family;
- inability to communicate with a peer;
- unexpected routing behavior;
- inconsistent behavior across nodes with different table ordering.

Support bundles should capture the selected GID value and index, not only the adapter name.

## P_Keys: Partition Membership

A Partition Key (P_Key) provides logical partitioning inside an InfiniBand fabric.

The subnet manager or partition manager distributes partition membership to endpoint and switch tables. Packets with invalid partition context can be discarded by the fabric.

```mermaid
flowchart LR
    TenantA1[Tenant A Node 1]
    TenantA2[Tenant A Node 2]
    TenantB[Tenant B Node]
    Fabric[Shared InfiniBand Fabric]

    TenantA1 -->|P_Key A| Fabric -->|P_Key A| TenantA2
    TenantB -. incompatible P_Key .-> Fabric
```

**Figure 8.4.3 — P_Keys create logical communication groups.** Shared physical infrastructure can enforce partition membership at the fabric layer.

### Full and limited membership

Partition membership can distinguish full and limited members.

A simplified interpretation is:

- **full members** can communicate with full and limited members of the same partition;
- **limited members** can communicate with full members but not necessarily directly with other limited members.

Exact policy should be verified against the active subnet-manager configuration and architecture.

### What P_Keys do not replace

P_Keys are not a complete tenant-security architecture. They should be combined with:

- host authentication and authorization;
- scheduler and namespace isolation;
- container or VM device boundaries;
- memory-registration protection;
- secrets management;
- management-plane access control;
- monitoring and audit.

## Address and Path Resolution

An application needs more than a destination identity. It needs a path with compatible attributes.

A path record can include information such as:

- source and destination identifiers;
- source and destination LIDs;
- P_Key;
- service level;
- MTU;
- rate;
- packet lifetime;
- reversible-path indication;
- preference or path information.

```mermaid
sequenceDiagram
    participant A as Application or Library
    participant SA as Subnet Administration
    participant SM as Subnet Manager State

    A->>SA: Request path to destination GID
    SA->>SM: Consult topology, partitions, and routes
    SM-->>SA: Valid path attributes
    SA-->>A: LIDs, P_Key, SL, MTU, rate, lifetime
```

**Figure 8.4.4 — Path resolution joins identity with transport-ready attributes.** A reachable destination identity is insufficient when path parameters are incompatible.

## Service IDs and Communication Managers

Connection-management mechanisms can use service identifiers and path information to establish communication between peers.

Operationally, failed connection setup may result from:

- destination identity mismatch;
- incorrect GID selection;
- missing partition membership;
- incompatible MTU;
- stale path record;
- service not listening;
- route or subnet-manager inconsistency.

The error may appear as a connection timeout even when the physical fabric is healthy.

## Identity Relationships

| Identity or attribute | Assigned by | Stability | Scope | Best operational use |
|---|---|---|---|---|
| Port GUID | Hardware/platform | Relatively stable | Object identity | Inventory and port mapping |
| LID | Subnet manager | Runtime-assigned | One subnet | Local forwarding and diagnostics |
| GID | Port/address configuration | Context-dependent | Global-style identity | Path and protocol selection |
| P_Key | Partition policy | Configuration-dependent | Logical partition | Fabric membership and isolation |
| Path record | Subnet administration | Runtime-derived | One source-destination path | Transport setup and validation |

## Mixed Environments and Multiple GIDs

Modern adapters may support multiple link or protocol modes depending on platform configuration. Virtual functions, container networking, IP over InfiniBand, and other address contexts can expand GID tables.

Two nodes that look identical at the hardware level may have different GID-index ordering because of:

- interface configuration;
- virtualization;
- driver version;
- address assignment;
- port mode;
- boot order;
- network-namespace behavior.

Automation should select by semantic value or verified policy rather than assuming “GID index 3” means the same thing everywhere.

## Production Architecture Considerations

### Scalability

Large fabrics require scalable identity management.

Avoid spreadsheets that manually map mutable LIDs. Maintain machine-readable inventory keyed by stable GUIDs and enrich it with current runtime state.

### Availability

Topology changes and subnet-manager failover can update forwarding state. Applications and libraries need to tolerate path refresh, reconnect, or job restart according to service objectives.

### Security

Protect:

- partition-policy files;
- subnet-manager administrative access;
- management keys;
- host access to RDMA devices;
- remote keys and registered-memory lifetimes;
- inventory data that maps tenants to fabric identities.

### Operations

A support bundle should capture:

- server and process identity;
- HCA and port;
- port GUID;
- current LID and LID range;
- selected GID and index;
- P_Key membership;
- path attributes;
- queue-pair transport;
- peer identity;
- subnet-manager view;
- timestamp and topology generation.

## Production Deployment Pattern

1. Establish a GUID-based source of truth.
2. Define partition ownership and membership.
3. Generate subnet-manager partition configuration from controlled data.
4. Validate P_Key tables after deployment.
5. Record current LIDs without treating them as permanent.
6. Validate GID-table consistency where applications depend on a selection policy.
7. Query representative path records.
8. Test communication within and across intended partitions.
9. Prove denied communication where isolation is required.
10. Monitor for unexpected identity or partition drift.

## Production Troubleshooting

### Scenario 1 — Port is active, but peers cannot communicate

**Symptoms**

- physical and logical port state are healthy;
- one pair cannot establish transport;
- another pair on the same switch works.

**Diagnosis**

Compare both endpoints:

- selected P_Key;
- P_Key-table membership;
- selected GID and index;
- path-record response;
- MTU and service level;
- destination LID and route;
- queue-pair attributes.

**Root cause examples**

- partition mismatch;
- wrong GID index;
- stale path information;
- incompatible path attributes.

### Scenario 2 — Inventory maps the wrong host after a restart

**Symptoms**

- automation associates a LID with the wrong server;
- duplicate or missing-node alerts appear;
- port GUID data is correct.

**Root cause**

The inventory treated a mutable LID as a permanent identity.

**Resolution**

Key durable records by GUID and update LID as observed runtime state.

### Scenario 3 — One application works, another fails on the same nodes

**Diagnosis**

Capture each application’s:

- device and port selection;
- GID index and GID value;
- P_Key;
- service level;
- transport type;
- connection-management behavior.

Different libraries may choose different address contexts.

### Scenario 4 — Tenant isolation is inconsistent

**Symptoms**

- some endpoints can communicate across an intended boundary;
- others are unexpectedly blocked;
- partition configuration changed recently.

**Diagnosis**

Compare the authoritative partition policy with endpoint and switch P_Key tables. Verify full versus limited membership and confirm the subnet manager applied the update everywhere.

**Resolution**

Correct the source policy, redeploy through the supported subnet-manager workflow, and test both allowed and denied paths.

### Scenario 5 — GID tables differ across nominally identical nodes

**Likely causes**

- different interface configuration;
- virtualization differences;
- driver or firmware drift;
- inconsistent address assignment;
- namespace or boot-order differences.

**Resolution**

Standardize the software and network configuration, then select GIDs using an explicit validated rule.

## Customer Scenario

A financial-services customer wants strong isolation between research teams while sharing one InfiniBand fabric.

The architect proposes P_Key partitions as one control but explains their boundary. The complete design also includes:

- scheduler queues and quotas;
- separate Kubernetes namespaces or workload domains;
- host and container device access policy;
- identity and authorization;
- management-plane separation;
- telemetry tagged by tenant;
- testing of allowed and denied communication;
- controlled change management for partition policy.

The value of P_Keys is presented accurately: they provide fabric-level membership, not an entire security program.

## Interview Preparation

### Knowledge Questions

1. Why should inventory use GUIDs instead of LIDs?
2. What does a LID represent?
3. Why can one port have multiple GIDs?
4. What does a P_Key enforce?
5. What information can a path record provide?

### Architecture Questions

1. Design a GUID-based source of truth for a 1,000-node fabric.
2. Explain how P_Key partitions support shared infrastructure.
3. Draw the relationship between GID selection and path resolution.

### Scenario Questions

1. A port is active but connection setup times out. Which identity fields do you compare?
2. GID index 3 works on half the nodes and fails on the rest. What is wrong with the automation assumption?
3. LIDs changed after maintenance. How should monitoring adapt?

### Customer Questions

1. Are P_Keys equivalent to VLANs?
2. Do P_Keys fully isolate tenants?
3. Why do we need both GUIDs and LIDs?

### Whiteboard Question

Draw two HCA ports in one subnet. Label each port’s GUID, LID, two GID entries, P_Key table, and the path record used to establish a reliable-connected queue pair.

## Summary

InfiniBand uses several identity systems because hardware identity, local forwarding, global addressing, partition membership, and path establishment are different concerns.

GUIDs are appropriate anchors for durable inventory. LIDs are runtime forwarding identities assigned by subnet management. GIDs represent port address contexts and may have multiple table entries. P_Keys define logical partition membership. Path records combine these identities with transport-ready attributes.

## Key Takeaways

- GUIDs identify fabric objects and are relatively stable.
- LIDs are assigned for forwarding within a subnet.
- GIDs are 128-bit port identities and can exist in multiple entries.
- P_Keys enforce logical partition membership.
- Path resolution includes more than destination identity.
- Support bundles must capture the exact GID index, P_Key, LID, and path selected.
- Partitioning must be combined with host, scheduler, and application security.

## Quick Revision Sheet

| Concept | Remember |
|---|---|
| GUID | Stable identity for a node, port, or system image |
| LID | Subnet-assigned forwarding identifier |
| LMC | Allows a port to receive a range of LIDs |
| GID | 128-bit identity for a port address context |
| GID index | Position of one GID in the port table |
| P_Key | Partition membership value |
| Path record | Source-to-destination path attributes |
| Service level | Traffic class used along the path |

## Lab Checklist

Before moving on, confirm that you can:

- map a host to a port GUID;
- record the current LID without treating it as permanent;
- display and interpret the GID table;
- verify P_Key membership;
- query or inspect path information;
- explain full versus limited partition membership;
- diagnose a GID-index or partition mismatch.

## Cross References

- Previous: [Verbs, Queue Pairs, and Completion Queues](./chapter-03-verbs-queue-pairs-and-completion-queues)
- Next: [Subnet Management and OpenSM](./chapter-05-subnet-management-and-opensm)
- Related chapter: [Topology-Aware Placement](../volume-07/chapter-08-topology-aware-placement)
- Related lab: [Inspect Subnet Routing and Counters](./labs/lab-03-inspect-subnet-routing-and-counters)

## Further Reading

Use current NVIDIA networking and subnet-manager documentation for GUID and LID behavior, partition configuration, GID tables, path records, and the exact commands supported by your deployed software stack.