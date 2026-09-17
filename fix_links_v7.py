import os

replacements = {
    "chapter-1-metrics-logs-and-traces-as-different-evidence": "metrics-logs-traces-masterclass"
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

