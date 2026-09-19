with open('docs/nvidia-zero-to-hero/volume-02/03-execution-performance-troubleshooting-masterclass.md', 'r') as f:
    content = f.read()

# Let's remove the math equation entirely and replace it with a text representation. MDX often struggles with \frac and {}
import re
content = re.sub(r'\$\$.*?\$\$', '*(AI = Total FLOPs / Total Bytes Transferred from HBM)*', content, flags=re.DOTALL)

with open('docs/nvidia-zero-to-hero/volume-02/03-execution-performance-troubleshooting-masterclass.md', 'w') as f:
    f.write(content)
