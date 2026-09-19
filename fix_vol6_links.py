import os
import re

filepath = 'docs/nvidia-zero-to-hero/volume-06/chapter-01-why-hgx-exists.md'
if os.path.exists(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # The error says it's pointing to `../volume-05/index` which doesn't exist anymore.
    # Let's remove the link
    content = re.sub(r'\[([^\]]+)\]\(\.\./volume-\d+/index(\.md)?\)', r'\1', content)
    
    with open(filepath, 'w') as f:
        f.write(content)

