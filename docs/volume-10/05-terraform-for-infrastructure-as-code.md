---
title: "Chapter 5 - Terraform for infrastructure as code"
slug: "chapter-5-terraform-for-infrastructure-as-code"
sidebar_position: 5
description: "Chapter 5 - Terraform for infrastructure as code — Bare-Metal, HPC Operations and Infrastructure-as-Code."
source_document: "Authored directly for the JR2018680 gap-coverage volume — no DOCX source."
---
**Learning outcome:** Explain what Terraform state actually is, why it is the dangerous part of the tool rather than the syntax, and where the ownership boundary sits between Terraform and node-configuration tools like Ansible/BCM on a GPU-cluster-adjacent stack.

## Start here — Terraform manages API objects, not arbitrary commands

Terraform compares a declaration of what should exist with what it previously managed and what the provider now observes. Four nouns unlock the rest:

| Noun | Meaning | Example |
|---|---|---|
| Provider | Plugin that speaks an external API | AWS, Azure, Kubernetes, Vault |
| Resource | One object Terraform owns | subnet, VM, IAM role, DNS record |
| Configuration | Your desired declaration in `.tf` files | "this subnet must exist" |
| State | Terraform's mapping between declarations and real object IDs | `aws_subnet.train` → `subnet-123` |

The normal learning loop is deliberately small:

```text
terraform init → terraform validate → terraform plan → review → terraform apply
get providers       syntax/schema         proposed diff      human       mutation
```

Suppose configuration says a subnet should use `10.20.0.0/24`. State says Terraform manages API object `subnet-123`. The provider reports that someone changed it outside Terraform. The plan reconciles those three views; it does not merely "run the file." That is why a plan must be read for creates (`+`), in-place changes (`~`), deletes (`-`), and replacements (`-/+`). A replacement is especially important for stateful or scarce GPU infrastructure because it destroys one object and creates another.

Terraform state can contain identifiers and sensitive values. Store team state in an access-controlled remote backend with locking and encryption; do not commit it to Git or paste it casually into incident tickets. A saved plan is also sensitive and time-bound: review and apply the same artifact before the surrounding infrastructure changes.

Finally, Terraform needs an API/provider. It cannot magically configure an arbitrary physical server. It can create API-managed networks, IAM, DNS, cloud GPU instances, and perhaps DCIM/BMC objects where suitable providers exist; BCM or Ansible usually owns the OS and node configuration after that boundary.

## Providers, resources, and the state file

A provider (`aws`, `google`, `azurerm`, but also non-cloud providers like `vault`, `kubernetes`, or a colo/DCIM provider) is a plugin translating HCL resource blocks into API calls against a specific system. A resource block declares one managed object — a VPC, an IAM role, a storage bucket, a cloud GPU instance:

```hcl
resource "aws_instance" "gpu_worker" {
  ami           = "ami-0abc123gpu"
  instance_type = "p5.48xlarge"
  subnet_id     = aws_subnet.training_net.id
  tags = { Role = "gpu-training-worker", Cluster = "vol10-demo" }
}
```

Terraform does not talk to real infrastructure to figure out what exists — it talks to the **state file** (`terraform.tfstate`), a JSON record of every resource Terraform believes it created, with the ID and last-known attributes of each. Every `plan`/`apply` is fundamentally a three-way diff: declared config vs. state (what Terraform last knew) vs. real infrastructure (what actually exists right now, refreshed via provider API calls). State is what makes Terraform declarative instead of a shell script that re-runs `aws ec2 run-instances` every time — but it's also the single most dangerous file in the workflow, because Terraform's decisions are only as correct as its belief about reality.

```
        declared config (.tf files)
                    │
                    ▼
        ┌─────────────────────┐         refresh          ┌─────────────────┐
        │   STATE FILE         │◀────────────────────────▶│  real infra      │
        │  (single source of   │      (read actual        │  (cloud APIs /   │
        │   truth Terraform    │       resource attrs)    │   on-prem infra) │
        │   reasons FROM)       │                          └─────────────────┘
        └──────────┬────────────┘
                    │ diff: config vs state vs real
                    ▼
              terraform plan
                    │
                    ▼
   DRIFT = state says X, real infra is Y (someone changed it outside Terraform)
   → next apply "corrects" drift by making real infra match declared config,
     which can mean DESTROYING the drifted resource, not gently adjusting it
```

Drift is any gap between state and reality — a console click, a manual `kubectl`/`aws cli` change, another automation tool touching the same resource. Terraform has no way to know *why* the drift happened; it only knows state disagrees with either config or reality, and it will reconcile toward the declared config, using whatever operation (update or destroy-and-recreate) the provider's resource schema says is required to get there.

## Why state needs locking and a remote backend

