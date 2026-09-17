import re
import glob

def dedup_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original_length = len(content)

    # Clean exact duplicate headings
    lines = content.split('\n')
    new_lines = []
    seen_headers = set()
    
    for line in lines:
        if line.startswith('#'):
            if line.strip() in seen_headers:
                continue
            seen_headers.add(line.strip())
        
        new_lines.append(line)
        
    content = '\n'.join(new_lines)
    
    # Run the same block-level signature logic but drop the length requirement for multi-line blocks
    paragraphs = content.split('\n\n')
    seen = set()
    deduped_paragraphs = []
    
    for p in paragraphs:
        if p.strip() == '':
            continue
            
        sig = re.sub(r'[0-9]+', '', p.strip())
        sig = re.sub(r'[^a-zA-Z]', '', sig).lower()
        
        # Only apply deduplication to things that actually have some letters in them
        if len(sig) > 20:
            if sig in seen:
                continue
            seen.add(sig)
            
        deduped_paragraphs.append(p)

    final_content = '\n\n'.join(deduped_paragraphs)
    
    if len(final_content) < original_length:
        print(f"Cleaned {filepath} (from {original_length} to {len(final_content)} chars)")
        with open(filepath, 'w') as f:
            f.write(final_content)

for filepath in glob.glob('docs/**/*.md', recursive=True):
    dedup_file(filepath)

