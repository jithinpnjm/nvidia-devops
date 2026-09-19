import os
import re

def clean_links(filepath):
    if not os.path.exists(filepath):
        return
    with open(filepath, 'r') as f:
        content = f.read()

    # Remove custom slugs that break relative routing
    content = re.sub(r'^slug: .*?\n', '', content, flags=re.MULTILINE)

    # Broad sweep for broken index and chapter references
    content = re.sub(r'\[([^\]]+)\]\(\.\./index(\.md)?\)', r'\1', content)
    content = re.sub(r'\[([^\]]+)\]\(\.\./volume-\d+/index(\.md)?\)', r'\1', content)
    content = re.sub(r'\[([^\]]+)\]\(\.\./chapter-[^)]+\)', r'\1', content)
    content = re.sub(r'\[([^\]]+)\]\(\.\/chapter-[^)]+\)', r'\1', content)

    with open(filepath, 'w') as f:
        f.write(content)

base_dir = 'docs/nvidia-zero-to-hero'
for root, dirs, files in os.walk(base_dir):
    for file in files:
        if file.endswith('.md'):
            clean_links(os.path.join(root, file))

