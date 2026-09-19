import os

file_path = 'docs/nvidia-zero-to-hero/volume-01/labs/lab-02-trace-an-ai-request-path.md'
with open(file_path, 'r') as f:
    content = f.read()

# I am just going to delete the links in the "Further Reading" of this old lab file that point to chapters I've renamed.
# This lab will likely be replaced anyway as part of the overall refactor, but we need the build green now.

content = content.replace("- [NVIDIA Ecosystem Overview](../04-nvidia-ecosystem-overview)", "")
content = content.replace("- [Enterprise AI Platforms](../05-enterprise-ai-platforms)", "")

with open(file_path, 'w') as f:
    f.write(content)
