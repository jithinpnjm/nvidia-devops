import glob
import re
import os

for vol in range(17, 26):
    index_file = f'docs/nvidia-zero-to-hero/volume-{vol:02d}/index.md'
    if not os.path.exists(index_file):
        continue

    with open(index_file, 'r') as f:
        content = f.read()

    # Replace `./chapter-XX-something` with `./chapter-XX-something.md`
    # Also replace `./labs/lab-XX-placeholder` with `#` or just remove the link part
    
    # We want to use the actual filenames that exist in the directory
    folder = f'docs/nvidia-zero-to-hero/volume-{vol:02d}'
    actual_files = glob.glob(f'{folder}/chapter-*.md')
    
    # Create a mapping of chapter numbers to actual filenames
    chapter_map = {}
    for fpath in actual_files:
        basename = os.path.basename(fpath)
        match = re.search(r'chapter-(\d+)', basename)
        if match:
            chapter_num = int(match.group(1))
            chapter_map[chapter_num] = basename
    
    # Now replace the markdown links in the index file
    def replace_chapter_link(match):
        ch_num_str = match.group(1)
        ch_num = int(ch_num_str)
        if ch_num in chapter_map:
            return f"./{chapter_map[ch_num]}"
        return match.group(0)

    # regex to match [text](./chapter-XX-whatever)
    # wait, the regex needs to capture the chapter number
    new_content = re.sub(r'\./chapter-(\d+)[^\)]*', replace_chapter_link, content)
    
    # Also fix lab placeholder links by turning them into plain text
    new_content = re.sub(r'\[([^\]]+)\]\(\./labs/lab-\d+-placeholder\)', r'\1', new_content)

    if new_content != content:
        with open(index_file, 'w') as f:
            f.write(new_content)
        print(f"Fixed links in {index_file}")

