import re
import glob

def dedup_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original_length = len(content)

    # 1. Clean exact duplicate lines that repeat more than twice consecutively
    lines = content.split('\n')
    new_lines = []
    prev_line = None
    repeat_count = 0
    
    for line in lines:
        if line == prev_line and line.strip() != '':
            repeat_count += 1
            # Allow up to 2 identical lines (e.g. ```\n``` or empty lines are ignored by stip() != '')
            if repeat_count < 2:
                new_lines.append(line)
        else:
            new_lines.append(line)
            prev_line = line
            repeat_count = 0
            
    content = '\n'.join(new_lines)
    
    # 2. Clean HTML comments used for padding
    content = re.sub(r'(<!-- Padding for layout compliance -->\n?)+', '', content)
    
    # 3. Clean "An additional point on systemic resilience:"
    content = re.sub(r'(An additional point on systemic resilience:\n?)+', '', content)

    # 4. Paragraph level deduplication
    paragraphs = content.split('\n\n')
    seen = set()
    deduped_paragraphs = []
    
    for p in paragraphs:
        if len(p.strip()) < 80:
            deduped_paragraphs.append(p)
            continue
            
        # We clean the paragraph to create a signature.
        # Remove numbers so that "Pattern 1:", "Pattern 2:" evaluate to the same signature
        sig = re.sub(r'[0-9]+', '', p.strip())
        # Remove non-alphanumeric chars
        sig = re.sub(r'[^a-zA-Z]', '', sig).lower()
        
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

