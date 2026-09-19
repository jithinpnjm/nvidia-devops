import os
import glob

# The old file interview-framework-masterclass is gone, the new one is 01-hardware-ecosystem-gauntlet.md
# We need to ensure that the anchor exists in 01-hardware-ecosystem-gauntlet.md
# OR we need to update all files linking to interview-framework-masterclass to link to 01-hardware-ecosystem-gauntlet.md

replacements = {
    "interview-framework-masterclass": "01-hardware-ecosystem-gauntlet"
}

def replace_in_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    modified = False
    for old, new in replacements.items():
        if old in content:
            content = content.replace(old, new)
            modified = True
            
    if modified:
        with open(filepath, 'w') as f:
            f.write(content)

for filepath in glob.glob('docs/**/*.md', recursive=True) + glob.glob('src/**/*.tsx', recursive=True):
    replace_in_file(filepath)

