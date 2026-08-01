---
title: "4 - Containers and Kubernetes fundamentals: what you need before Volume 3"
slug: "4-containers-and-kubernetes-fundamentals-before-volume-3"
sidebar_position: 4
description: "Containers and Kubernetes fundamentals: what you need before Volume 3 — Foundations Primer."
source_document: "Authored directly for the Foundations Primer — no DOCX source."
---

## What this chapter is, and what it isn't

This chapter will not make you a Kubernetes expert. It will not cover operators, admission controllers, CNI internals, or scheduling algorithms — Volume 3 (Kubernetes and Platform Engineering) covers those, and it covers them at a senior, production-incident level. What this chapter gives you is the small set of mental models you need in place *before* you read Volume 3, so that when it says "the Deployment controller reconciles desired state," you already know what a Deployment is, what a controller is, and why "reconcile" is the right word instead of pausing to look up three terms mid-sentence.

You already know how to design and run distributed software. You've deployed things before — maybe onto VMs, maybe onto bare metal, maybe with a home-grown deploy script. What's new here is not "how do computers run programs." What's new is the specific set of problems containers and Kubernetes exist to solve, and the vocabulary that's grown up around those solutions.

## The problem before the tool: "it works on my machine"

Start with a problem you've almost certainly lived through, even if you never called it this: you write a program on your laptop. It works. You hand it to a teammate, or push it to a server, and it doesn't work — because your laptop has Python 3.11 and the server has Python 3.8, or a library version differs, or an environment variable you forgot you set locally isn't set there.

The underlying issue is that a running program doesn't just depend on its own code. It depends on everything around it: the language runtime, specific library versions, configuration files, sometimes even specific OS behavior. Traditionally, all of that surrounding "everything it needs" lived on the host machine, installed by hand or by some setup script, drifting slowly out of sync between machines.

