import os

filepath = "/Users/jithinpjoseph/Documents/GitHub/nvidia-devops/docs/volume-10/11-cicd-for-infrastructure-and-cluster-configuration.md"

content = """
---

## 12. Golden Images CI/CD Deep Dive: Packer and Ansible

Building immutable node images (Golden Images) requires its own dedicated CI/CD lifecycle. In an AI factory, you cannot afford to have 1,000 nodes download the NVIDIA driver simultaneously upon boot. 

The pipeline uses **HashiCorp Packer** to launch a temporary build VM, run **Ansible** to install drivers and harden the OS, and output an immutable machine image (AMI on AWS, QCOW2 on-prem).

### 12.1 The Packer HCL Configuration

```hcl
# packer/nvidia-ai-node.pkr.hcl
packer {
  required_plugins {
    amazon = {
      version = ">= 1.2.8"
      source  = "github.com/hashicorp/amazon"
    }
    ansible = {
      version = ">= 1.1.0"
      source  = "github.com/hashicorp/ansible"
    }
  }
}

variable "ami_prefix" {
  type    = string
  default = "nvidia-ai-factory-node"
}

variable "nvidia_driver_version" {
  type    = string
  default = "535.104.05"
}

locals {
  timestamp = regex_replace(timestamp(), "[- TZ:]", "")
  image_name = "${var.ami_prefix}-${var.nvidia_driver_version}-${local.timestamp}"
}

source "amazon-ebs" "ubuntu_gpu" {
  ami_name      = local.image_name
  instance_type = "g5.2xlarge" # Build on a smaller GPU instance to compile drivers
  region        = "us-east-1"
  ssh_username  = "ubuntu"

  source_ami_filter {
    filters = {
      name                = "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["099720109477"] # Canonical
  }

  tags = {
    Name          = local.image_name
    OS_Version    = "Ubuntu 22.04"
    DriverVersion = var.nvidia_driver_version
    Type          = "GoldenImage"
  }
}

build {
  sources = ["source.amazon-ebs.ubuntu_gpu"]

  # Step 1: Wait for cloud-init to finish on the base image
  provisioner "shell" {
    inline = [
      "while [ ! -f /var/lib/cloud/instance/boot-finished ]; do echo 'Waiting for cloud-init...'; sleep 1; done",
      "sudo apt-get update && sudo apt-get upgrade -y",
      "sudo apt-get install -y linux-headers-$(uname -r) gcc make software-properties-common"
    ]
  }

  # Step 2: Run Ansible to install NVIDIA drivers, CUDA, and apply STIG hardening
  provisioner "ansible" {
    playbook_file = "../ansible/build-golden-image.yml"
    extra_arguments = [
      "--extra-vars", "nvidia_driver_version=${var.nvidia_driver_version}"
    ]
  }

  # Step 3: Run Goss or InSpec tests to validate the built image BEFORE creating the AMI
  provisioner "shell" {
    inline = [
      "nvidia-smi --query-gpu=driver_version --format=csv,noheader",
      "systemctl is-active sshd"
    ]
  }
}
```

### 12.2 Golden Image CI/CD Trigger

A standard pipeline pattern is to trigger the Packer build automatically when the `nvidia_driver_version` variable is updated in Git.

```yaml
# .gitlab-ci.yml for Golden Image Factory
build_golden_image:
  stage: build
  image: hashicorp/packer:1.9
  script:
    - packer init packer/
    - packer validate packer/
    - packer build -machine-readable packer/ | tee build.log
    # Extract the new AMI ID from the Packer logs using grep and awk
    - AMI_ID=$(grep 'artifact,0,id' build.log | cut -d, -f6 | cut -d: -f2)
    - echo "BUILT_AMI_ID=$AMI_ID" > build.env
  artifacts:
    reports:
      dotenv: build.env
```

---

## 13. Advanced Policy as Code: Guarding Network and IAM

Expanding on OPA, here are highly advanced Rego policies designed for Enterprise AI Security.

### 13.1 Rule: Forbid Public Ingress on HPC Security Groups

You must never allow `0.0.0.0/0` ingress on port 22 or InfiniBand/RoCE ports in a GPU cluster.

```rego
# policies/terraform/network_security.rego
package network_security

deny_public_ssh[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_security_group_rule"
    resource.change.actions[_] != "delete"
    
    # Check if this rule allows port 22
    resource.change.after.from_port <= 22
    resource.change.after.to_port >= 22
    resource.change.after.type == "ingress"
    
    # Check if cidr_blocks contains 0.0.0.0/0
    cidr_blocks := resource.change.after.cidr_blocks[_]
    cidr_blocks == "0.0.0.0/0"
    
    msg := sprintf("SECURITY VIOLATION: Security Group Rule '%v' allows public SSH access (0.0.0.0/0). Use Bastion/SSM instead.", [resource.address])
}
```

### 13.2 Rule: Prevent IAM Privilege Escalation

Do not allow CI/CD to provision IAM roles with `AdministratorAccess`.

```rego
# policies/terraform/iam_security.rego
package iam_security

deny_admin_iam[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_iam_role_policy_attachment"
    resource.change.actions[_] != "delete"
    
    policy_arn := resource.change.after.policy_arn
    endswith(policy_arn, "AdministratorAccess")
    
    msg := sprintf("IAM VIOLATION: Resource '%v' attempts to attach AdministratorAccess. Use least-privilege custom policies.", [resource.address])
}
```

---

## 14. Secrets Management in Infrastructure Pipelines

Infrastructure code requires secrets: database passwords for SlurmDBD, BMC/IPMI passwords for physical nodes, and API tokens. **Never commit secrets to Git.**

### 14.1 The Anti-Pattern: CI/CD Environment Variables

Storing a Slurm database password in GitHub Actions Secrets and passing it to Terraform via `TF_VAR_slurm_password` is better than plaintext, but still flawed. The secret is held in memory by the runner, and if the Terraform state file is compromised, the secret is exposed in plaintext JSON inside the state bucket.

### 14.2 The Enterprise Solution: HashiCorp Vault Integration

The infrastructure pipeline should authenticate with HashiCorp Vault (or AWS Secrets Manager), retrieve a short-lived dynamic credential, and inject it directly into the target infrastructure.

**Dynamic Vault Provider in Terraform:**
```hcl
provider "vault" {
  # Authenticate using the CI runner's JWT/OIDC token
  auth_login {
    path = "auth/jwt/login"
    parameters = {
      role = "github-actions-infra-role"
      jwt  = var.ci_jwt_token
    }
  }
}

# Fetch the BMC/IPMI password directly from Vault at runtime
data "vault_generic_secret" "bmc_credentials" {
  path = "secret/bare-metal/bmc-admin"
}

# Use it in a provider (e.g., Redfish provider for bare metal)
provider "redfish" {
  endpoint = "https://10.10.1.50"
  username = "admin"
  password = data.vault_generic_secret.bmc_credentials.data["password"]
}
```

### 14.3 SOPS and Sealed Secrets for GitOps

If you are using ArgoCD, how do you store a Kubernetes `Secret` manifest in Git? You use cryptographic sealing.

**Mozilla SOPS** allows you to encrypt the values of a YAML file using an AWS KMS key, while leaving the keys (structure) in plaintext. You commit the encrypted file to Git. 

```yaml
# encrypted-secret.yaml (Committed to Git)
apiVersion: v1
kind: Secret
metadata:
  name: slurmdbd-password
type: Opaque
stringData:
  # The value below is encrypted by AWS KMS. ArgoCD's SOPS plugin decrypts it in-memory.
  password: ENC[AES256_GCM,data:xyz123...,iv:abc...,tag:def...,type:str]
sops:
  kms:
    - arn: arn:aws:kms:us-east-1:1234567890:key/abcdef
```
ArgoCD pulls this file, uses the AWS KMS key (via an IAM role attached to the ArgoCD pod) to decrypt it, and applies it to the cluster as a native Kubernetes Secret.

---

## 15. Canary Deployments for Physical Infrastructure

Canary deployments are easy for web apps (route 1% of HTTP traffic to a new pod). They are extremely difficult for physical infrastructure (e.g., updating the OS on 500 GPUs).

### 15.1 The "Rings of Protection" Deployment Model

An infrastructure pipeline must deploy in blast-radius waves, halting completely if a wave fails health checks.

```mermaid
flowchart LR
    WAVE0["Wave 0: Staging\n(1 Node, Synthetic Workload)"]
    WAVE1["Wave 1: Canary\n(1 Rack / 4 Nodes)"]
    WAVE2["Wave 2: Early Adopters\n(20% of Fleet)"]
    WAVE3["Wave 3: Global\n(Remaining 80%)"]
    
    WAVE0 -->|Passes NCCL & DCGM| WAVE1
    WAVE1 -->|Runs small ML job for 4 hrs| WAVE2
    WAVE2 -->|No thermal/ECC errors| WAVE3
```

### 15.2 Implementing an Ansible Canary Pipeline

To execute a canary rollout of a driver update using Ansible in CI/CD:

```bash
# Step 1: Drain the Canary Nodes via Slurm
scontrol update NodeName=canary-[01-04] State=DRAIN Reason="Driver Update Canary"

# Step 2: Run Ansible limited to the canary group
ansible-playbook update-driver.yml --limit "canary_rack"

# Step 3: Run validation playbook
ansible-playbook validate-gpu-health.yml --limit "canary_rack"
# (If this exits non-zero, the CI pipeline halts and fails)

# Step 4: Resume nodes
scontrol update NodeName=canary-[01-04] State=RESUME

# Step 5: (Manual Approval Gate in CI/CD)

# Step 6: Rollout to the rest of the fleet in batches of 10
ansible-playbook update-driver.yml --limit "production_fleet" --forks 10 --serial 10
```

---

## 16. Further Advanced Troubleshooting Scenarios

### Scenario 4: The Silent Terraform State Corruption

**The Incident:** 
An engineer bypassed the CI pipeline and ran `terraform apply` locally using an older version of the Terraform binary (v1.3.0) against a state file that was previously upgraded by the CI pipeline to v1.7.0. The state file was corrupted, and the remote S3 backend rejected further updates due to lineage mismatches.

**Root Cause:**
Terraform state files track the `terraform_version` that last modified them. Downgrading versions against a remote state is unsupported and causes structural corruption in the JSON graph.

**Remediation:**
1. Enforce `required_version = "~> 1.7.0"` in the `terraform {}` block to prevent older binaries from executing.
2. Recover the state file from the S3 bucket's version history. Revert the object in S3 to the version immediately preceding the local corruption event.
3. Run `terraform force-unlock` if a lock is lingering.

### Scenario 5: Flux Reconciliation Hangs on Webhook Failures

**The Incident:**
A Flux Kustomization controller is stuck in a `ReconciliationFailed` state for an NVIDIA GPU Operator deployment. The Git repository is fully accessible, the YAML is valid, but the objects in the cluster are not updating.

**Root Cause:**
Kubernetes Validating or Mutating Webhooks (e.g., from an OPA Gatekeeper or a security mesh) are failing or unreachable. When Flux attempts a `ServerSideApply`, the Kubernetes API server forwards the request to the broken webhook, which times out, causing the entire Flux reconciliation loop to hang.

**Remediation:**
Identify broken webhooks using `kubectl get validatingwebhookconfigurations`. If a webhook backend pod is dead (e.g., a node crashed), temporarily delete the webhook configuration or fix the backend pod to unblock the API server, allowing Flux to resume synchronization.

---

## 17. Final Review and Mnemonic

When designing CI/CD for infrastructure, repeat the mnemonic: **L.P.P.A.C.V.**

*   **Lint:** Catch syntax fast.
*   **Plan:** Generate the evidence.
*   **Police:** Enforce blast-radius via OPA.
*   **Approve:** Human review of the exact plan artifact.
*   **Canary:** Test on real silicon.
*   **Validate:** Run telemetry diagnostics against a baseline.

## 18. Practice Scenarios

1.  **Design an Audit Mechanism for Emergency Overrides:** An emergency override flag bypasses OPA checks in your CI pipeline. How do you ensure it is audited and rare?
    *Answer focus:* The pipeline must still log the override to a SIEM (Splunk/Datadog), automatically create a Sev-2 incident ticket in Jira assigned to the Platform Lead, and require a post-hoc PR to back-fill policy justification.
2.  **A Golden-Image pipeline succeeds in building the image, but fails the isolated boot-test on `nccl-tests` bandwidth.** What does this tell you?
    *Answer focus:* The software compiled correctly against the kernel (successful build), but there is a physical hardware misconfiguration, an incorrect PCI topology assignment, or a missing GPU Direct RDMA driver preventing line-rate memory transfer. This failure prevented a massive production performance degradation.
3.  **Explain why storing `.terraform.lock.hcl` in Git is critical for CI/CD.**
    *Answer focus:* It guarantees that the exact provider binaries (and their cryptographic hashes) tested locally are the identical binaries downloaded and executed by the CI runner, preventing upstream supply chain attacks or unexpected provider breaking changes.
"""

with open(filepath, "a") as f:
    f.write(content)

print("Successfully appended content.")
