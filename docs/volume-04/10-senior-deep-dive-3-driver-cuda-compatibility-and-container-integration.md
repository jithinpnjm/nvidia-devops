---
title: "Senior Deep Dive 3 — Driver, CUDA compatibility and container integration"
slug: "senior-deep-dive-3-driver-cuda-compatibility-and-container-integration"
sidebar_position: 10
description: "Senior Deep Dive 3 — Driver, CUDA compatibility and container integration — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---
The NVIDIA kernel driver owns the device. User-space CUDA libraries and frameworks communicate through driver APIs. Containers normally bring user-space libraries but depend on a compatible host driver. The NVIDIA Container Toolkit configures the runtime so GPU devices and required driver libraries are made visible inside the container. This is why “CUDA works on the host” does not prove “the container can use the GPU”.

**Prove each boundary separately**

\# Host
nvidia-smi
modinfo nvidia | head
ls -l /dev/nvidia\*

# Runtime integration (commands depend on installation)
nvidia-ctk --version
find /var/run/cdi /etc/cdi -maxdepth 1 -type f 2>/dev/null

# Container smoke test
ctr -n k8s.io containers list | head
# or run a vendor-supported CUDA container through your normal runtime
