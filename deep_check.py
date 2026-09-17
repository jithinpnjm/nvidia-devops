import glob
import re

for filepath in glob.glob('docs/**/*.md', recursive=True):
    with open(filepath, 'r') as f:
        content = f.read()
    
    lines = content.splitlines()
    if not lines:
        continue
        
    # Check for repetitive lines (more than 10 exact duplicate lines in a row or close by)
    # Actually, a better check is to see if any sequence of 5 lines repeats more than 3 times
    
    seqs = {}
    for i in range(len(lines) - 5):
        seq = "\n".join(lines[i:i+5])
        if len(seq.strip()) < 50:
            continue
        seqs[seq] = seqs.get(seq, 0) + 1
        
    for seq, count in seqs.items():
        if count >= 3:
            print(f"\n{filepath} has a 5-line block repeating {count} times.")
            print(f"Sample: {seq[:100]}...")
            break

