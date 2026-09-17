import glob
import re
from collections import Counter

for filepath in glob.glob('docs/**/*.md', recursive=True):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Split by double newline to get paragraphs
    paragraphs = content.split('\n\n')
    # Clean up paragraphs
    paragraphs = [p.strip() for p in paragraphs if len(p.strip()) > 100]
    
    # Count occurrences
    counts = Counter(paragraphs)
    
    repeated = [(p, c) for p, c in counts.items() if c >= 3]
    if repeated:
        print(f"\n--- Repetitions found in {filepath} ---")
        for p, c in repeated:
            print(f"Repeated {c} times: {p[:100]}...")

