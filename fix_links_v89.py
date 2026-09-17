import os
import re

replacements = {
    "chapter-1-discovery-that-changes-the-architecture": "architecture-design-masterclass",
    "chapter-4-kubernetes-versus-slurm-decision-workshop": "capacity-tco-masterclass",
    "chapter-8-security-architecture-and-governance": "security-governance-masterclass",
    "chapter-9-migration-and-adoption-strategy": "strategy-communication-masterclass",
    
    "chapter-1-the-answer-framework-expose-your-reasoning": "interview-framework-masterclass",
    "chapter-3-linux-troubleshooting-questions": "troubleshooting-scenarios-masterclass",
    "chapter-6-ai-inference-architecture-questions": "ai-architecture-and-design-masterclass"
}

def replace_in_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    modified = False
    for old, new in replacements.items():
        if old in content:
            content = content.replace(old, new)
            modified = True
            
    if modified:
        with open(filepath, 'w') as f:
            f.write(content)

for root, _, files in os.walk('.'):
    if 'node_modules' in root or '.git' in root or 'build' in root:
        continue
    for file in files:
        if file.endswith('.md') or file.endswith('.tsx') or file.endswith('.ts'):
            replace_in_file(os.path.join(root, file))
