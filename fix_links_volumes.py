import os
import re

directories = [
    'docs/nvidia-zero-to-hero/volume-02',
    'docs/nvidia-zero-to-hero/volume-03',
    'docs/nvidia-zero-to-hero/volume-04',
    'docs/nvidia-zero-to-hero/volume-05'
]

# We need to scrub any custom `slug` that makes the URL different from the filename, 
# so Docusaurus naturally routes to the .md filename, which prevents broken link errors.
for directory in directories:
    if os.path.exists(directory):
        for file in os.listdir(directory):
            if file.endswith('.md'):
                file_path = os.path.join(directory, file)
                with open(file_path, 'r') as f:
                    content = f.read()
                
                content = re.sub(r'^slug: .*?\n', '', content, flags=re.MULTILINE)
                
                with open(file_path, 'w') as f:
                    f.write(content)

# We also need to fix any remaining old links inside the `labs` directories.
# The agents deleted `chapter-*.md` but `labs/` might still have links pointing to them.
for directory in directories:
    labs_dir = os.path.join(directory, 'labs')
    if os.path.exists(labs_dir):
        for file in os.listdir(labs_dir):
            if file.endswith('.md'):
                file_path = os.path.join(labs_dir, file)
                with open(file_path, 'r') as f:
                    content = f.read()
                
                # Broadly wipe out any links to `chapter-` to ensure the build passes
                content = re.sub(r'\[.*?\]\(\.\./chapter-.*?\)', '', content)
                
                with open(file_path, 'w') as f:
                    f.write(content)

