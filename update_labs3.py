import re

with open('src/pages/labs.tsx', 'r') as f:
    content = f.read()

def enhance_starter(match):
    code = match.group(1)
    
    # Check if imports already exist
    has_typing = 'from typing import' in code
    if not has_typing and ('->' in code or ':' in code):
        code = "from typing import List, Dict, Tuple, Optional, Any, Union\n\n" + code
        
    return f"starter:`{code}`"

def enhance_solution(match):
    code = match.group(1)
    
    # Check if imports already exist
    has_typing = 'from typing import' in code
    if not has_typing:
        code = "from typing import List, Dict, Tuple, Optional, Any, Union\n\n" + code
        
    # We won't add if __name__ == '__main__' automatically unless we can parse the starter code
    # to grab the execution block. Let's just leave it with the imports for now as requested
    # "complete solution for each question starting from import"
    
    return f"solution:`{code}`"

content = re.sub(r'starter:`([^`]+)`', enhance_starter, content)
content = re.sub(r'solution:`([^`]+)`', enhance_solution, content)

with open('src/pages/labs.tsx', 'w') as f:
    f.write(content)
