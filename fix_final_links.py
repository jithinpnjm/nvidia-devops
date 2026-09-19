import os
import re

filepath = 'docs/nvidia-zero-to-hero/volume-05/chapter-01-why-dgx-exists.md'
if os.path.exists(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # The error says it's pointing to `../volume-04/index` which I deleted in the AI generation
    # Let's just remove any `../volume-04/index` links to prevent build crashes.
    content = re.sub(r'\[([^\]]+)\]\(\.\./volume-\d+/index(\.md)?\)', r'\1', content)
    
    with open(filepath, 'w') as f:
        f.write(content)

