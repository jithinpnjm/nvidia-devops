import re

with open('src/pages/architecture.tsx', 'r') as f:
    content = f.read()

# Replace the specific block where it SHOULD have closed
old = '<label className="notesLabel" htmlFor="architecture-notes">'
new = '''</div>
          </details>
          
          <label className="notesLabel" htmlFor="architecture-notes">'''

if "</div>\n          </details>" not in content:
    content = content.replace(old, new)

with open('src/pages/architecture.tsx', 'w') as f:
    f.write(content)

