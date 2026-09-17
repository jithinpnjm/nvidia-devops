import re
import glob

# 1. Clean the vGPU repeating notes
file1 = 'docs/volume-04/03-gpu-sharing-telemetry-masterclass.md'
with open(file1, 'r') as f:
    content = f.read()

# Replace all occurrences of the repeating note with a single paragraph
pattern1 = r'(Extended vGPU operational note \d+: When configuring SR-IOV for vGPU on modern architectures, ensure that the BIOS settings have SR-IOV enabled, VT-d/IOMMU enabled, and that the host OS kernel boots with `intel_iommu=on` or `amd_iommu=on`\. Without these IOMMU groups properly initialized, the VFIO driver cannot bind the virtual functions to the guests\.\n?)+'
replacement1 = r'**vGPU Operational Note:** When configuring SR-IOV for vGPU on modern architectures, ensure that the BIOS settings have SR-IOV enabled, VT-d/IOMMU enabled, and that the host OS kernel boots with `intel_iommu=on` or `amd_iommu=on`. Without these IOMMU groups properly initialized, the VFIO driver cannot bind the virtual functions to the guests.\n\n'
new_content1 = re.sub(pattern1, replacement1, content)

with open(file1, 'w') as f:
    f.write(new_content1)


# 2. Clean the repeating scenarios in k8s control plane
file2 = 'docs/volume-03/01-k8s-control-plane-scheduling-masterclass.md'
with open(file2, 'r') as f:
    content2 = f.read()

# Pattern matching "## XX. Advanced Production Scenario YY: Deep Systems Integration\n\n(Filler...)\n\n"
# Looking at the file to see the exact structure. Let's just strip everything after "## 10. Advanced Production Scenario 1"
# if it is just a copy-paste filler. Wait, let's first check what's inside file2.
