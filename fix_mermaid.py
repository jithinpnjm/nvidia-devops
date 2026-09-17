import re
import glob

for file in glob.glob('docs/volume-10/*.md'):
    with open(file, 'r') as f:
        content = f.read()

    # Replace <-->|text| with -- "text" ---
    new_content = re.sub(r'<-->\|([^|]+)\|', r'-- "\1" ---', content)
    
    with open(file, 'w') as f:
        f.write(new_content)
