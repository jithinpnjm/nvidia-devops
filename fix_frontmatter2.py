import glob
import re
import os

# Function to add missing frontmatter
def add_frontmatter(folder, vol_num):
    print(f"Fixing frontmatter in {folder}")
    for file in glob.glob(f'{folder}/chapter-*.md'):
        with open(file, 'r') as f:
            content = f.read()
            
        if not content.startswith('---'):
            # Extract the first heading as the title
            match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
            title = match.group(1) if match else "Untitled Chapter"
            
            # Create a simple frontmatter
            # Extract chapter number from filename e.g. chapter-01-foo.md -> 1
            ch_match = re.search(r'chapter-(\d+)', os.path.basename(file))
            position = int(ch_match.group(1)) if ch_match else 1
            
            frontmatter = f"""---
title: "{title}"
sidebar_position: {position}
---

"""
            with open(file, 'w') as f:
                f.write(frontmatter + content)
            print(f"Added frontmatter to {file}")

# Volume 21, 25 have missing frontmatter
for vol in [21, 25]:
    folder = f'docs/nvidia-zero-to-hero/volume-{vol:02d}'
    add_frontmatter(folder, vol)

