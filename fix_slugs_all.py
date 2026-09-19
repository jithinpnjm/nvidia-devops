import glob
import re

for vol in range(21, 26):
    for fpath in glob.glob(f'docs/nvidia-zero-to-hero/volume-{vol:02d}/*.md'):
        with open(fpath, 'r') as f:
            content = f.read()
        
        # Look for slug in the frontmatter and remove it if it exists
        if 'slug:' in content:
            new_content = re.sub(r'^slug:.*$\n?', '', content, flags=re.MULTILINE)
            with open(fpath, 'w') as f:
                f.write(new_content)
            print(f"Removed slug from {fpath}")

