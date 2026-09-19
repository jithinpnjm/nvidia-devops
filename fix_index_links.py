import glob
import re

for file in glob.glob('docs/nvidia-zero-to-hero/volume-*/*.md'):
    with open(file, 'r') as f:
        content = f.read()

    # We want to replace ../volume-XX/index with ../volume-XX/index.md
    # Look for /volume-\d+/index(?!\.md) and append .md
    new_content = re.sub(r'(\.\./volume-\d+/index)(?!\.md)', r'\1.md', content)
    
    # Also fix chapter links without .md
    new_content = re.sub(r'(\.\./volume-\d+/chapter-[0-9a-z-]+)(?!\.md)', r'\1.md', new_content)

    if content != new_content:
        with open(file, 'w') as f:
            f.write(new_content)
        print(f"Fixed links in {file}")

