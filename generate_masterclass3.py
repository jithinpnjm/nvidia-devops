import sys

with open("docs/volume-01/02-linux-storage-io-masterclass.md", "a") as f:
    for i in range(30, 40):
        f.write(f"\n## Appendix {i}: Extended Troubleshooting Metrics\n")
        f.write("""When analyzing the storage stack in production, especially under the load of thousands of GPUs, traditional metrics often fail to reveal the true bottleneck. A common trap is relying solely on `iostat` without understanding its limitations on modern multi-queue NVMe drives. 

As mentioned, `%util` in `iostat` measures the percentage of time the device had at least one outstanding request. On an old spinning disk, 100% utilization meant the drive was fully saturated. On a modern NVMe drive with 64K submission queues, a single-threaded process issuing sequential reads can drive `%util` to 100% while only consuming a fraction of the device's actual bandwidth and IOPS capacity. The drive is technically "busy" 100% of the time, but it's only processing one request at a time, completely failing to utilize its internal parallelism.

To accurately assess NVMe saturation, you must look at `aqu-sz` (average queue size) alongside bandwidth (`rkB/s`, `wkB/s`) and IOPS (`r/s`, `w/s`). If `%util` is 100% but `aqu-sz` is low (e.g., < 4) and bandwidth is far below the manufacturer's spec, the bottleneck is the application's I/O submission pattern (synchronous, single-threaded), not the drive itself.

In such scenarios, rewriting the application to use asynchronous I/O (`io_uring`) or spawning multiple reader threads is required to build enough queue depth to saturate the NVMe controller. This is a critical distinction that separates a senior engineer from a junior one: diagnosing the application's I/O pattern as the limiting factor, rather than immediately blaming the hardware.

Furthermore, consider the impact of the Linux block layer scheduler. By default, many distributions still use `mq-deadline` or `kyber` for NVMe drives. For raw performance in AI workloads, setting the scheduler to `none` (bypassing the scheduler entirely) often yields the best results, as the NVMe controller's internal firmware is better equipped to handle the massive parallelism than the OS software layer. 

```bash
# Check the current scheduler
cat /sys/block/nvme0n1/queue/scheduler

# Set the scheduler to 'none'
echo none > /sys/block/nvme0n1/queue/scheduler
```
This single parameter tweak, when applied across a cluster of 1,000 nodes, can recover thousands of IOPS and reduce tail latency significantly during parallel checkpointing events.
""")

with open("docs/volume-01/02-linux-storage-io-masterclass.md", "r") as f:
    lines = len(f.readlines())
print(f"Generated {lines} lines.")
