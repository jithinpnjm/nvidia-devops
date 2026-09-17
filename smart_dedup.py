import re
import glob

def clean_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Special handling for exact loops with incrementing numbers
    # 1. vGPU notes
    content = re.sub(
        r'(Extended vGPU operational note \d+:.*?)(?=Extended vGPU operational note \d+:|$)', 
        '', content, flags=re.DOTALL
    )
    # Restore one copy (we just deleted all of them)
    # Actually, a better regex is to find the repetitive pattern and replace it.
    
    # Let's do paragraph-level exact deduplication (ignoring minor number increments if possible)
    # Wait, the easiest way is to find large recurring blocks of text.
    
    # Split content into paragraphs
    paragraphs = content.split('\n\n')
    
    # We will keep track of seen paragraphs. But some have numbers like "Scenario 1", "Scenario 2" which makes them unique.
    # If a paragraph is > 50 chars, let's create a "signature" by stripping out all numbers.
    seen_signatures = set()
    cleaned_paragraphs = []
    
    for p in paragraphs:
        if len(p.strip()) < 50:
            cleaned_paragraphs.append(p)
            continue
            
        # Create a signature by removing numbers and non-alphanumeric chars
        sig = re.sub(r'[^a-zA-Z]', '', p).lower()
        
        if sig in seen_signatures:
            continue
            
        seen_signatures.add(sig)
        cleaned_paragraphs.append(p)

    new_content = '\n\n'.join(cleaned_paragraphs)
    
    if new_content != content:
        print(f"Cleaned {filepath}, length went from {len(content)} to {len(new_content)}")
        with open(filepath, 'w') as f:
            f.write(new_content)

for filepath in glob.glob('docs/**/*.md', recursive=True):
    clean_file(filepath)

