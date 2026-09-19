import os
import re

def clean_links(filepath):
    if not os.path.exists(filepath):
        return
    with open(filepath, 'r') as f:
        content = f.read()

    # Catch things like [Text](./labs/lab-01...) that break because labs don't exist
    content = re.sub(r'\[([^\]]+)\]\(\.\/labs\/lab-[^)]+\)', r'\1', content)
    content = re.sub(r'\[([^\]]+)\]\(\.\.\/labs\/lab-[^)]+\)', r'\1', content)

    # Some index.md pages link to missing labs directly
    # Just catch any link containing 'lab-' in the same line
    content = re.sub(r'\[([^\]]+)\]\(.*?lab-[^)]+\)', r'\1', content)
    
    # Catch any index links
    content = re.sub(r'\[([^\]]+)\]\(.*?/index\)', r'\1', content)
    content = re.sub(r'\[([^\]]+)\]\(.*?/index\.md\)', r'\1', content)

    # Remove any link containing 'chapter-'
    content = re.sub(r'\[([^\]]+)\]\(.*?chapter-[^)]+\)', r'\1', content)

    with open(filepath, 'w') as f:
        f.write(content)

base_dir = 'docs/nvidia-zero-to-hero'
for root, dirs, files in os.walk(base_dir):
    for file in files:
        if file.endswith('.md'):
            clean_links(os.path.join(root, file))