Local state (`terraform.tfstate` sitting in a laptop's working directory) is a single point of failure and a concurrency hazard: two engineers running `apply` against the same local-state-backed config at the same time can corrupt or silently overwrite each other's state, producing a Terraform that no longer accurately tracks real infrastructure. Remote backends (S3+DynamoDB, Terraform Cloud, GCS, Consul) solve two different problems together:

```
terraform {
  backend "s3" {
    bucket         = "acme-tfstate"
    key            = "gpu-cluster-network/terraform.tfstate"
    region         = "us-west-2"
    dynamodb_table = "tf-state-locks"
    encrypt        = true
  }
}
```

The S3 bucket is shared, durable storage for the state file itself — no more "state only exists on one laptop." The DynamoDB table provides **state locking**: `terraform apply` acquires a lock row before it starts, and a second `apply` against the same state blocks (or fails fast) until the first finishes. Without locking, concurrent applies race against the same real infrastructure with two different in-memory pictures of what state should look like afterward — a classic corruption path.

## Blast radius of a bad apply, and why `-/+` is the line to fear

`terraform plan` output uses three action markers: `+` create, `~` update in place, `-/+` destroy and recreate. The first two are usually safe to reason about in isolation. `-/+` means the provider's resource schema has decided the requested change cannot be applied to the existing object — some attribute is immutable after creation — so Terraform's only path to the declared state is deleting the current resource and creating a new one with a new ID.

```
$ terraform plan

  # aws_instance.gpu_worker must be replaced
-/+ resource "aws_instance" "gpu_worker" {
      ~ instance_type      = "p5.48xlarge" -> "p5e.48xlarge"  # forces replacement
      ~ id                 = "i-0a1b2c3d4e5f67890" -> (known after apply)
      ~ private_ip         = "10.0.4.17" -> (known after apply)
        tags               = {
            "Cluster" = "vol10-demo"
            "Role"    = "gpu-training-worker"
        }
        # (12 unchanged attributes hidden)
    }

Plan: 1 to add, 0 to change, 1 to destroy.
```

Read this literally: one new instance created, one destroyed — not "one instance resized." A running multi-day training job's host is about to be deleted and replaced with a new instance ID, new private IP, and (unless carefully staged) no guarantee of scheduling on the same physical rack/placement group. `~` in a plan means "Terraform can mutate this object without destroying it"; `-/+` means "Terraform is about to delete something and hope the replacement is close enough" — that is the line that should stop an apply for manual review every single time it appears on anything stateful (a running instance, a database, a persistent volume), regardless of how routine the rest of the plan looks. `Plan: 1 to add, 0 to change, 1 to destroy` is the summary line worth reading before scrolling — "0 to change" next to "1 to destroy" is the tell that something in this plan is more disruptive than it might look from the diff alone.

## Mandatory plan review before apply

```
terraform plan -out=tfplan
terraform show -json tfplan | jq '.resource_changes[] | select(.change.actions[0]=="delete" or (.change.actions | length > 1))'
terraform apply tfplan
```

Saving the plan to a file (`-out=tfplan`) and applying *that exact file* — rather than re-running `plan` implicitly inside `apply` — guarantees the plan a human reviewed is the plan that executes; nothing about real infrastructure or the config can shift in the gap between review and apply. Piping the JSON plan through `jq` to isolate deletes/replacements is how you make "did anything scary happen in this 400-line plan" a grep-able question instead of a skim.

## Modules for reusable GPU-cluster building blocks

```hcl
module "gpu_training_vpc" {
  source          = "./modules/gpu-vpc"
  cidr_block      = "10.20.0.0/16"
  az_count        = 3
  enable_flow_logs = true
}

module "gpu_worker_pool" {
  source        = "./modules/gpu-instance-pool"
  instance_type = "p5.48xlarge"
  desired_count = 32
  subnet_ids    = module.gpu_training_vpc.private_subnet_ids
}
```

Modules encapsulate a reusable pattern (a VPC with the right subnetting/flow-log/NAT setup for a GPU cluster; an instance pool with the right placement-group, EFA-networking, and taint/lifecycle configuration) behind a small interface, so a new cluster is a module call with different variables, not a re-derivation of 300 lines of networking HCL. This is the same "don't repeat yourself, review the interface not the internals" argument as an Ansible role — the module boundary is where you put review effort, and callers trust it.

## Lifecycle and taint handling for a cloud GPU instance fleet

```hcl
resource "aws_instance" "gpu_worker" {
  count         = 32
  ami           = var.gpu_ami_id
  instance_type = "p5.48xlarge"

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [ami]   # driver/AMI patched out-of-band by Ansible; don't fight it
  }
}
```

`create_before_destroy` matters for anything where losing capacity mid-replacement is expensive — bring up the replacement GPU instance, confirm it's healthy, then tear down the old one, instead of the default destroy-then-create order that briefly has zero capacity. `ignore_changes = [ami]` is a deliberate ownership statement: once the instance exists, Terraform stops trying to reconcile that one attribute even if it drifts, because a downstream tool (Ansible re-imaging with a new driver build) is now the authority on it, not Terraform. `terraform taint`/`terraform apply -replace=<address>` marks a specific resource for forced recreation on the next apply — useful when a specific GPU instance is suspected of bad hardware (Xid errors, ECC failures) and needs to be cycled without touching the other 31.

## The ownership boundary: what Terraform should and shouldn't own

```
Terraform owns:                          Ansible / BCM own:
  - VPCs, subnets, security groups         - OS packages, kernel params
  - IAM roles/policies                     - NVIDIA driver install/version
  - Storage buckets, EBS/EFS volumes       - GPU firmware, MIG partitioning
  - Cloud GPU instance existence/count      - DCGM exporter config
  - Load balancers, DNS records             - Slurm/BCM node join/config
  - The cloud-side scaffolding AROUND       - Everything INSIDE the OS once
    an on-prem/colo GPU cluster               the instance/node exists
```

Terraform is good at declaring *that a resource exists* with certain top-level attributes; it is a poor fit for *what happens inside the OS* once that resource is running — package installs, config file content, service state are all naturally idempotent, convergence-oriented operations better modeled by Ansible or a BCM head node than by resource-replacement semantics. The interview-relevant boundary case: an on-prem or colo GPU cluster typically has Terraform managing the cloud-side edges around it — VPN/Direct Connect endpoints, IAM for a hybrid control plane, an object-storage bucket that checkpoints get shipped to, DNS — while BCM or Ansible manages the bare-metal nodes themselves, because Terraform has no meaningful provider model for "rack this physical server and image it." Cross a resource over that boundary in the wrong direction — e.g., trying to manage `/etc/slurm/slurm.conf` content as a Terraform `local-exec` provisioner — and you get a resource that Terraform "owns" without being able to reason about drift on it correctly, which defeats the entire premise of using Terraform there.

## Worked scenario — manual console change, corrected destructively

**Situation:** A storage engineer, responding to an urgent capacity alert at 2am, manually resizes an EBS volume attached to a GPU checkpoint-staging instance directly in the AWS console, bypassing Terraform because "there was no time to go through a PR." The resize succeeds; the incident is resolved; nobody updates the `.tf` file or runs `terraform apply` to reconcile.

**What happens next:** Two weeks later, an unrelated PR modifies a tag on the same instance and triggers a normal `terraform apply`. `terraform plan` refreshes state against real infrastructure, sees the volume size no longer matches the last-known state (300 GiB in state and config vs. 500 GiB in reality), and — because volume *size* is a mutable attribute on this provider but the plan author doesn't scroll past the summary line — the apply proceeds. But a second attribute, the volume's IOPS-to-size ratio configuration set implicitly by the console resize, hit a threshold that made the *volume type* attribute inconsistent with the new size for that resource schema, which for this provider forces replacement (`-/+`) rather than in-place update. The apply destroys the 500 GiB volume — including the checkpoint data staged on it — and recreates a fresh 300 GiB volume matching the stale `.tf` declaration.

**Root cause:** Terraform did exactly what it is supposed to do — reconcile reality toward declared config — but the *declared config was wrong* because it was never updated after the manual change, and nobody treated the resulting drift as a plan-review red flag before applying.

**Fix / lesson:** Any manual change to a Terraform-managed resource must be followed immediately by either updating the `.tf` source to match (preferred) or an explicit `terraform state` operation acknowledging the new reality — and `terraform plan` output showing an unexpected `-/+` on a resource nobody intended to touch is itself the signal that drift, not a real config change, is driving the plan. That plan should never reach `apply` without someone asking "why is this resource being replaced, we didn't touch it."

**Interview-ready line:** "Terraform doesn't create drift, but it also doesn't forgive it — it treats any gap between state and reality as something to correct toward the declared config, and 'correct' can mean 'destroy and recreate' if that's the only path the resource schema allows, which is why an unreviewed manual change is a time bomb, not a shortcut."

## Mnemonic

**S.L.O.T.** — **S**tate is the source of truth Terraform reasons from, not reality itself; **L**ock it (remote backend) so concurrent applies can't corrupt it; **O**wn only the edges (networking/IAM/storage/instances), not the OS inside; **T**errify yourself at `-/+` — that's the line that destroys something.

## Practice

1. Explain the difference between what `terraform.tfstate` records and what actually exists in the cloud/on-prem environment, and describe one failure mode that happens when those two diverge without anyone running `plan`.
2. A `terraform plan` shows `~ instance_type` with no `-/+` marker, and a second plan on a different resource shows `-/+` on the same attribute name. What provider-level fact explains why the same attribute change produces different action types on two different resources?
3. Why is `terraform apply -out=tfplan` (apply a saved plan file) safer for a reviewed change than running `terraform apply` interactively, even if the reviewer looked at the same `plan` output either way?
4. Draw the ownership boundary you would defend in an interview between Terraform and Ansible/BCM for a hybrid cluster with on-prem GPU nodes and a cloud-hosted checkpoint bucket and IAM layer. Name one resource type you'd refuse to put in Terraform and why.
5. A manual console change caused state drift, and the next `terraform apply` destroyed and recreated a resource nobody intended to touch. What are the two separate failures in this incident (one process, one review), and what specific plan-output detail should have stopped the apply?
