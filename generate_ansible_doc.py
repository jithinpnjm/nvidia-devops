import os

content = """---
title: "Chapter 4 - Ansible for Infrastructure Automation in AI Factories"
slug: "chapter-4-ansible-for-infrastructure-automation"
sidebar_position: 4
description: "Comprehensive beginner-to-advanced masterclass on Ansible for AI infrastructure: Idempotency, dynamic inventory, Jinja2, Roles, and configuring NVIDIA MOFED, DCGM, and Slurm."
---

# Chapter 4 — Ansible for Infrastructure Automation in AI Factories

**Learning outcome:** Architect, write, refactor, and safely operate production-grade Configuration Management using Ansible. You will master core Ansible primitives (Playbooks, Roles, Inventory, Handlers), execute complex control flows (`block/rescue`, asynchronous tasks, rolling updates), design dynamic inventories and Jinja2 templates, and deploy Day-1/Day-2 configuration for an NVIDIA AI Factory (MOFED drivers, NVIDIA DCGM telemetry, system-level tuning, and Slurm daemon configurations).

**Prerequisites:** Familiarity with Linux systems administration, SSH protocol, Python basics, YAML data structures, and basic infrastructure provisioning concepts.

**Difficulty:** Beginner to Advanced.

**Estimated reading time:** 120 minutes plus hands-on implementation practice.

---

## 1. Foundations: Configuration Management and Idempotency

In the modern NVIDIA AI Factory, infrastructure deployment is a two-phased approach. Day-0 operations (provisioning VPCs, Subnets, VMs, and Placement Groups) are handled by declarative Infrastructure as Code (IaC) tools like Terraform. However, Day-1 and Day-2 operations—configuring the internal state of those operating systems, installing complex dependency trees like Mellanox OFED (MOFED), configuring Slurm clusters, and managing NVIDIA drivers—require a robust **Configuration Management** system.

### The Problem with Bash Scripts at Scale

Historically, sysadmins relied on procedural Bash scripts pushed over SSH via `for` loops. This approach rapidly collapses in a 1,024-node SuperPOD environment:

1. **Lack of Idempotency:** A script that uses `echo "export PATH=$PATH:/usr/local/cuda/bin" >> ~/.bashrc` will append the line every single time the script runs, eventually corrupting the file.
2. **Error Handling Cascades:** If a package fails to download on node 432 out of 1,024, a raw Bash script often continues executing subsequent dependent steps, leaving the node in a corrupted, half-configured state.
3. **No Parallel Execution Graph:** Parallelizing shell scripts via `xargs` or `pdsh` makes capturing standard output, isolating failures, and performing rolling restarts (e.g., restarting 10% of the Slurm workers at a time) extremely complex.

### The Ansible Solution: Idempotent Desired State

Ansible is an open-source, agentless configuration management and automation engine. It operates on the principle of **idempotency**: the property that applying an operation multiple times has the same effect as applying it once.

Instead of writing a script that says *"run `apt-get install -y dcgm`"*, you declare a desired state:
> *"I declare that the package `datacenter-gpu-manager` must be present and in state `latest`."*

Ansible inspects the current state of the node. If the package is already installed and up to date, Ansible returns an `OK` status and does absolutely nothing. If it is missing, Ansible returns a `CHANGED` status and installs it. This allows operators to run Playbooks against a fleet continuously without fear of causing unintended mutations.

---

## 2. Ansible Architecture and Execution Model

Ansible distinguishes itself from older tools like Puppet or Chef by being radically simple and **agentless**. It does not require a proprietary daemon running on the managed nodes.

```mermaid
flowchart TD
    subgraph ControlNode["1. Control Node (Ansible Engine)"]
        CLI["ansible-playbook CLI"]
        INV["Inventory (Static / Dynamic)"]
        PLAY["Playbooks / Roles (YAML)"]
        MOD["Modules (Python snippets)"]
        
        CLI --> INV
        CLI --> PLAY
        CLI --> MOD
    end

    subgraph TransportLayer["2. Transport Layer"]
        SSH["SSH / Paramiko (Linux)"]
        WINRM["WinRM (Windows)"]
    end

    subgraph ManagedNodes["3. Managed Nodes (AI Factory)"]
        GPU1["GPU Worker Node 01
        - Python 3.x
        - sudo privileges"]
        GPU2["GPU Worker Node 02
        - Python 3.x
        - sudo privileges"]
        SLURM["Slurm Controller Node
        - Python 3.x
        - sudo privileges"]
    end

    ControlNode -->|Pushes compiled Python modules via| TransportLayer
    TransportLayer -->|Executes in memory & removes| ManagedNodes
```

### 2.1 The Control Node
The Control Node is the machine where Ansible is installed and run. It requires Python. This can be an administrator's laptop, a bastion host, or a CI/CD runner (like GitHub Actions or Jenkins). 

### 2.2 The Managed Nodes
The managed nodes are the target systems (e.g., AWS EC2 instances, bare-metal DGX systems). They only require two things:
1. An active **SSH service** (or WinRM for Windows).
2. A **Python interpreter** (Ansible modules are primarily written in Python).

### 2.3 The Execution Flow
1. Ansible reads the Inventory to determine which nodes to target.
2. It parses the Playbook YAML.
3. For each task, Ansible locates the required Module (e.g., `apt`, `copy`, `systemd`).
4. Ansible dynamically compiles a self-contained Python script containing the module code and the parameters specified in the Playbook.
5. Ansible opens an SSH connection to the managed node, transfers the Python payload to a temporary directory (e.g., `~/.ansible/tmp`), executes it using the node's Python interpreter, captures the JSON output, and deletes the temporary file.

---

## 3. Inventory Management: Static and Dynamic

The Inventory defines the hosts and groups of hosts upon which commands, modules, and tasks in a playbook operate.

### 3.1 Static Inventories (INI and YAML)

For small, static environments (e.g., a single on-premise rack), a static YAML or INI inventory is sufficient.

```yaml
# inventory/production.yml
all:
  children:
    # Group: Slurm Controllers
    slurm_controllers:
      hosts:
        ctrl-01.ai-factory.local:
        ctrl-02.ai-factory.local:
    # Group: GPU Workers
    gpu_workers:
      hosts:
        dgx-node-01.ai-factory.local:
        dgx-node-02.ai-factory.local:
        dgx-node-03.ai-factory.local:
        dgx-node-04.ai-factory.local:
  vars:
    # Variables applied to all hosts in the inventory
    ansible_user: "ansible_admin"
    ansible_ssh_private_key_file: "~/.ssh/id_ed25519_ansible"
    cluster_name: "prod-superpod-alpha"
```

### 3.2 Host Variables and Group Variables

Variables dictate how configurations differ across environments. Ansible maps variables intelligently based on folder structures: `group_vars/` and `host_vars/`.

```text
inventory/
├── production.yml
├── group_vars/
│   ├── all.yml                 # Vars for every host
│   ├── gpu_workers.yml         # Vars only for the gpu_workers group
│   └── slurm_controllers.yml   # Vars only for the controllers
└── host_vars/
    └── dgx-node-01.ai-factory.local.yml # Overrides for a specific host
```

Example `group_vars/gpu_workers.yml`:
```yaml
---
# Specific variables for GPU nodes
nv_driver_version: "535.104.05"
mofed_version: "23.10-0.5.5.0"
enable_dcgm_exporter: true
slurm_node_weight: 100
```

### 3.3 Dynamic Inventories in the Cloud

In cloud environments (AWS, Azure) or dynamic orchestrators, IPs and hostnames change rapidly as nodes are scaled or replaced. Static inventories become impossible to maintain.

Ansible solves this via **Dynamic Inventory Plugins**. These plugins query cloud APIs in real-time to build the inventory graph.

Example: AWS EC2 Dynamic Inventory (`inventory/aws_ec2.yml`)
```yaml
plugin: aws_ec2
regions:
  - us-east-1
  - us-west-2
filters:
  # Only fetch instances tagged with "Environment: Production"
  tag:Environment: Production
  instance-state-name: running
keyed_groups:
  # Automatically group instances by their 'Role' tag
  - key: tags.Role
    prefix: role
  # Group by instance type (e.g., group_p5_48xlarge)
  - key: instance_type
    prefix: type
compose:
  # Set the ansible_host variable to the private IP address
  ansible_host: private_ip_address
```

When you execute Ansible with this inventory, it builds dynamic groups on the fly (e.g., `role_slurm_worker`), allowing playbooks to target dynamically scaled GPU nodes seamlessly.

---

## 4. Playbook Mastery: Tasks, Modules, and Flow Control

Playbooks are Ansible’s configuration, deployment, and orchestration language. They describe policies you want your remote systems to enforce. 

### 4.1 The Playbook Anatomy

A Playbook contains one or more **Plays**. A Play maps a group of hosts to a list of **Tasks**. A Task invokes an Ansible **Module**.

```yaml
---
- name: Configure AI Factory Base OS and Dependencies
  hosts: all
  become: true # Execute tasks with sudo/root privileges
  gather_facts: true # Collect system info (OS version, IP addresses, CPU architecture)
  
  tasks:
    - name: Ensure chronological sync (Chrony) is installed
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

### 4.2 Error Handling: `block`, `rescue`, `always`

In large-scale AI operations, failures happen (e.g., NVIDIA driver repository is temporarily unavailable). Ansible's `block` syntax provides `try/catch/finally` mechanics.

```yaml
    - name: Safely install NVIDIA Drivers with automatic rollback
      block:
        - name: Install NVIDIA open kernel modules
          ansible.builtin.apt:
            name: "nvidia-driver-{{ nv_driver_version }}-open"
            state: present
        
        - name: Verify NVIDIA SMI executes successfully
          ansible.builtin.command: nvidia-smi -L
          register: smi_output
          changed_when: false

      rescue:
        - name: Alert monitoring system on driver failure
          ansible.builtin.uri:
            url: "https://monitoring.internal/api/alerts"
            method: POST
            body_format: json
            body:
              event: "Driver Install Failed on {{ inventory_hostname }}"
        
        - name: Halt execution on this node
          ansible.builtin.fail:
            msg: "NVIDIA driver installation failed. Node marked for investigation."
      
      always:
        - name: Upload installation logs to central storage
          ansible.builtin.fetch:
            src: /var/log/dpkg.log
            dest: /backups/logs/{{ inventory_hostname }}_dpkg.log
            flat: true
```

### 4.3 Looping and Iteration

To install multiple packages or create multiple users, use the `loop` keyword.

```yaml
    - name: Ensure required profiling tools are installed
      ansible.builtin.apt:
        name: "{{ item }}"
        state: present
      loop:
        - htop
        - sysstat
        - rdmacore
        - ibutils
        - infiniband-diags
```

### 4.4 Handlers: Triggering Services on Change

You do not want to restart the Slurm daemon every time Ansible runs. You only want to restart it *if* the configuration file was modified. **Handlers** listen for notifications from tasks.

```yaml
  tasks:
    - name: Deploy slurm.conf template
      ansible.builtin.template:
        src: templates/slurm.conf.j2
        dest: /etc/slurm/slurm.conf
        owner: slurm
        group: slurm
        mode: '0644'
      notify: Restart Slurmctld

  handlers:
    - name: Restart Slurmctld
      ansible.builtin.systemd:
        name: slurmctld
        state: restarted
```
If the template task results in `CHANGED`, it notifies the handler. Handlers run at the very end of the Playbook, ensuring the service is only restarted once, even if multiple tasks notified it.

---

## 5. Roles and Ansible Galaxy: Structuring for Scale

As Playbooks grow, writing monolithic files becomes unsustainable. **Roles** allow you to bundle automation content (tasks, handlers, variables, templates) into a standardized directory structure, promoting reusability and sharing across teams.

### 5.1 Standard Role Directory Structure

```text
roles/nvidia_dcgm/
├── tasks/
│   └── main.yml        # Main list of tasks for the role
├── handlers/
│   └── main.yml        # Handlers (e.g., restart dcgm-exporter)
├── templates/
│   └── dcgm.service.j2 # Jinja2 templates used by the role
├── files/
│   └── dcp-metrics.csv # Static files copied to target hosts
├── vars/
│   └── main.yml        # Immutable variables for the role
├── defaults/
│   └── main.yml        # Default variables (easily overridden by inventory)
└── meta/
    └── main.yml        # Role dependencies and metadata
```

### 5.2 Executing Roles in a Playbook

```yaml
---
- name: Provision AI Factory Node Stack
  hosts: gpu_workers
  become: true
  
  roles:
    - role: mofed_network_drivers
      tags: ['network', 'infiniband']
    - role: nvidia_gpu_drivers
      tags: ['gpu']
    - role: nvidia_dcgm
      tags: ['telemetry']
    - role: slurm_worker
      tags: ['orchestration']
```
Using **tags** allows you to execute subsets of your automation. Running `ansible-playbook site.yml --tags "telemetry"` will only execute the `nvidia_dcgm` role across the fleet.

---

## 6. Advanced Templating with Jinja2

Ansible utilizes the Jinja2 templating engine for generating dynamic configuration files based on variables and gathered facts. This is critical for generating files like `/etc/slurm/slurm.conf` which require logic and host-specific calculations.

### 6.1 Dynamic Variables and Filters

```jinja2
# templates/slurm.conf.j2
ClusterName={{ cluster_name | default('ai-cluster') | lower }}
SlurmctldHost={{ groups['slurm_controllers'][0] }}
SlurmUser=slurm
SlurmdUser=root
SlurmctldPort=6817
SlurmdPort=6818

# Generate node definitions dynamically from the inventory
{% for host in groups['gpu_workers'] %}
NodeName={{ host }} CPUs={{ hostvars[host]['ansible_processor_vcpus'] }} RealMemory={{ (hostvars[host]['ansible_memtotal_mb'] * 0.95) | int }} State=UNKNOWN
{% endশেষে %}

# Define Partitions
PartitionName=h100-batch Nodes={{ groups['gpu_workers'] | join(',') }} Default=YES MaxTime=INFINITE State=UP
```

### 6.2 Explanation of Jinja2 Mechanics
- `{{ variable }}`: Outputs the variable's value.
- `| default('ai-cluster')`: A filter that provides a fallback value if the variable is undefined.
- `| lower`: A filter converting the string to lowercase.
- `groups['gpu_workers']`: Accesses the list of hostnames in the inventory group.
- `hostvars[host]['ansible_processor_vcpus']`: Queries Ansible facts gathered from a specific host to determine exactly how many CPUs it has, dynamically configuring Slurm without hardcoding.
- `{% for ... %}`: A control structure block executing a loop inside the template.

---

## 7. End-to-End NVIDIA AI Factory Implementation

Deploying an AI Factory requires precise ordering. Mellanox OFED (MOFED) must be installed before NVIDIA drivers, which must be installed before DCGM telemetry and Slurm. 

Here is a comprehensive snippet of a role installing **Mellanox OFED** for RoCE/InfiniBand fabrics, highlighting advanced Ansible techniques.

### `roles/mofed/tasks/main.yml`

```yaml
---
- name: Determine OS distribution and version for MOFED
  ansible.builtin.set_fact:
    mofed_os: "{{ ansible_distribution | lower }}{{ ansible_distribution_version }}"

- name: Download MOFED ISO
  ansible.builtin.get_url:
    url: "https://content.mellanox.com/ofed/MLNX_OFED-{{ mofed_version }}/MLNX_OFED_LINUX-{{ mofed_version }}-{{ mofed_os }}-x86_64.iso"
    dest: "/tmp/MLNX_OFED.iso"
    mode: '0644'

- name: Create mount directory for ISO
  ansible.builtin.file:
    path: /mnt/mofed
    state: directory
    mode: '0755'

- name: Mount MOFED ISO
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
  # Asynchronous execution allows Ansible to not drop the SSH connection during long installs
  async: 3600
  poll: 60

- name: Unmount MOFED ISO
  ansible.posix.mount:
    path: /mnt/mofed
    state: unmounted

- name: Rebuild initial ramdisk (initramfs) to include new OFED modules
  ansible.builtin.command: update-initramfs -u -k all
  when: mofed_install_result.changed
  notify: Reboot Server

- name: Flush handlers to force reboot before continuing to NVIDIA driver
  ansible.builtin.meta: flush_handlers
```

### Handlers `roles/mofed/handlers/main.yml`

```yaml
---
- name: Reboot Server
  ansible.builtin.reboot:
    msg: "Rebooting to load newly installed MOFED kernel modules."
    reboot_timeout: 600
    pre_reboot_delay: 10
    post_reboot_delay: 30
```

### The Power of `flush_handlers` and `reboot`
In AI Infrastructure, replacing kernel networking stacks (MOFED) requires a reboot before compiling NVIDIA GPU drivers (which depend on ibcore). The `ansible.builtin.reboot` module safely reboots the node, waits for SSH to return, and then Ansible resumes the playbook seamlessly. `ansible.builtin.meta: flush_handlers` forces the reboot handler to execute immediately, rather than waiting for the end of the entire playbook.

---

## 8. Performance Tuning and Execution Strategies at Scale

By default, Ansible targets 5 hosts simultaneously. When operating a 1,024-node GPU cluster, deploying configurations 5 nodes at a time will take hours. You must tune Ansible for maximum throughput.

### 8.1 `ansible.cfg` Tuning

```ini
[defaults]
# Increase parallel execution from 5 to 50
forks = 50

# Disable fact gathering globally if playbooks don't need it (saves ~2-3 seconds per run)
gathering = smart

# Cache facts in a local JSON file so subsequent runs are faster
fact_caching = jsonfile
fact_caching_connection = /tmp/ansible_fact_cache
fact_caching_timeout = 86400

# Do not create .retry files
retry_files_enabled = False

[ssh_connection]
# Enable SSH Pipelining
# Instead of opening an SSH connection, copying the script, opening a second to run it, 
# and a third to clean up, Pipelining pipes the Python script directly to python via stdin.
# Requires 'requiretty' to be disabled in /etc/sudoers on managed nodes.
pipelining = True

# Multiplex SSH connections to keep the tunnel alive between tasks
ssh_args = -o ControlMaster=auto -o ControlPersist=60s -o PreferredAuthentications=publickey
```

### 8.2 Rolling Updates with `serial`

If you deploy an updated `slurm.conf` and restart the Slurmd daemon, you do not want to restart all 1,024 nodes simultaneously and crash the running AI workloads. Use the `serial` keyword to enforce a rolling update constraint.

```yaml
- name: Apply Slurm Configuration Update
  hosts: gpu_workers
  become: true
  # Update nodes in batches: first 1 node, then 10%, then 25% at a time
  serial:
    - 1
    - "10%"
    - "25%"
  
  # If more than 5% of nodes in the current batch fail, abort the entire playbook
  max_fail_percentage: 5
  
  tasks:
    - name: Update configuration
      ansible.builtin.template:
        src: slurm.conf.j2
        dest: /etc/slurm/slurm.conf
      notify: Restart Slurmd
```

---

## 9. Essential CLI & Lifecycle Command Reference

Mastering the CLI suite is essential for operations.

```bash
# 1. Syntax check without making connections
$ ansible-playbook site.yml --syntax-check

# 2. Dry-Run / Check Mode (Reports what WOULD change, without making mutations)
$ ansible-playbook site.yml --check --diff

# 3. Limit execution to a specific host or group
$ ansible-playbook site.yml --limit "dgx-node-01*"

# 4. Start execution at a specific task (useful for resuming a failed run)
$ ansible-playbook site.yml --start-at-task "Ensure Chrony service is enabled and running"

# 5. Ad-Hoc Command: Run a single shell command across the entire cluster instantly
# (Useful for querying GPU health across the fleet)
$ ansible gpu_workers -i inventory/aws_ec2.yml -m command -a "nvidia-smi -L" -b

# 6. Interactive Console Mode
$ ansible-console -i inventory/production.yml
ansible@production (gpu_workers)[f:50]$ command nvidia-smi
```

---

## 10. Senior SRE & Solutions Architect Troubleshooting Scenarios

### Scenario 1: The Infinite SSH Hang during Package Installation

**The Production Incident:**
An engineer runs an Ansible playbook to update `libc` and `systemd` across 256 Ubuntu GPU workers. The playbook stalls indefinitely at the `apt` task. No timeout occurs. The operator must manually `ctrl+c` the playbook.

**Root Cause Analysis:**
The `apt` upgrade triggered an interactive `dpkg` prompt (e.g., "The file /etc/ssh/sshd_config has been modified. Keep local version or replace?"). Because Ansible operates via non-interactive SSH, the `dpkg` prompt is waiting indefinitely for a user to press 'Y' or 'N' on a standard input that doesn't exist.

**Remediation and Prevention:**
Never run raw `apt upgrade` commands without enforcing non-interactive frontend environments. Use the dedicated Ansible module parameters, or if using `apt` directly, pass the DEBIAN_FRONTEND environment variable.

```yaml
# Correct way to handle APT
- name: Safely upgrade OS packages
  ansible.builtin.apt:
    upgrade: dist
    dpkg_options: 'force-confold,force-confdef' # Auto-answers 'keep old config'
  environment:
    DEBIAN_FRONTEND: noninteractive
```

---

### Scenario 2: Playbook Succeeded, but the Service is Not Running

**The Production Incident:**
An Ansible playbook executing `systemd` to start the `slurmctld` daemon returns a green `OK` status. The engineer assumes the deployment was successful. 5 minutes later, monitoring alerts fire because the Slurm controller is unreachable.

**Root Cause Analysis:**
The `systemd` module ensures the command `systemctl start slurmctld` is executed. It does *not* wait to see if the daemon crashes 3 seconds later due to a misconfigured `/etc/slurm/slurm.conf`. The daemon started, systemd returned exit code 0 to Ansible, and Ansible reported success. The daemon then panics and exits.

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
The `until`, `retries`, and `delay` directives force Ansible to loop the verification command, ensuring the daemon is actually up and serving requests before marking the node as successful.

---

### Scenario 3: The Secret Logging Leak Incident

**The Production Incident:**
A playbook provisions a local PostgreSQL database for Slurm accounting. The task uses the `command` module to execute `psql -U postgres -c "CREATE USER slurm WITH PASSWORD 'SuperSecret123!';"`. The playbook completes successfully. The next day, the security team flags that the raw, plaintext password was written into the centralized Ansible Tower execution logs, which are visible to hundreds of developers.

**Root Cause Analysis:**
Ansible logs the input arguments and output `stdout`/`stderr` of every task to the console by default. If a task contains a password, token, or private key, it will be exposed.

**Remediation Procedure:**
Use the `no_log: true` directive on any task handling sensitive data.

```yaml
- name: Create Slurm database user
  ansible.builtin.command:
    cmd: "psql -U postgres -c \"CREATE USER slurm WITH PASSWORD '{{ slurm_db_password }}';\""
  no_log: true # Prevents arguments and stdout from being logged to the console
```
Additionally, store the `slurm_db_password` securely using **Ansible Vault**, which encrypts variable files at rest in your Git repository.

```bash
# Encrypt the vars file
$ ansible-vault encrypt group_vars/all/secrets.yml

# Execute playbook providing the vault password
$ ansible-playbook site.yml --ask-vault-pass
```

---

## 11. Architectural Boundary: Terraform vs. Ansible

A critical design principle in AI Infrastructure is understanding the boundary between Infrastructure as Code (IaC - Terraform) and Configuration Management (Ansible).

*   **Terraform (The "Outside"):** Handles cloud and hypervisor APIs. It provisions the VPC, the Subnet, allocates the IP address, provisions the Elastic Block Store volume, and instantiates the virtual machine. Terraform is State-Aware (it knows if it created the VM).
*   **Ansible (The "Inside"):** Handles OS-level configuration. It formats the block storage volume with XFS, installs NVIDIA drivers, configures network routes, and writes application configuration files. Ansible is naturally stateless and relies on real-time node inspection.

**The Golden Rule:** Never use Terraform `remote-exec` provisioners to execute complex bash scripts or configure applications. Never use Ansible cloud modules (like `ec2_instance`) to provision the base AI Factory fabric. Let Terraform provision the raw iron and network, and hand over the inventory to Ansible for Day-1 configuration.
"""

with open("docs/volume-10/04-ansible-for-infrastructure-automation.md", "w") as f:
    f.write(content)
