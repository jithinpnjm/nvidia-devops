import glob
import re

for file in glob.glob('docs/nvidia-zero-to-hero/volume-*/labs/*.md'):
    with open(file, 'r') as f:
        content = f.read()
    
    # We saw in the error log:
    # Exhaustive list of all broken links found:
    # - Broken link on source page path = /nvidia-devops/curriculum/nvidia-zero-to-hero/volume-10/labs/lab-01-inspect-a-kubernetes-gpu-node:
    #   -> linking to ../index (resolved as: /nvidia-devops/curriculum/nvidia-zero-to-hero/volume-10/index)
    
    # Let's see if we can find where it links to ../index. 
    # Wait, the markdown doesn't show `../index` in the `cat` output...
    # Let's search the actual file content for anything like index
