import re

with open('src/pages/labs.tsx', 'r') as f:
    content = f.read()

# We need to find objects that contain starter:`...` and solution:`...`
# Because backticks can span multiple lines, we'll use a regex that matches the whole object or just find them sequentially.
# It's safer to find all starter:`...` and solution:`...`
# Wait, let's just write a custom parser that reads the file, finds `starter:` and `solution:`.
# Since each lab is `{id:..., title:..., starter:..., expected:..., tests:..., hint:..., solution:..., explanation:...}`,
# they appear in order.

starters = []
solutions = []

def save_starter(m):
    starters.append(m.group(1))
    return m.group(0)

re.sub(r'starter:`([^`]+)`', save_starter, content)

def enhance_solution(match):
    idx = enhance_solution.counter
    enhance_solution.counter += 1
    
    sol_code = match.group(1)
    
    if idx < len(starters):
        start_code = starters[idx]
        
        # Extract execution lines from starter
        lines = start_code.split('\n')
        exec_lines = []
        for line in reversed(lines):
            # If line is part of a function or class definition, stop
            if line.startswith('def ') or line.startswith('class ') or line.startswith('async def ') or line.startswith('@'):
                break
            # If line is indented, it's inside a function, stop
            if line.startswith(' ') or line.startswith('\t'):
                break
            
            if line.strip() != '' and not line.strip().startswith('#'):
                exec_lines.insert(0, line)
                
        # Some starters have execution logic, e.g. print(...) or await ...
        if exec_lines:
            # Add them to solution
            # Be careful with async execution
            joined = '\n    '.join([l for l in exec_lines if l])
            if 'await ' in joined:
                exec_block = f"\n\nif __name__ == '__main__':\n    import asyncio\n    asyncio.run({exec_lines[-1].replace('await ', '')})"
            else:
                exec_block = "\n\nif __name__ == '__main__':\n    " + joined
                
            if exec_block not in sol_code:
                sol_code += exec_block

    return f"solution:`{sol_code}`"

enhance_solution.counter = 0

content = re.sub(r'solution:`([^`]+)`', enhance_solution, content)

with open('src/pages/labs.tsx', 'w') as f:
    f.write(content)
