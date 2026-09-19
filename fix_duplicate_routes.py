import os
import glob
import re

for vol in range(17, 20):
    folder = f'docs/nvidia-zero-to-hero/volume-{vol:02d}'
    print(f"Checking {folder}")
    for file in glob.glob(f'{folder}/chapter-*.md'):
        with open(file, 'r') as f:
            content = f.read()
        
        # Look for duplicate slug frontmatter if it exists
        # We don't have slugs in the new files, so Docusaurus is probably complaining
        # because the old files had a specific slug mapped, and now the filenames match exactly
        # or there are lingering placeholder files. Let's check for placeholders.

    placeholders = glob.glob(f'{folder}/*placeholder*.md')
    if placeholders:
        for p in placeholders:
            print(f"Removing {p}")
            os.remove(p)
