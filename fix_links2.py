import os
import re

def replace_links(file_path):
    if not os.path.exists(file_path):
        return
    with open(file_path, 'r') as f:
        content = f.read()

    # The actual Docusaurus target is determined by the markdown file.
    # The build error said:
    # Broken link on source page path = /nvidia-devops/curriculum/nvidia-zero-to-hero/volume-01/chapter-01-what-is-ai-infrastructure:
    # -> linking to /nvidia-devops/curriculum/nvidia-zero-to-hero/volume-01/chapter-02-why-cpus-became-insufficient
    # But wait, my script renamed them earlier? No, I saved them as chapter-02-why-cpus-became-insufficient.md.
    # What's wrong is the markdown file has 'slug: /nvidia-zero-to-hero/volume-01/why-cpus-became-insufficient' inside it now!
    # Ah! I changed the `slug` in the frontmatter, so the physical file name `chapter-02-why-cpus-became-insufficient.md` no longer matches its Docusaurus route!
    # I should change the slugs back to match exactly what they were or update the links.
    # Easiest way: remove the custom `slug` frontmatter I added to chapters 2, 3, 4, 5, 6, so Docusaurus naturally routes them to their file name.

    content = re.sub(r'slug: ".*?/volume-01/.*?"\n', '', content)
    content = re.sub(r'slug: /nvidia-zero-to-hero/volume-01/.*?\n', '', content)
    
    with open(file_path, 'w') as f:
        f.write(content)

for chapter in os.listdir('docs/nvidia-zero-to-hero/volume-01'):
    if chapter.endswith('.md'):
        replace_links(f'docs/nvidia-zero-to-hero/volume-01/{chapter}')
