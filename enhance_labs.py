import re

with open('src/pages/labs.tsx', 'r') as f:
    content = f.read()

def enhance_solution(match):
    prefix = match.group(1) # 'solution:`' or 'starter:`'
    code = match.group(2)
    
    # If the code already has imports, skip for now, except maybe to add if __name__ == '__main__'
    has_imports = 'import ' in code
    
    new_code = code
    
    # Add typing imports if not present
    if not has_imports and 'def ' in code:
        new_code = "from typing import List, Dict, Optional, Any, Tuple\n\n" + new_code

    return prefix + new_code + "`"

# This regex matches 'starter:`' or 'solution:`' followed by anything up to the next unescaped backtick.
# It uses a non-greedy match. We need to be careful about backticks inside the code, but usually they aren't used in Python except in docstrings or comments.
import ast

def process_js_object():
    pass

# Let's just do a simple replacement for now
content = re.sub(r'(solution:`)([^`]*)`', enhance_solution, content)
content = re.sub(r'(starter:`)([^`]*)`', enhance_solution, content)

with open('src/pages/labs_enhanced.tsx', 'w') as f:
    f.write(content)
