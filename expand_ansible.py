import textwrap

part1 = """---
title: "Chapter 4 - Ansible for Infrastructure Automation in AI Factories"
slug: "chapter-4-ansible-for-infrastructure-automation"
sidebar_position: 4
description: "Comprehensive beginner-to-advanced masterclass on Ansible for AI infrastructure: Idempotency, dynamic inventory, Jinja2, Roles, and configuring NVIDIA MOFED, DCGM, and Slurm."
---

# Chapter 4 — Ansible for Infrastructure Automation in AI Factories

**Learning outcome:** Architect, write, refactor, and safely operate production-grade Configuration Management using Ansible. You will master core Ansible primitives (Playbooks, Roles, Inventory, Handlers), execute complex control flows (`block/rescue`, asynchronous tasks, rolling updates), design dynamic inventories and Jinja2 templates, and deploy Day-1/Day-2 configuration for an NVIDIA AI Factory (MOFED drivers, NVIDIA DCGM telemetry, system-level tuning, and Slurm daemon configurations).

**Prerequisites:** Familiarity with Linux systems administration, SSH protocol, Python basics, YAML data structures, and basic infrastructure provisioning concepts.

**Difficulty:** Beginner to Advanced.

**Estimated reading time:** 180 minutes plus hands-on implementation practice.

---

## 1. Foundations: Configuration Management and the Principle of Idempotency

In the modern NVIDIA AI Factory, infrastructure deployment is a rigidly two-phased approach. Day-0 operations (provisioning VPCs, Subnets, bare-metal instances, and Placement Groups) are handled by declarative Infrastructure as Code (IaC) tools like Terraform. However, Day-1 and Day-2 operations—configuring the internal state of those operating systems, installing complex dependency trees like Mellanox OFED (MOFED), configuring Slurm clusters, managing NVIDIA drivers, and deploying telemetry agents—require a robust **Configuration Management** system.

### 1.1 The Collapse of Imperative Shell Scripting

Historically, systems administrators relied on procedural Bash scripts pushed over SSH via `for` loops, `xargs`, or parallel ssh tools (`pdsh`). This approach rapidly collapses in a distributed SuperPOD environment involving hundreds or thousands of nodes:

1. **Lack of Idempotency:** A script that executes `echo "export PATH=\$PATH:/usr/local/cuda/bin" >> ~/.bashrc` will append the string every single time the script runs. After ten runs, the user's PATH contains ten redundant entries, eventually hitting environment variable size limits or causing parse errors.
2. **Error Handling Cascades:** If a package fails to download on node 432 out of 1,024 due to a transient network timeout, a raw Bash script often continues executing subsequent dependent steps. The node is left in a corrupted, half-configured state, causing bizarre runtime errors during MPI communication.
3. **Absence of a Directed Acyclic Graph (DAG):** Parallelizing shell scripts makes capturing standard output, isolating failures, and performing rolling restarts (e.g., restarting 10% of the Slurm workers at a time to maintain job scheduling availability) extremely complex. Operators end up writing thousands of lines of fragile bash logic just to handle retries and locking.

### 1.2 The Ansible Solution: Idempotent Desired State

Ansible is an open-source, agentless configuration management and IT automation engine developed by Red Hat. It operates fundamentally on the mathematical and computational principle of **idempotency**: the property that applying an operation multiple times has exactly the same effect as applying it exactly once.

Instead of writing a script that commands the system *how* to do something (*"run `apt-get install -y dcgm`"*), you declare the *desired end state*:
> *"I declare that the package `datacenter-gpu-manager` must be present on the system and in state `latest`."*

When Ansible executes this task, it performs a state inspection:
1. It queries the target node's package manager.
2. If `datacenter-gpu-manager` is already installed and up to date, Ansible returns an `OK` status and **does absolutely nothing**. No network bandwidth is wasted downloading the package, and no apt locks are needlessly acquired.
3. If the package is missing or outdated, Ansible returns a `CHANGED` status and executes the necessary underlying commands to install it.

This idempotent nature allows AI infrastructure operators to run Playbooks against a production fleet continuously—every hour via cron, or triggered via CI/CD pipelines—without fear of causing unintended mutations or breaking running systems.

---

## 2. Ansible Architecture, Execution Model, and the Agentless Advantage

Ansible distinguishes itself from older Configuration Management tools like Puppet, Chef, or SaltStack by being radically simple and entirely **agentless**. It does not require a proprietary, high-privilege daemon running continuously on the managed nodes consuming memory or CPU cycles.

```mermaid
flowchart TD
    subgraph ControlNode["1. Control Node (Ansible Engine)"]
        CLI["ansible-playbook CLI"]
        INV["Inventory (Static / Dynamic)"]
        PLAY["Playbooks / Roles (YAML)"]
        MOD["Modules (Python snippets)"]
        VAULT["Ansible Vault (Encrypted Secrets)"]
        
        CLI --> INV
        CLI --> PLAY
        CLI --> MOD
        CLI --> VAULT
    end

    subgraph TransportLayer["2. Transport Layer"]
        SSH["SSH / Paramiko / Mitogen (Linux)"]
        WINRM["WinRM (Windows)"]
    end

    subgraph ManagedNodes["3. Managed AI Factory Nodes"]
        GPU1["GPU Worker Node 01 (H100)
        - Python 3.x
        - sudo privileges
        - Temporary /tmp/.ansible"]
        GPU2["GPU Worker Node 02 (H100)
        - Python 3.x
        - sudo privileges
        - Temporary /tmp/.ansible"]
        SLURM["Slurm Controller Node
        - Python 3.x
        - sudo privileges
        - Temporary /tmp/.ansible"]
    end

    ControlNode -->|Pushes compiled Python modules via| TransportLayer
    TransportLayer -->|Executes in memory & securely purges| ManagedNodes
```

### 2.1 The Control Node
The Control Node is the machine where the Ansible binary is installed and executed. It requires a Python environment. This can be an administrator's laptop, a highly secured bastion host, or an automated CI/CD runner (like GitHub Actions, GitLab CI, or Jenkins). 

### 2.2 The Managed Nodes
The managed nodes are the target systems (e.g., AWS EC2 P5 instances, bare-metal DGX SuperPOD nodes). They only require two prerequisites:
1. An active **SSH service** (or WinRM for Windows).
2. A **Python interpreter** (Ansible modules are almost exclusively written in Python).

### 2.3 The Execution Flow Deep Dive
Understanding exactly what Ansible does under the hood is critical for troubleshooting at scale:
1. **Parsing:** Ansible reads the Inventory to determine the target nodes and parses the YAML Playbook into memory.
2. **Module Selection:** For each task (e.g., configuring an interface with `ansible.builtin.template`), Ansible locates the required Python Module on the Control Node.
3. **Payload Generation:** Ansible dynamically constructs a self-contained Python script. This script combines the module's core logic with the specific parameters, variables, and Jinja2 templates evaluated for that specific target host.
4. **Transport:** Ansible opens an SSH connection to the managed node.
5. **Execution:** It transfers the Python payload to a temporary directory on the target (e.g., `~/.ansible/tmp`), executes it using the node's Python interpreter, captures the structured JSON output (stdout, stderr, exit codes, state changes), and immediately deletes the temporary file to maintain security hygiene.

---

## 3. Inventory Management: From Static Files to Dynamic Cloud Graphs

The Inventory is the foundational mapping that defines the hosts, IP addresses, and logical groups of hosts upon which your playbooks operate.

### 3.1 Static Inventories: INI and YAML Formats

For small, static environments—such as a single on-premise rack of DGX systems—a static YAML or INI inventory is sufficient. YAML is highly preferred in modern deployments due to its ability to handle complex nested variable structures naturally.

```yaml
# inventory/production.yml
---
all:
  children:
    # Top-Level Group: Slurm Management
    slurm_management:
      children:
        slurm_controllers:
          hosts:
            slurm-ctrl-01.ai-factory.internal:
              ansible_host: 10.100.2.10
            slurm-ctrl-02.ai-factory.internal:
              ansible_host: 10.100.2.11
        slurm_dbd:
          hosts:
            slurm-db-01.ai-factory.internal:
              ansible_host: 10.100.2.15

    # Top-Level Group: GPU Compute Fabric
    gpu_workers:
      children:
        h100_nodes:
          hosts:
            dgx-h100-01.ai-factory.internal:
              ansible_host: 10.100.1.100
            dgx-h100-02.ai-factory.internal:
              ansible_host: 10.100.1.101
        a100_nodes:
          hosts:
            dgx-a100-01.ai-factory.internal:
              ansible_host: 10.100.1.150

  vars:
    # Variables applied globally to every host in the inventory
    ansible_user: "ansible_admin"
    ansible_ssh_private_key_file: "~/.ssh/id_ed25519_ansible"
    cluster_name: "prod-superpod-alpha"
    ansible_python_interpreter: "/usr/bin/python3"
```

### 3.2 Structuring Variables: `group_vars` and `host_vars`

While you can embed variables directly in the inventory file, doing so creates massive, unreadable files. Ansible enforces a clean separation of configuration via directory structures: `group_vars/` and `host_vars/`. Ansible automatically merges these variables at runtime based on group membership.

```text
inventory/
├── production.yml
├── group_vars/
│   ├── all.yml                 # Vars applied to every host
│   ├── gpu_workers.yml         # Vars for all GPU nodes
│   ├── h100_nodes.yml          # Overrides specifically for H100s
│   └── slurm_controllers.yml   # Vars strictly for controllers
└── host_vars/
    └── dgx-h100-01.ai-factory.internal.yml # Granular overrides for one host
```

**Example `group_vars/h100_nodes.yml`:**
```yaml
---
# Specific variables targeting the H100 architecture
nv_driver_version: "535.154.05"
mofed_version: "23.10-0.5.5.0"
enable_dcgm_exporter: true
enable_nvsm: true
slurm_node_weight: 1000
gpu_architecture: "hopper"
nvlink_fabric_manager_enabled: true
```

### 3.3 Dynamic Inventories: Integrating with Cloud APIs

In cloud environments (AWS, Azure, Google Cloud) or Kubernetes/Nomad orchestrators, IP addresses and hostnames are ephemeral. Nodes are spun up and torn down continuously. Maintaining a static inventory file becomes impossible.

Ansible solves this via **Dynamic Inventory Plugins**. These plugins authenticate with cloud APIs, query the infrastructure in real-time, and dynamically construct the inventory graph based on metadata (like EC2 tags).

**Example: AWS EC2 Dynamic Inventory (`inventory/aws_ec2.yml`)**
```yaml
plugin: aws_ec2
regions:
  - us-east-1
  - us-west-2
filters:
  # Only fetch instances explicitly tagged for this AI cluster
  tag:ClusterName: prod-superpod-alpha
  # Only fetch instances that are currently running
  instance-state-name: running
keyed_groups:
  # Automatically group instances by their 'Role' tag
  # EC2 instances tagged with Role=slurm_worker become part of group `role_slurm_worker`
  - key: tags.Role
    prefix: role
  # Group by exact instance type
  # e.g., creates a group named `type_p5_48xlarge`
  - key: instance_type
    prefix: type
compose:
  # Map the connection IP to the private VPC address rather than public IPs
  ansible_host: private_ip_address
  # Map the instance ID as a variable for use in templates
  ec2_instance_id: instance_id
```

When executing Ansible, you simply point to the plugin file:
```bash
ansible-playbook -i inventory/aws_ec2.yml site.yml
```
Ansible makes the API call, builds the memory graph, and executes seamlessly.

---

## 4. Playbook Mastery: Tasks, Modules, and Advanced Flow Control

Playbooks are Ansible’s orchestration language. They describe the operational policies you want your remote systems to enforce. Written in YAML, they are designed to be human-readable, heavily commented, and easily reviewed in Pull Requests.

### 4.1 The Playbook Anatomy

A Playbook contains a list of **Plays**. A Play maps a specific group of hosts to a list of **Tasks**. A Task invokes a specific Ansible **Module**.

```yaml
---
- name: Phase 1 - Configure Base AI Factory OS and Networking
  hosts: all
  become: true # Execute all tasks with sudo/root privileges via privilege escalation
  gather_facts: true # Collect system info (OS version, IP addresses, CPU architecture)
  
  tasks:
    - name: Ensure chronological sync (Chrony) is installed for distributed logging
      ansible.builtin.apt:
        name: chrony
        state: present
        update_cache: true
      when: ansible_os_family == "Debian"

    - name: Ensure Chrony service is enabled and running
      ansible.builtin.systemd:
        name: chrony
        state: started
        enabled: true
```

### 4.2 Error Handling and Resiliency: `block`, `rescue`, `always`

In large-scale AI operations, failures are inevitable. Package repositories become temporarily unavailable, network links flap, or hardware faults trigger timeouts. A robust playbook must handle these gracefully rather than blindly halting.

Ansible provides `block`, `rescue`, and `always` constructs, mirroring the `try/catch/finally` mechanics found in standard programming languages.

```yaml
    - name: Safely install NVIDIA Drivers with automated fallback and alerting
      block:
        - name: Install NVIDIA open kernel modules
          ansible.builtin.apt:
            name: "nvidia-driver-{{ nv_driver_version }}-open"
            state: present
        
        - name: Verify NVIDIA System Management Interface (SMI) executes successfully
          ansible.builtin.command: nvidia-smi -L
          register: smi_output
          changed_when: false # Querying state doesn't change the system

      rescue:
        - name: Trigger PagerDuty / Slack alert on driver installation failure
          ansible.builtin.uri:
            url: "https://monitoring.internal/api/alerts/webhook"
            method: POST
            body_format: json
            body:
              event_type: "CRITICAL"
              message: "NVIDIA driver installation failed on {{ inventory_hostname }}. Node isolated."
        
        - name: Halt execution specifically on this node to prevent further corruption
          ansible.builtin.fail:
            msg: "NVIDIA driver installation failed. Node marked for investigation. Execution halted."
      
      always:
        - name: Upload APT installation logs to central S3/NFS storage for post-mortem
          ansible.builtin.fetch:
            src: /var/log/apt/term.log
            dest: /shared-nfs/diagnostics/{{ inventory_hostname }}_apt_term.log
            flat: true
```

### 4.3 Advanced Iteration: `loop` and `with_items`

To install multiple packages, create multiple user accounts, or configure multiple network interfaces, use the `loop` keyword. It dramatically reduces playbook verbosity.

```yaml
    - name: Ensure critical RDMA and InfiniBand profiling tools are installed
      ansible.builtin.apt:
        name: "{{ item }}"
        state: present
      loop:
        - htop
        - sysstat
        - rdmacore
        - ibutils
        - infiniband-diags
        - perftest
```

For complex iterations over dictionaries (e.g., creating users with specific attributes), you use dict2items or complex structures:

```yaml
    - name: Ensure AI team user accounts exist with correct groups
      ansible.builtin.user:
        name: "{{ item.key }}"
        group: "{{ item.value.primary_group }}"
        groups: "{{ item.value.secondary_groups | join(',') }}"
        shell: /bin/bash
      loop: "{{ ai_team_users | dict2items }}"
      vars:
        ai_team_users:
          alice:
            primary_group: developers
            secondary_groups: [docker, slurm]
          bob_sre:
            primary_group: ops
            secondary_groups: [sudo, docker, slurm]
```

### 4.4 Idempotent File Editing: `lineinfile` and `blockinfile`

Often, you need to tweak a single line in a large, pre-existing configuration file (e.g., `/etc/security/limits.conf` to increase locked memory limits for GPUDirect RDMA). `lineinfile` is perfect for this, using regular expressions to ensure the line is correct, without wiping out the rest of the file.

```yaml
    - name: Maximize locked memory limits for GPUDirect RDMA (Soft Limit)
      ansible.builtin.lineinfile:
        path: /etc/security/limits.conf
        regexp: '^\* soft memlock'
        line: '* soft memlock unlimited'
        state: present

    - name: Maximize locked memory limits for GPUDirect RDMA (Hard Limit)
      ansible.builtin.lineinfile:
        path: /etc/security/limits.conf
        regexp: '^\* hard memlock'
        line: '* hard memlock unlimited'
        state: present
```

### 4.5 Handlers: Triggering Service Restarts intelligently

You absolutely do not want to restart the Slurm daemon every time Ansible runs. You only want to restart it *if and only if* the configuration file was successfully modified. **Handlers** provide a pub-sub mechanism for tasks to trigger actions.

```yaml
  tasks:
    - name: Deploy dynamic slurm.conf template
      ansible.builtin.template:
        src: templates/slurm.conf.j2
        dest: /etc/slurm/slurm.conf
        owner: slurm
        group: slurm
        mode: '0644'
      notify: 
        - Restart Slurmctld
        - Trigger Configuration Validation

  handlers:
    - name: Restart Slurmctld
      ansible.builtin.systemd:
        name: slurmctld
        state: restarted

    - name: Trigger Configuration Validation
      ansible.builtin.command: scontrol reconfigure
```
If the `template` task evaluates that the destination file differs from the source template, it updates the file and returns `CHANGED`. Only then will it notify the handlers. Handlers queue up and execute exactly once at the very end of the Play, ensuring that even if five different tasks notify `Restart Slurmctld`, the daemon only bounces a single time.

---

## 5. Roles and Ansible Galaxy: Structuring for Scale and Reusability

As Playbooks grow from tens of lines to thousands, writing monolithic YAML files becomes unsustainable. **Roles** allow you to bundle automation content (tasks, handlers, variables, templates) into a standardized, modular directory structure. Roles promote reusability across different clusters and can be published to internal Git repositories or the public Ansible Galaxy.

### 5.1 Standard Role Directory Architecture

A well-architected role dedicated to configuring NVIDIA DCGM (Data Center GPU Manager) looks like this:

```text
roles/nvidia_dcgm/
├── tasks/
│   └── main.yml        # Main entrypoint: includes install.yml, configure.yml
│   └── install.yml     # Package installation logic
│   └── configure.yml   # Systemd and configuration logic
├── handlers/
│   └── main.yml        # Handlers (e.g., restart dcgm-exporter, nv-hostengine)
├── templates/
│   └── dcgm-exporter.service.j2 # Jinja2 templates for systemd
├── files/
│   └── dcp-metrics-custom.csv   # Static metric definition files copied to targets
├── vars/
│   └── main.yml        # Immutable, internal variables for the role
├── defaults/
│   └── main.yml        # Default variables (easily overridden by the user's inventory)
└── meta/
    └── main.yml        # Role dependencies (e.g., requires nvidia_gpu_drivers role first)
```

### 5.2 Executing Roles in a Site Playbook

The master playbook (often called `site.yml`) becomes a clean, readable orchestrator tying groups to roles:

```yaml
---
- name: Provision AI Factory Worker Nodes
  hosts: gpu_workers
  become: true
  
  roles:
    - role: mofed_network_drivers
      tags: ['network', 'infiniband', 'base']
    
    - role: nvidia_gpu_drivers
      tags: ['gpu', 'cuda']
    
    - role: nvidia_dcgm
      tags: ['telemetry', 'observability']
    
    - role: nvidia_fabric_manager
      tags: ['nvlink', 'gpu']
      
    - role: slurm_worker
      tags: ['orchestration', 'slurm']
```
Using **tags** allows you to surgically execute subsets of your automation. Running `ansible-playbook site.yml --tags "telemetry"` will bypass the lengthy MOFED and GPU driver installations and strictly update the DCGM configuration across the fleet in seconds.

---

## 6. Advanced Jinja2 Templating: The Brains of Configuration Management

Ansible utilizes the powerful Jinja2 templating engine (the same engine used in Python Flask) for generating dynamic configuration files. This is absolutely critical for files like `/etc/slurm/slurm.conf`, `/etc/hosts`, or `/etc/network/interfaces` which require complex logic, iterative loops, and host-specific mathematical calculations.

### 6.1 Building a Dynamic Slurm Configuration File

Slurm requires exhaustive knowledge of the cluster hardware to schedule jobs efficiently. Hardcoding these values is brittle. Jinja2 allows us to read Ansible's gathered facts and generate the exact hardware specification dynamically.

**Template File: `templates/slurm.conf.j2`**
```jinja2
# =============================================================================
# SLURM CONFIGURATION FILE - GENERATED BY ANSIBLE
# Cluster: {{ cluster_name | default('ai-factory-default') | upper }}
# =============================================================================
ClusterName={{ cluster_name | default('ai-factory-default') | lower }}
SlurmctldHost={{ groups['slurm_controllers'][0] }}
SlurmUser=slurm
SlurmdUser=root
SlurmctldPort=6817
SlurmdPort=6818
AuthType=auth/munge
CryptoType=crypto/munge
ProctrackType=proctrack/cgroup
TaskPlugin=task/cgroup,task/affinity

# =============================================================================
# NODE DEFINITIONS (Dynamically generated via Inventory Iteration)
# =============================================================================
{% for host in groups['gpu_workers'] | sort %}
# Calculate Safe Memory: Take total RAM in MB, subtract 10% for OS overhead
{% set safe_mem_mb = (hostvars[host]['ansible_memtotal_mb'] * 0.90) | int %}
# Extract exact CPU core counts from Ansible facts
{% set cpu_cores = hostvars[host]['ansible_processor_vcpus'] %}
# Define GPUs explicitly for Gres (Generic Resource Scheduling)
NodeName={{ host }} CPUs={{ cpu_cores }} RealMemory={{ safe_mem_mb }} Gres=gpu:8 State=UNKNOWN
{% endfor %}

# =============================================================================
# PARTITION DEFINITIONS
# =============================================================================
# Combine all GPU worker hostnames into a comma-separated list
PartitionName=h100-batch-training Nodes={{ groups['gpu_workers'] | join(',') }} Default=YES MaxTime=INFINITE State=UP OverSubscribe=EXCLUSIVE
```

### 6.2 Explanation of Jinja2 Mechanics
- `{{ variable }}`: Outputs the variable's value directly into the text file.
- `| default('ai-factory-default')`: A Jinja filter that provides a fallback value if the variable is completely undefined in the inventory.
- `| upper` / `| lower`: String manipulation filters.
- `groups['slurm_controllers'][0]`: Accesses the first hostname in the controller group list, establishing the primary master node.
- `{% for host in groups['gpu_workers'] | sort %}`: A control structure block executing a sorted loop over all GPU workers.
- `{% set safe_mem_mb = ... %}`: Declares a local variable inside the template for complex math calculations, preventing long inline formulas.
- `hostvars[host]['ansible_memtotal_mb']`: Queries the massive dictionary of system facts gathered by Ansible's `setup` module to determine exactly how much physical RAM the specific node has, dynamically configuring Slurm without hardcoding values that might differ between node generations.

---

## 7. NVIDIA AI Factory Operations: Real-World Implementation Roles

Deploying a multi-tenant AI Factory requires highly specific architectural ordering. **Mellanox OFED (MOFED)** must be installed first to load RDMA networking modules into the kernel. **NVIDIA GPU Drivers** are installed next, depending on the kernel headers. Finally, telemetry and scheduling layers like **DCGM**, **Fabric Manager**, and **Slurm** are configured.

Here is a comprehensive breakdown of the most critical playbook implementations.

### 7.1 Compiling and Deploying Mellanox OFED for RDMA/RoCE Fabrics

In AI Infrastructure, replacing the default kernel networking stacks with MOFED requires immense care.

**`roles/mofed/tasks/main.yml`**
```yaml
---
- name: Determine exact OS distribution string required for Mellanox binaries
  ansible.builtin.set_fact:
    mofed_os: "{{ ansible_distribution | lower }}{{ ansible_distribution_version }}"

- name: Download MOFED ISO from NVIDIA/Mellanox CDN
  ansible.builtin.get_url:
    url: "https://content.mellanox.com/ofed/MLNX_OFED-{{ mofed_version }}/MLNX_OFED_LINUX-{{ mofed_version }}-{{ mofed_os }}-x86_64.iso"
    dest: "/tmp/MLNX_OFED.iso"
    mode: '0644'
    checksum: "sha256:{{ mofed_iso_sha256 }}" # Cryptographic validation

- name: Create mount directory for ISO
  ansible.builtin.file:
    path: /mnt/mofed
    state: directory
    mode: '0755'

- name: Mount MOFED ISO to filesystem
  ansible.posix.mount:
    path: /mnt/mofed
    src: /tmp/MLNX_OFED.iso
    fstype: iso9660
    opts: loop
    state: mounted

- name: Execute MOFED Installation Script (Can take 15+ minutes)
  ansible.builtin.command:
    cmd: "/mnt/mofed/mlnxofedinstall --force --without-fw-update"
  register: mofed_install_result
  changed_when: "'Installation finished successfully' in mofed_install_result.stdout"
  # Asynchronous execution allows Ansible to not drop the SSH connection during long compiles
  async: 3600
  poll: 60

- name: Unmount MOFED ISO to clean up filesystem
  ansible.posix.mount:
    path: /mnt/mofed
    state: unmounted

- name: Rebuild initial ramdisk (initramfs) to prioritize new OFED modules on boot
  ansible.builtin.command: update-initramfs -u -k all
  when: mofed_install_result.changed
  notify: Reboot Server

- name: Flush handlers to force an immediate reboot before continuing to NVIDIA driver tasks
  ansible.builtin.meta: flush_handlers
```

**The Power of `flush_handlers` and `reboot`:**
Replacing networking stacks requires a full system restart to load the new kernel modules cleanly before compiling the NVIDIA drivers (which depend on `ibcore` for GPUDirect RDMA). The handler utilizes `ansible.builtin.reboot`:

```yaml
# roles/mofed/handlers/main.yml
---
- name: Reboot Server
  ansible.builtin.reboot:
    msg: "Ansible triggered reboot to load newly installed MOFED kernel modules."
    reboot_timeout: 900     # Wait up to 15 minutes for the server to return
    pre_reboot_delay: 10    # Give SSH connections time to close cleanly
    post_reboot_delay: 60   # Wait 60s after SSH returns before executing next tasks
```
Ansible gracefully reboots the node, polls the SSH port until it returns, and then seamlessly resumes the playbook.

### 7.2 Deploying NVIDIA DCGM and Fabric Manager

Once drivers are installed, telemetry and NVSwitch management are required.

```yaml
# roles/nvidia_telemetry/tasks/main.yml
---
- name: Ensure NVIDIA Fabric Manager is installed and locked to driver version
  ansible.builtin.apt:
    name: "nvidia-fabricmanager-{{ nv_driver_version.split('.')[0] }}"
    state: present

- name: Ensure Fabric Manager Service is active
  ansible.builtin.systemd:
    name: nvidia-fabricmanager
    state: started
    enabled: true

- name: Ensure DCGM is installed
  ansible.builtin.apt:
    name: datacenter-gpu-manager
    state: present

- name: Deploy custom Prometheus metrics mapping for DCGM Exporter
  ansible.builtin.copy:
    src: files/dcp-metrics-custom.csv
    dest: /etc/dcgm-exporter/dcp-metrics-custom.csv
    owner: root
    group: root
    mode: '0644'
  notify: Restart DCGM Exporter

- name: Enable DCGM Hostengine Systemd Service
  ansible.builtin.systemd:
    name: nvidia-dcgm
    state: started
    enabled: true
```

---

## 8. Managing Secrets: Ansible Vault

Configuration files frequently require sensitive material: Slurm Munge keys, database passwords for SlurmDBD, or internal registry pull secrets. Storing these in plaintext in a Git repository violates every security compliance standard.

**Ansible Vault** provides native, transparent encryption using AES-256 to encrypt variables, files, or entire YAML dictionaries at rest.

### 8.1 Encrypting Secrets

1. Create a variable file: `group_vars/all/secrets.yml`.
2. Add your sensitive data:
   ```yaml
   slurm_dbd_password: "SuperComplexPassword123!"
   munge_key_base64: "c29tZXN1cGVyc2VjcmV0a2V5ZGF0YQ=="
   ```
3. Encrypt the file using the CLI:
   ```bash
   ansible-vault encrypt group_vars/all/secrets.yml
   ```
   Ansible prompts for a password. The file is rewritten into an encrypted cipher block.

### 8.2 Executing Playbooks with Vault

When executing the playbook, you must provide the decryption password so Ansible can decrypt the file in memory on the Control Node before templating.

```bash
# Prompt interactively for the password
ansible-playbook site.yml --ask-vault-pass

# Or, use a secured password file stored securely on the CI/CD runner
ansible-playbook site.yml --vault-password-file ~/.ansible/vault_pass.txt
```

---

## 9. Tuning Execution Strategies for Scale: Pipelining and Mitogen

By default, Ansible attempts to be extremely compatible, prioritizing legacy SSH behaviors over speed. It targets 5 hosts simultaneously. When operating a 1,024-node GPU cluster, deploying configurations 5 nodes at a time will literally take hours. You must tune Ansible for maximum parallel throughput.

### 9.1 `ansible.cfg` Performance Tuning

```ini
[defaults]
# Increase parallel execution forks from 5 to 100
forks = 100

# Disable fact gathering globally if playbooks don't need facts, saving ~3-5 seconds per run
gathering = smart

# Cache facts in a local JSON file so subsequent runs don't re-query the hardware
fact_caching = jsonfile
fact_caching_connection = /tmp/ansible_fact_cache
fact_caching_timeout = 86400

# Do not create annoying .retry files on disk
retry_files_enabled = False

[ssh_connection]
# ENABLE SSH PIPELINING (CRITICAL FOR PERFORMANCE)
# Default behavior: Open SSH, copy Python file, close SSH. Open SSH, run file, close SSH.
# Pipelining: Opens a single SSH tunnel and pipes the Python script directly to python via stdin.
# *Requires 'requiretty' to be disabled in /etc/sudoers on managed nodes.*
pipelining = True

# Multiplex SSH connections to keep the tunnel alive between tasks
ssh_args = -o ControlMaster=auto -o ControlPersist=600s -o PreferredAuthentications=publickey
```

### 9.2 Rolling Updates and Blast Radius Control: `serial`

If you deploy an updated `slurm.conf` and restart the Slurmd daemon, you absolutely do not want to restart all 1,024 nodes simultaneously, which would abruptly crash running AI training jobs across the entire datacenter. Use the `serial` keyword to enforce a rolling update constraint.

```yaml
- name: Apply Critical Slurm Configuration Update
  hosts: gpu_workers
  become: true
  
  # Update nodes in batches: first 1 node (canary), then 10% of fleet, then 25% at a time
  serial:
    - 1
    - "10%"
    - "25%"
  
  # If more than 5% of nodes in the current batch fail, abort the entire playbook globally
  max_fail_percentage: 5
  
  tasks:
    - name: Update configuration
      ansible.builtin.template:
        src: slurm.conf.j2
        dest: /etc/slurm/slurm.conf
      notify: Restart Slurmd
```

---

## 10. Essential CLI & Lifecycle Command Reference

Mastering the CLI suite is essential for day-to-day operations and incident response.

```bash
# 1. Syntax check without making any network connections
$ ansible-playbook site.yml --syntax-check

# 2. Dry-Run / Check Mode (Reports what WOULD change, without making mutations)
$ ansible-playbook site.yml --check --diff

# 3. Limit execution to a specific host or group of hosts
$ ansible-playbook site.yml --limit "dgx-h100-01*"

# 4. Start execution at a specific task (useful for resuming a failed run halfway through)
$ ansible-playbook site.yml --start-at-task "Ensure Chrony service is enabled and running"

# 5. Ad-Hoc Command: Run a single shell command across the entire cluster instantly
# (Extremely useful for querying GPU health across the fleet during an incident)
$ ansible gpu_workers -i inventory/aws_ec2.yml -m command -a "nvidia-smi -L" -b

# 6. Maximum Debugging Output (Shows exact SSH connection details and JSON payloads)
$ ansible-playbook site.yml -vvvv
```

---

## 11. Senior SRE & Solutions Architect Troubleshooting Scenarios

### Scenario 1: The Infinite SSH Hang during Package Installation

**The Production Incident:**
An engineer runs an Ansible playbook to update `libc` and `systemd` across 256 Ubuntu GPU workers. The playbook stalls indefinitely at the `apt` task. No timeout occurs. After 45 minutes, the operator must manually `ctrl+c` the playbook.

**Root Cause Analysis:**
The `apt` upgrade triggered an interactive `dpkg` prompt (e.g., *"The file /etc/ssh/sshd_config has been modified. Keep local version or replace?"*). Because Ansible operates via non-interactive SSH with no TTY, the `dpkg` prompt is waiting indefinitely for a user to press 'Y' or 'N' on a standard input that doesn't exist.

**Remediation and Prevention:**
Never run raw `apt upgrade` commands without enforcing non-interactive frontend environments. Use the dedicated Ansible module parameters, or if using `apt` directly, inject the `DEBIAN_FRONTEND` environment variable.

```yaml
# Correct way to handle APT upgrades safely in automation
- name: Safely upgrade OS packages globally
  ansible.builtin.apt:
    upgrade: dist
    dpkg_options: 'force-confold,force-confdef' # Auto-answers 'keep old config'
  environment:
    DEBIAN_FRONTEND: noninteractive
```

---

### Scenario 2: Playbook Succeeded, but the Service is Dead

**The Production Incident:**
An Ansible playbook executing `systemd` to start the `slurmctld` daemon returns a green `OK` status. The engineer assumes the deployment was successful and closes the ticket. 5 minutes later, monitoring alerts fire because the Slurm controller API is unreachable.

**Root Cause Analysis:**
The `systemd` module ensures the command `systemctl start slurmctld` is executed. It does *not* wait to see if the daemon crashes 3 seconds later due to a syntax error in the newly deployed `/etc/slurm/slurm.conf`. The daemon started, systemd returned exit code 0 to Ansible, and Ansible immediately reported success. The daemon then panicked and exited.

**Remediation Procedure:**
Do not blindly trust that a service start equates to application health. Implement a verification step immediately after starting critical services.

```yaml
- name: Restart Slurmctld
  ansible.builtin.systemd:
    name: slurmctld
    state: restarted

- name: Verify Slurm controller API is responding locally
  ansible.builtin.command: sinfo
  register: sinfo_check
  retries: 5
  delay: 5
  until: sinfo_check.rc == 0
  changed_when: false
```
The `until`, `retries`, and `delay` directives force Ansible to execute a `while` loop on the verification command, ensuring the daemon is actually up and serving requests before marking the node as successfully deployed.

---

### Scenario 3: The Secret Logging Leak Incident

**The Production Incident:**
A playbook provisions a local PostgreSQL database for Slurm accounting. The task uses the `command` module to execute `psql -U postgres -c "CREATE USER slurm WITH PASSWORD 'SuperSecret123!';"`. The playbook completes successfully. The next day, the security team flags that the raw, plaintext password was written into the centralized Ansible Tower execution logs, which are visible to hundreds of developers.

**Root Cause Analysis:**
Ansible logs the input arguments and output `stdout`/`stderr` of *every single task* to the console by default. If a task contains a password, token, or private key, it will be exposed.

**Remediation Procedure:**
Use the `no_log: true` directive on any task handling sensitive data. This forces Ansible to redact the task's output from the console and log files.

```yaml
- name: Create Slurm database user
  ansible.builtin.command:
    cmd: "psql -U postgres -c \"CREATE USER slurm WITH PASSWORD '{{ slurm_db_password }}';\""
  no_log: true # Strictly prevents arguments and stdout from being logged to the console
```

---

### Scenario 4: Resolving Variable Precedence Nightmares

**The Production Incident:**
An engineer updates `group_vars/all.yml` to change the `nv_driver_version` to `535.154.05` for the entire fleet. They run the playbook, but notice that node `dgx-h100-02` mysteriously installed the older `525.85.12` driver instead.

**Root Cause Analysis:**
Ansible has a very strict Variable Precedence hierarchy (over 22 levels deep). Variables defined in `host_vars` override `group_vars`. Variables defined via the CLI (`-e`) override everything. In this case, another engineer had previously created `host_vars/dgx-h100-02.yml` and hardcoded the old driver version for a temporary debugging session, forgetting to delete it. That host-specific variable overrode the global group variable.

**Remediation Procedure:**
1. Use `ansible-inventory` CLI to debug the final variable state for a specific host:
   ```bash
   ansible-inventory -i inventory/production.yml --host dgx-h100-02
   ```
2. Remove the stale file in `host_vars`. Establish a team policy that `host_vars` should be used exceptionally sparingly, preferring logic in `group_vars` to maintain predictable behavior across fleets.
"""

with open("docs/volume-10/04-ansible-for-infrastructure-automation.md", "w") as f:
    f.write(part1)

