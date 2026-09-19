import os
import re

def clean_links(filepath):
    if not os.path.exists(filepath):
        return
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Just strip out markdown links that point to broken chapter paths 
    # (they were deleted and consolidated, so the old links are dead).
    # e.g. [text](../chapter-01...) -> text
    # Or just replace the target with an empty string or generic path if needed,
    # but removing the link syntax entirely is safer.
    
    # Matches [Some Text](../volume-02/chapter-10-...) and replaces with "Some Text"
    content = re.sub(r'\[([^\]]+)\]\(\.\./(volume-\d+/)?chapter-[^)]+\)', r'\1', content)
    
    # Matches [Some Text](./chapter-10-...) and replaces with "Some Text"
    content = re.sub(r'\[([^\]]+)\]\(\.\/chapter-[^)]+\)', r'\1', content)
    
    # Matches [Some Text](../index) and replaces with "Some Text"
    content = re.sub(r'\[([^\]]+)\]\(\.\./index(\.md)?\)', r'\1', content)
    content = re.sub(r'\[([^\]]+)\]\(\.\./volume-\d+/index(\.md)?\)', r'\1', content)
    
    # Clean up any residual broken links mentioned in the error
    content = re.sub(r'\[([^\]]+)\]\(\.\/labs/lab-[^)]+\)', r'\1', content)

    with open(filepath, 'w') as f:
        f.write(content)

# We must scan all volumes
base_dir = 'docs/nvidia-zero-to-hero'
for root, dirs, files in os.walk(base_dir):
    for file in files:
        if file.endswith('.md'):
            clean_links(os.path.join(root, file))

