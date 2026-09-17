part2 = """
---

## 12. Deep Dive: The Ansible Task Debugger

When Playbooks fail in complex ways—especially dynamically generated templating errors or complex JSON parsing—re-running the playbook repeatedly with `-vvvv` is painfully slow and pollutes logs. Ansible includes an interactive **Task Debugger** that allows you to pause execution upon failure and inspect the runtime state.

### 12.1 Enabling the Debugger
You can enable the debugger globally in `ansible.cfg` (`enable_task_debugger = True`), or per-task via the `debugger` keyword.

```yaml
- name: Extract GPU topology from JSON payload
  ansible.builtin.set_fact:
    gpu_topology: "{{ raw_topology_json | from_json | json_query('gpus[?memory_gb >= `80`]') }}"
  debugger: on_failed
```

### 12.2 Using the Interactive Debugger
If the JSON query above fails (e.g., `raw_topology_json` is missing the `gpus` key), Ansible halts and opens a REPL prompt instead of terminating:

```text
[Node: dgx-h100-01.ai-factory.internal]
[Task: Extract GPU topology from JSON payload]
[Error: dict object has no element gpus]
[debugger] > 
```

From this prompt, you can inspect and manipulate variables live:
*   `p raw_topology_json`: Prints the actual contents of the variable that caused the crash.
*   `task.args['gpu_topology'] = "{{ raw_topology_json | from_json }}"`: Redefine the task argument live to test a fix.
*   `r`: Rerun the task immediately with the modified arguments.
*   `c`: Continue execution (ignoring the failure).

This drastically reduces the feedback loop when writing complex data transformations.

---

## 13. Extending Ansible: Writing Custom Python Modules

While Ansible includes thousands of built-in modules, edge cases in AI infrastructure often require custom logic. For instance, interacting with the Base Command Manager (BCM) API or querying the InfiniBand Subnet Manager directly.

Writing a custom module is straightforward, as they are simply Python scripts that read JSON from `stdin` and write JSON to `stdout`.

### 13.1 Example: A Custom Module to Check NVLink Status

**File: `library/nvlink_status.py`**
```python
#!/usr/bin/python
from ansible.module_utils.basic import AnsibleModule
import subprocess
import json

def main():
    module = AnsibleModule(
        argument_spec=dict(
            expected_links=dict(type='int', required=True)
        )
    )
    
    expected = module.params['expected_links']
    
    try:
        # Execute nvidia-smi to query nvlink status
        result = subprocess.run(['nvidia-smi', 'nvlink', '-s'], capture_output=True, text=True)
        if result.returncode != 0:
            module.fail_json(msg="nvidia-smi nvlink command failed", stderr=result.stderr)
            
        # Simplistic parsing for demonstration
        active_links = result.stdout.count('Link is active')
        
        if active_links < expected:
            module.fail_json(msg=f"Degraded NVLink Fabric! Found {active_links} active links, expected {expected}.")
            
        module.exit_json(changed=False, active_links=active_links, msg="NVLink fabric is healthy.")
        
    except Exception as e:
        module.fail_json(msg=str(e))

if __name__ == '__main__':
    main()
```

### 13.2 Using the Custom Module

Place the file in a `library/` directory adjacent to your playbook. Ansible will automatically load it.

```yaml
- name: Verify NVLink Fabric Health Post-Driver Installation
  nvlink_status:
    expected_links: 18 # 18 NVLinks per H100 GPU
  register: nvlink_check
```

---

## 14. Architecture Debate: Push vs. Pull Model (Ansible-Pull)

### The Push Model (Standard)
By default, Ansible operates in a **Push Model**. The Control Node dictates execution, opening SSH connections out to the thousands of managed nodes.
*   **Pros:** Immediate execution, centralized logging, simple architectural topology. No agents to manage.
*   **Cons:** At scale (10,000+ nodes), the Control Node becomes a massive bottleneck. Maintaining thousands of simultaneous SSH connections requires extreme tuning (`forks=1000`) and massive Control Node compute resources.

### The Pull Model (`ansible-pull`)
For globally distributed edge computing or massive 10,000+ node footprints, the **Pull Model** is utilized. 
Instead of the Control Node pushing commands, each Managed Node runs a cron job executing `ansible-pull`. The node pulls a Git repository containing the playbooks and executes them locally against itself (`localhost`).

```bash
# Executed via cron on the managed node every 30 minutes:
$ ansible-pull -U https://github.com/my-org/ai-factory-ansible.git -i inventory/localhost.yml site.yml
```

*   **Pros:** Infinitely scalable. The execution load is distributed across the managed nodes themselves. No SSH bottlenecks.
*   **Cons:** Decentralized logging requires a robust ELK/Splunk aggregation pipeline. You lose the ability to easily orchestrate rolling updates (e.g., restarting exactly 10% of nodes at a time), because nodes are operating independently.

**AI Factory Recommendation:** Stick to the Push Model with highly tuned SSH pipelining up to ~2,000 nodes. Use Ansible Tower / AWX clustering if scaling further, as rolling updates are critical for Slurm orchestration.

---

## 15. Advanced AI Operations: Diagnostic Playbooks

Beyond configuration, Ansible is heavily used by SREs for fleet-wide diagnostics.

### 15.1 Fleet-Wide GPU Burn Stress Testing
Before handing over a cluster to data scientists, SREs must stress test the GPUs to isolate bad hardware (e.g., Xid errors, thermal throttling, ECC memory faults). 

```yaml
---
- name: Execute Fleet-Wide GPU Burn Stress Test
  hosts: gpu_workers
  become: true
  tasks:
    - name: Clone GPU-Burn repository
      ansible.builtin.git:
        repo: 'https://github.com/wilicc/gpu-burn.git'
        dest: /tmp/gpu-burn
        version: master

    - name: Compile GPU-Burn
      ansible.builtin.command: make
      args:
        chdir: /tmp/gpu-burn
      changed_when: false

    - name: Execute 30-minute GPU Stress Test
      ansible.builtin.command: ./gpu_burn 1800
      args:
        chdir: /tmp/gpu-burn
      register: gpu_burn_output
      async: 2000 # Let it run for ~33 minutes in the background
      poll: 60    # Check status every 60 seconds

    - name: Validate zero hardware errors occurred
      ansible.builtin.assert:
        that:
          - "'Faulty' not in gpu_burn_output.stdout"
          - "'Xid error' not in gpu_burn_output.stderr"
        fail_msg: "HARDWARE FAILURE DETECTED ON {{ inventory_hostname }}. Isolating node."
```

### 15.2 Automated NCCL All-Reduce Benchmarking

Ensuring the 3.2 Tbps InfiniBand fabric is functioning correctly requires running distributed NCCL (NVIDIA Collective Communication Library) tests across multiple nodes simultaneously.

```yaml
- name: Execute Distributed NCCL All-Reduce Test
  hosts: slurm_controllers[0] # Run only from the master node
  become: true
  tasks:
    - name: Generate hostfile for OpenMPI
      ansible.builtin.template:
        src: templates/mpi_hosts.j2
        dest: /tmp/mpi_hosts
    
    - name: Execute mpirun across the fabric
      ansible.builtin.command: >
        mpirun --hostfile /tmp/mpi_hosts
        -np {{ groups['gpu_workers'] | length * 8 }}
        --map-by ppr:8:node
        -x LD_LIBRARY_PATH=/usr/local/cuda/lib64
        -x NCCL_DEBUG=INFO
        -x NCCL_IB_HCA=mlx5
        /opt/nccl-tests/build/all_reduce_perf -b 8 -e 128M -f 2 -g 1
      register: nccl_results

    - name: Assert expected bandwidth
      ansible.builtin.assert:
        that:
          - "nccl_results.stdout | regex_search('Avg bus bandwidth.*([0-9]{3}\.[0-9]+)')"
        msg: "NCCL Bandwidth degraded below acceptable thresholds!"
```

---

## 16. Conclusion: The Immutable Goal

Ansible empowers the AI Infrastructure engineer to define the chaos of thousands of disparate Linux machines into a single, version-controlled repository of truth. By strictly separating Day-0 provisioning (Terraform) from Day-1 configuration (Ansible), and adhering rigorously to the principle of idempotency, you transition from reactive firefighting to deterministic, mathematical orchestration.
"""

with open("docs/volume-10/04-ansible-for-infrastructure-automation.md", "a") as f:
    f.write(part2)
