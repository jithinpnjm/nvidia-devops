import os
import re

file_path = 'docs/nvidia-zero-to-hero/volume-01/labs/lab-02-trace-an-ai-request-path.md'

if os.path.exists(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # The new file names
    content = content.replace('../chapter-07-nvidia-ecosystem-overview', '../04-nvidia-ecosystem-overview')
    content = content.replace('../chapter-08-enterprise-ai-platforms', '../05-enterprise-ai-platforms')
    
    with open(file_path, 'w') as f:
        f.write(content)
