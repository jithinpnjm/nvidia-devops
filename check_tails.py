import glob
import re

for file in glob.glob('docs/**/*.md', recursive=True):
    with open(file, 'r') as f:
        content = f.read()
    
    # Check for repetitive garbage at the bottom of the files
    # Often things like "Advanced Production Scenario" or "Pattern" or multiple "Summary" sections
    summary_count = content.lower().count('## summary and further reading')
    if summary_count > 1:
        print(f"{file} has {summary_count} 'Summary and Further Reading' sections")
        
    pattern_count = len(re.findall(r'Pattern \d+:', content))
    if pattern_count > 5:
        print(f"{file} has {pattern_count} 'Pattern X:' occurrences")
        
    scenario_count = len(re.findall(r'Scenario \d+:', content))
    if scenario_count > 10:
        print(f"{file} has {scenario_count} 'Scenario X:' occurrences")

