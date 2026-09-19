import glob

for file in glob.glob('docs/nvidia-zero-to-hero/volume-*/labs/*.md'):
    with open(file, 'r') as f:
        content = f.read()
    
    # Replace broken links
    if '](../)' in content:
        new_content = content.replace('](../)', '](../index.md)')
        with open(file, 'w') as f:
            f.write(new_content)
        print(f"Fixed ../ link in {file}")

    if '../.md' in content:
        new_content = content.replace('../.md', '../index.md')
        with open(file, 'w') as f:
            f.write(new_content)
        print(f"Fixed ../.md link in {file}")

