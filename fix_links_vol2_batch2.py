import os
import re

directories = [
    'docs/nvidia-zero-to-hero/volume-02',
]

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

    labs_dir = os.path.join(directory, 'labs')
    if os.path.exists(labs_dir):
        for file in os.listdir(labs_dir):
            if file.endswith('.md'):
                file_path = os.path.join(labs_dir, file)
                with open(file_path, 'r') as f:
                    content = f.read()
                
                content = re.sub(r'\[.*?\]\(\.\./chapter-.*?\)', '', content)
                
                with open(file_path, 'w') as f:
                    f.write(content)
