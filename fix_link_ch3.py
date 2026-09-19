with open('docs/nvidia-zero-to-hero/volume-02/chapter-03-threads-warps-blocks-and-sms.md', 'r') as f:
    content = f.read()

content = content.replace('- Next: [GPU Compute Architecture Masterclass](./01-gpu-compute-architecture-masterclass.md)', '- Next: [CUDA Cores and Tensor Cores](./chapter-04-cuda-cores-tensor-cores-and-rt-cores.md)')

with open('docs/nvidia-zero-to-hero/volume-02/chapter-03-threads-warps-blocks-and-sms.md', 'w') as f:
    f.write(content)
