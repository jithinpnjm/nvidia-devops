import re
import glob

def remove_inner_frontmatter(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()
        
    in_frontmatter = False
    frontmatter_count = 0
    
    new_lines = []
    
    for line in lines:
        if line.strip() == '---':
            if not in_frontmatter:
                # Starting a frontmatter block
                frontmatter_count += 1
                if frontmatter_count == 1:
                    # Keep the first one
                    in_frontmatter = True
                    new_lines.append(line)
                else:
                    # Inner frontmatter block, skip it
                    in_frontmatter = True
            else:
                # Ending a frontmatter block
                if frontmatter_count == 1:
                    new_lines.append(line)
                in_frontmatter = False
        else:
            if not in_frontmatter or frontmatter_count == 1:
                new_lines.append(line)

    with open(filepath, 'w') as f:
        f.write("".join(new_lines))

for file in glob.glob('docs/volume-08/*.md') + glob.glob('docs/volume-09/*.md'):
    remove_inner_frontmatter(file)
