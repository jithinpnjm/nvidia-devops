import re

with open('docs/volume-02/00-python-fundamentals-for-infrastructure-masterclass.md', 'r') as f:
    content = f.read()

# We want to remove everything from the first "### Pattern 1: Operational Checklist" to the end of the file,
# OR just remove all these blocks.
# Let's find where the loop starts.
start_index = content.find('### Pattern 1: Operational Checklist')
if start_index != -1:
    print(f"Loop starts at character {start_index} out of {len(content)}")
    
    # Wait, there might be other legitimate text after this loop?
    # Let's check the very end of the file.
    
    # Actually, let's just use regex to strip out the repetitive blocks.
    # The block looks like:
    # ### Pattern X: Operational Checklist and Validation
    #
    # Before rolling out infrastructure changes related to Python configuration X, always ensure your requirements.txt is pinned and hashed to prevent supply-chain attacks. Rely on rigid test structures to evaluate system calls.
    # 
    # ```python
    # # Automated validation check for scenario X
    # def validate_scenario_X(config):
    #     assert config.is_valid(), "Configuration state failed validation"
    #     return True
    # ```
    
    # It might also just have a duplicate summary section at the end.
    
    pattern = r'### Pattern \d+: Operational Checklist and Validation.*?return True\n```\n'
    new_content = re.sub(pattern, '', content, flags=re.DOTALL)
    
    # Also clean up duplicate Summary sections
    pattern2 = r'## Summary and Further Reading.*'
    # We only want to keep the FIRST summary section.
    
    # Split by Summary
    parts = new_content.split('## Summary and Further Reading')
    if len(parts) > 2:
        # Keep the first part and the second part (which is the actual content of the first summary section)
        # But we need to clean up any trailing garbage
        first_summary = parts[1].split('### Pattern')[0].strip()
        new_content = parts[0] + '## Summary and Further Reading\n\n' + first_summary + '\n'
        
    with open('docs/volume-02/00-python-fundamentals-for-infrastructure-masterclass.md', 'w') as f:
        f.write(new_content)

