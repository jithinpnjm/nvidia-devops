import os
import re

def clean_frontmatter(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Find the first frontmatter block
    # It starts at the beginning of the file `^---\n` and ends at the next `\n---\n`
    match = re.match(r'^---\n.*?\n---\n', content, re.DOTALL)
    if not match:
        return
    
    first_frontmatter = match.group(0)
    rest_of_content = content[match.end():]
    
    # Strip any remaining `---` blocks that look like frontmatter in the rest of the content
    # e.g., \n---\ntitle: ...\n---\n
    cleaned_rest = re.sub(r'\n---\n(title:|slug:|sidebar_position:|description:|source_document:).*?\n---\n', '\n\n', rest_of_content, flags=re.DOTALL)
    
    # Also catch cases where they might just be separated by `---` but not have all keys
    # Let's just specifically strip blocks that contain `slug:` or `sidebar_position:` if they are wrapped in `---`
    cleaned_rest = re.sub(r'\n---\n.*?(?:slug:|sidebar_position:).*?\n---\n', '\n\n', cleaned_rest, flags=re.DOTALL)

    new_content = first_frontmatter + cleaned_rest
    
    # Let's also enforce standard slug values
    # For vol 8/9, standard slug is /volume-xx/filename
    
    with open(filepath, 'w') as f:
        f.write(new_content)

import glob
for file in glob.glob('docs/volume-08/*.md') + glob.glob('docs/volume-09/*.md'):
    clean_frontmatter(file)
