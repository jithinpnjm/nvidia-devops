import os

with open("/Users/jithinpjoseph/Documents/GitHub/nvidia-devops/docs/volume-10/06-slurm-administration-ha-accounting-and-upgrades.md", "r") as f:
    existing_content = f.read()

ansible_section = r"""
## 10. Infrastructure as Code: Deploying Slurm via Ansible

In a production NVIDIA AI Factory, deploying Slurm manually is a critical anti-pattern. Configuration drift between compute nodes will lead to instantaneous job failures, network partitions, and impossible-to-diagnose NUMA pinning errors.

The following is a comprehensive Ansible architecture for deploying the HA Slurm control plane, the database, and the compute nodes.

### 10.1 Inventory Structure

Your Ansible inventory must segment the database, controllers, and compute nodes, as they require distinct daemon installations and firewall rules.

```ini
# inventory/production/hosts.ini

[slurm_db]
slurmdb-01.aifactory.internal ansible_host=10.10.10.10

[slurm_controllers]
slurmctl-01.aifactory.internal ansible_host=10.10.10.11
slurmctl-02.aifactory.internal ansible_host=10.10.10.12

[slurm_compute]
dgx-h100-01.aifactory.internal ansible_host=10.10.20.101
dgx-h100-02.aifactory.internal ansible_host=10.10.20.102
dgx-h100-03.aifactory.internal ansible_host=10.10.20.103
dgx-h100-04.aifactory.internal ansible_host=10.10.20.104
# ... remaining 28 nodes ...

[slurm_cluster:children]
slurm_db
slurm_controllers
slurm_compute
```

### 10.2 The Core Playbook: Munge Authentication First

Before any Slurm daemons can communicate, the MUNGE cryptographic key must be absolutely identical across all hosts, and the UID/GID for `munge` and `slurm` users must match perfectly across the fleet.

```yaml
# playbooks/01-prerequisites.yaml
---
- name: Configure Base OS and Authentication
  hosts: slurm_cluster
  become: yes
  tasks:
    - name: Ensure chronological sync is absolutely precise
      ansible.builtin.package:
        name: chrony
        state: present
    
    - name: Ensure chronyd is running and enabled
      ansible.builtin.systemd:
        name: chronyd
        state: started
        enabled: yes

    - name: Create group for munge with specific GID
      ansible.builtin.group:
        name: munge
        gid: 990
        system: yes

    - name: Create user for munge with specific UID
      ansible.builtin.user:
        name: munge
        uid: 990
        group: munge
        system: yes
        create_home: no
        shell: /sbin/nologin

    - name: Create group for slurm with specific GID
      ansible.builtin.group:
        name: slurm
        gid: 991
        system: yes

    - name: Create user for slurm with specific UID
      ansible.builtin.user:
        name: slurm
        uid: 991
        group: slurm
        system: yes
        create_home: no
        shell: /sbin/nologin

    - name: Install Munge Package
      ansible.builtin.package:
        name: munge
        state: present

    - name: Distribute the singular Munge key
      ansible.builtin.copy:
        src: files/munge.key
        dest: /etc/munge/munge.key
        owner: munge
        group: munge
        mode: '0400'
      notify: Restart Munge

  handlers:
    - name: Restart Munge
      ansible.builtin.systemd:
        name: munge
        state: restarted
```

### 10.3 Deploying the Database Daemon (slurmdbd)

The database daemon requires connection strings to MariaDB and its own configuration file.

```yaml
# playbooks/02-database.yaml
---
- name: Configure Slurm Database Daemon
  hosts: slurm_db
  become: yes
  tasks:
    - name: Install slurm-slurmdbd package
      ansible.builtin.package:
        name: slurm-slurmdbd
        state: present

    - name: Deploy slurmdbd.conf
      ansible.builtin.template:
        src: templates/slurmdbd.conf.j2
        dest: /etc/slurm/slurmdbd.conf
        owner: slurm
        group: slurm
        mode: '0600'
      notify: Restart Slurmdbd

    - name: Ensure log directory exists
      ansible.builtin.file:
        path: /var/log/slurm
        state: directory
        owner: slurm
        group: slurm
        mode: '0755'

  handlers:
    - name: Restart Slurmdbd
      ansible.builtin.systemd:
        name: slurmdbd
        state: restarted
        enabled: yes
```

### 10.4 Deploying the HA Controllers

The active/passive controllers must mount the shared NFS spool directory to avoid split-brain state corruption.

```yaml
# playbooks/03-controllers.yaml
---
- name: Configure Slurm Controllers
  hosts: slurm_controllers
  become: yes
  tasks:
    - name: Install slurm-slurmctld package
      ansible.builtin.package:
        name: slurm-slurmctld
        state: present

    - name: Mount highly available NFS spool directory
      ansible.posix.mount:
        path: /var/spool/slurmctld_state
        src: "nfsserver.aifactory.internal:/export/slurm_state"
        fstype: nfs
        opts: rw,sync,hard,intr
        state: mounted

    - name: Ensure correct permissions on spool directory
      ansible.builtin.file:
        path: /var/spool/slurmctld_state
        state: directory
        owner: slurm
        group: slurm
        mode: '0755'

    - name: Deploy main slurm.conf
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
        enabled: yes
```

### 10.5 Deploying the Compute Nodes (slurmd)

Compute nodes require cgroup configurations and GRES (Generic Resource) topology maps to isolate GPUs correctly.

```yaml
# playbooks/04-compute.yaml
---
- name: Configure Slurm Compute Nodes
  hosts: slurm_compute
  become: yes
  tasks:
    - name: Install slurm-slurmd package
      ansible.builtin.package:
        name: slurm-slurmd
        state: present

    - name: Create local spool directory
      ansible.builtin.file:
        path: /var/spool/slurmd
        state: directory
        owner: root
        group: root
        mode: '0755'

    - name: Deploy main slurm.conf (MUST BE IDENTICAL TO CONTROLLERS)
      ansible.builtin.template:
        src: templates/slurm.conf.j2
        dest: /etc/slurm/slurm.conf
        owner: slurm
        group: slurm
        mode: '0644'
      notify: Restart Slurmd

    - name: Deploy cgroup.conf
      ansible.builtin.template:
        src: templates/cgroup.conf.j2
        dest: /etc/slurm/cgroup.conf
        owner: root
        group: root
        mode: '0644'
      notify: Restart Slurmd

    - name: Deploy gres.conf for GPU topology
      ansible.builtin.template:
        src: templates/gres.conf.j2
        dest: /etc/slurm/gres.conf
        owner: root
        group: root
        mode: '0644'
      notify: Restart Slurmd

  handlers:
    - name: Restart Slurmd
      ansible.builtin.systemd:
        name: slurmd
        state: restarted
        enabled: yes
```

## 11. Appendix: Slurm Log Analysis Mastery

When Slurm fails, it fails loudly in the logs. A Senior Solutions Architect must be able to read these logs like the Matrix. Here are actual production log snippets and their translations.

### 11.1 The "Node Flapping" Log
**Log Snippet (`/var/log/slurm/slurmctld.log`):**
```
slurmctld: error: Nodes dgx-h100-14 not responding
slurmctld: Node dgx-h100-14 now responding
slurmctld: error: Nodes dgx-h100-14 not responding
slurmctld: Node dgx-h100-14 now responding
```
**Architect Translation:** The controller is receiving heartbeats sporadically. This is almost never a Slurm issue. It is a network issue (dropped UDP packets on the management network), or the CPU on `dgx-h100-14` is 100% pegged, preventing `slurmd` from processing the RPC ping thread in time. Investigate OS load or switch buffers.

### 11.2 The "OOM Kill" Log
**Log Snippet (`/var/log/slurm/slurmd.log`):**
```
slurmd: error: Job 104543 stepd died with signal 9
slurmd: error: cgroup/v2: job_104543 memory limit exceeded.
```
**Architect Translation:** The user requested `--mem=100G` but their PyTorch dataloader attempted to allocate 150GB in RAM. The Linux kernel's Out-Of-Memory killer intervened and shot the `slurmstepd` process in the head. Slurm reports this as a signal 9. Instruct the user to request more memory or optimize their dataloader workers.

### 11.3 The "Bad RPC" Log
**Log Snippet (`/var/log/slurm/slurmd.log`):**
```
slurmd: error: Invalid RPC received 1024 from 10.10.10.11
slurmd: error: slurm_receive_msg: Zero Bytes were transmitted or received
```
**Architect Translation:** The controller (`10.10.10.11`) sent a command to the compute node, but the compute node didn't understand it. This happens strictly when you upgrade the compute node `slurmd` to a newer version than the controller `slurmctld`. Remember the golden rule: Compute nodes can be older than controllers, but NEVER newer. Roll back the compute node package.
"""

new_content = existing_content + ansible_section

file_path = "/Users/jithinpjoseph/Documents/GitHub/nvidia-devops/docs/volume-10/06-slurm-administration-ha-accounting-and-upgrades.md"

with open(file_path, "w") as f:
    f.write(new_content)

print(f"Successfully wrote {len(new_content.splitlines())} lines to {file_path}")