A **container** (a way of packaging a program together with everything it needs to run, so it behaves the same regardless of what else is or isn't installed on the machine it lands on) exists to solve exactly this. Note what a container is *not*, because this is the single most common wrong mental model people carry in: a container is **not** a lightweight virtual machine. A VM virtualizes hardware and runs a full separate operating system kernel on top of it. A container shares the host machine's kernel — it's really an isolated set of processes, walled off from the rest of the system, running on the same kernel as everything else on that host. The isolation is enforced by the OS (Linux namespaces and cgroups, if you want the underlying mechanism), not by simulating a whole computer. That's why containers start in milliseconds and VMs start in tens of seconds — they're doing fundamentally less work.

## Image vs. container: the same relationship as class vs. object

Once you accept "package the program with what it needs," a natural question follows: package it *into what*, exactly, and where does that package live when nothing is running?

A **container image** (a packaged, layered snapshot of a filesystem, plus instructions for how to run it) is the answer. It's a file — really a set of stacked filesystem layers — sitting in storage, doing nothing. It contains your application code, the runtime it needs, any libraries, and a instruction for what command to execute when someone runs it.

A **container** (a running instance of an image — an actual live process, isolated from other processes, executing right now) is what you get when something takes that image and actually starts it.

If you want a precise analogy from software you already know: an image is to a container what a class is to an object. The class is the definition sitting in your source code, inert. The object is a live instance of it in memory, actually doing something, with its own state. You can start many containers from the same image, just as you can create many objects from the same class — each one is independent, but they all started from the same blueprint. If you prefer a more everyday analogy: an image is a recipe, a container is the actual meal cooked from it. You can cook the same recipe many times; each meal is separate, but they all came from the same instructions.

```
   [ Container Image ]  --(docker run / similar)-->  [ Running Container ]
   (inert, on disk)                                    (live process, isolated)
```

**Check your understanding**
- Q: Why isn't a container "just a lightweight VM"? A: Because it doesn't virtualize hardware or run its own kernel — it's an isolated process (or group of processes) sharing the host's kernel, which is why it starts far faster and is fundamentally lighter-weight than a VM.
- Q: If you start five containers from the same image, do they share state? A: No — each is an independent running instance, the same way five objects created from one class each have their own separate state.

## The next problem: now you have hundreds of containers, on many machines

Suppose you've solved the "it works on my machine" problem. You now have containers running your services reliably. But real systems don't run one container on one machine — they run many containers, of many different services, and they need more machines than one to have enough capacity and to survive a machine dying.

This creates a set of problems that have nothing to do with containers themselves and everything to do with *managing many of them across many machines*:

- Something has to decide *which machine* each container should run on, given how much CPU/memory each machine has free.
- Something has to notice when a container — or the whole machine it was on — dies, and start a replacement.
- Something has to let containers find each other. If service A needs to talk to service B, and B might be restarted onto a different machine with a different IP address at any moment, A can't just hardcode B's IP.

This is the single most important idea in this whole chapter: **Kubernetes exists to solve the problem of running many containers reliably across many machines, when no human can realistically make those placement, restart, and discovery decisions by hand, fast enough, all the time.** Everything else Kubernetes does is in service of that one problem. Volume 3 will spend a lot of time on the mechanics — but if you keep this sentence in mind, the mechanics will make sense as answers to a problem you already understand, rather than as arbitrary API objects to memorize.

**Check your understanding**
- Q: Why can't service A just hardcode service B's IP address? A: Because B's underlying container can be restarted, rescheduled, or replaced at any time and may come back on a different machine with a different IP — a hardcoded IP would break.
- Q: In one sentence, what problem does Kubernetes exist to solve? A: Deciding where containers run across many machines, restarting them when they fail, and letting them find each other reliably, without a human doing it by hand.

## The four objects you need before Volume 3 goes deep

Volume 3 will introduce many Kubernetes object types. You need exactly four of them solidly in place first, each introduced by the problem it solves.

**Pod** — problem: a container in isolation is fine, but sometimes two containers are so tightly coupled (e.g., your app plus a small helper process that ships its logs) that they genuinely need to be scheduled together, on the same machine, sharing some resources like network address. A **Pod** (one or more containers that are scheduled together and live together as a single unit) is Kubernetes's smallest deployable thing — not a container itself, but the wrapper around one or more containers that always travel as a set.

**Node** — problem: Pods have to run somewhere physical (or virtual). A **Node** (a machine — physical or virtual — that is part of the cluster and capable of running Pods) is that "somewhere." A cluster is a set of Nodes.

**Deployment** — problem: you don't want to manually notice a Pod died and manually start a new one, and you don't want to manually keep three copies running for capacity. A **Deployment** (a declared promise about how many copies of a Pod should exist, which Kubernetes continuously works to keep true) states "I want 3 copies of this Pod running, always," and Kubernetes handles making that keep being true, including replacing copies that die. This is self-healing not because anything is smart, but because something is *continuously checking and correcting*.

**Service** — problem: even with a Deployment keeping 3 Pods alive, those Pods can be replaced, and replacements get new IPs. Something else needs a stable way to reach "whichever Pods are currently the healthy ones for this Deployment," without caring which exact Pods those are right now. A **Service** (a stable name and address that always routes to whichever Pods currently match it, even as those Pods come and go) is that stable front door.

```
   [ Node ] ---- runs ----> [ Pod ] [ Pod ] [ Pod ]
                                ^ kept at 3 copies by a [ Deployment ]
                                ^ reachable via a stable [ Service ] name
```

**Check your understanding**
- Q: What's the difference between a Pod and a Node? A: A Node is a machine; a Pod is a group of one or more containers that runs *on* a Node.
- Q: If a Deployment says "3 replicas" and one Pod crashes, what happens, and why is that not magic? A: Kubernetes notices the actual count (2) doesn't match the desired count (3) and starts a new Pod — it's continuous checking-and-correcting, not intelligence.
- Q: Why does a Service need to exist even though Pods already have IP addresses? A: Because individual Pod IPs change as Pods are replaced; the Service gives callers one stable address that always points at the current healthy set.

## The core mental model Volume 3 builds on: declare what you want, a controller makes it true

Everything above — a Deployment keeping 3 Pods alive, a Service always pointing at the current healthy Pods — is one repeated pattern, and Volume 3 assumes you already recognize it. The pattern is: **you declare what you want (desired state), and something else continuously compares that to what actually exists (actual state) and takes action to close the gap.** That "something else" is called a **controller** (a continuously-running process whose only job is to keep actual state matching desired state).

The clean analogy is a thermostat. You don't tell a thermostat "turn the heater on now" and "turn it off in ten minutes." You set a target temperature — the desired state. The thermostat continuously measures the actual room temperature, and independently decides, over and over, whether to turn the heater on or off to close the gap. You never issue a one-time command; you declare a goal, and correction happens continuously and automatically. Kubernetes controllers work identically: you declare "3 replicas of this Pod" once, and the Deployment controller keeps checking and correcting, forever, without you re-issuing the instruction.

This is why Kubernetes configuration is almost entirely declarative ("here's the state I want") rather than imperative ("run these steps"). Volume 3 will use the words "reconcile" and "reconciliation loop" constantly — that word simply means the controller's repeated act of comparing desired vs. actual state and correcting the difference.

**Check your understanding**
- Q: In the thermostat analogy, what is the "desired state" and what plays the role of the "controller"? A: The target temperature you set is the desired state; the thermostat's ongoing measure-and-adjust behavior is the controller.
- Q: Why is "reconcile" a fitting word for what a controller does? A: Because it repeatedly compares two things (desired vs. actual state) and acts to bring them into agreement — literally reconciling a difference.

## Evidence vs. proof: don't trust one command's output alone

You'll see commands like `kubectl get pods` showing `STATUS: Running` in Volume 3 and in real clusters. It's worth building the right habit now: that single line of output is **evidence**, not **proof**, of health. It proves the container process started and hasn't crashed according to Kubernetes's own liveness check. It does **not** prove the application inside is actually serving correct responses, isn't stuck in a retry loop, or has enough memory headroom to survive the next traffic spike. To actually confirm "this service is healthy," you'd need corroborating evidence — application-level health checks, request success rates, resource usage over time — not just one status field. Volume 3's platform-engineering material leans on this distinction constantly when reasoning about real incidents; get comfortable treating any single command's output as one data point, not a verdict.

## Glossary

- **Container** — an isolated, running process (or group of processes) packaged with everything it needs, sharing the host's kernel rather than virtualizing hardware.
- **Container image** — the inert, packaged, layered filesystem snapshot plus run instructions that a container is started from.
- **Kubernetes** — a system for deciding where containers run across many machines, restarting them on failure, and letting them find each other reliably.
- **Node** — a machine (physical or virtual) in a Kubernetes cluster that is capable of running Pods.
- **Pod** — the smallest deployable unit in Kubernetes: one or more containers scheduled and living together.
- **Deployment** — a declared desired count of Pod copies that Kubernetes continuously works to keep true, including replacing failed ones.
- **Service** — a stable name/address that routes to whichever Pods currently match it, regardless of individual Pod churn.
- **Controller** — a continuously-running process that compares actual state to desired state and acts to close the gap.
- **Reconciliation** — the repeated act of a controller comparing desired vs. actual state and correcting differences.
- **Declarative configuration** — stating the end state you want, rather than the steps to get there.

## You're ready for Volume 3 when you can...

- Explain, without hedging, why a container is not "a lightweight VM," and what it actually is instead.
- Describe the difference between a container image and a running container using either the class/object or recipe/meal analogy.
- State, in one sentence, the core problem Kubernetes exists to solve.
- Name the four objects (Pod, Node, Deployment, Service) and the specific problem each one solves.
- Explain the "declare desired state, a controller reconciles it" pattern using the thermostat analogy, and recognize it every time Volume 3 uses the word "reconcile."

**Continue to:** [Volume 3, Chapter 1 — API server, etcd and the object model](/curriculum/volume-03/chapter-1-api-server-etcd-and-the-object-model)
