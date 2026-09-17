import os
import re

files_to_fix = [
    'docs/volume-09/01-hardware-ecosystem-gauntlet.md',
    'docs/volume-09/02-k8s-virtualization-gauntlet.md',
    'docs/volume-09/03-training-nccl-gauntlet.md',
    'docs/volume-09/04-inference-mlops-gauntlet.md',
    'docs/volume-09/05-linux-networking-iac-gauntlet.md'
]

for filepath in files_to_fix:
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            lines = f.readlines()
        
        has_foundation = False
        for line in lines:
            if 'foundations-start-here-before-using-the-interview-question-bank' in line:
                has_foundation = True
                break
                
        if not has_foundation:
            # Inject it after frontmatter
            for i, line in enumerate(lines):
                if line.startswith('# '):
                    lines.insert(i+1, '\n## Foundations: start here before using the interview question bank {#foundations-start-here-before-using-the-interview-question-bank}\n')
                    break
            
            with open(filepath, 'w') as f:
                f.write("".join(lines))
