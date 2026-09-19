with open('docs/nvidia-zero-to-hero/volume-02/chapter-07-registers-shared-memory-and-local-memory.md', 'r') as f:
    content = f.read()

content = content.replace('- Previous: [Scheduling, Occupancy, and Instruction Dispatch](./chapter-06-scheduling-occupancy-and-instruction-dispatch.md)', '')

with open('docs/nvidia-zero-to-hero/volume-02/chapter-07-registers-shared-memory-and-local-memory.md', 'w') as f:
    f.write(content)
