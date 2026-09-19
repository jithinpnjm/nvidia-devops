import glob
import re

for file in glob.glob('docs/nvidia-zero-to-hero/volume-*/labs/*.md'):
    with open(file, 'r') as f:
        content = f.read()
    
    # Replace broken ../index links with correct relative links to the directory root
    if '../index' in content:
        new_content = content.replace('../index', '../')
        with open(file, 'w') as f:
            f.write(new_content)
        print(f"Fixed ../index link in {file}")

