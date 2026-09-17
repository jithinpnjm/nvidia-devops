import os

slugs = {
    'docs/volume-08/01-architecture-design-masterclass.md': '/volume-08/architecture-design-masterclass',
    'docs/volume-08/02-capacity-tco-masterclass.md': '/volume-08/capacity-tco-masterclass',
    'docs/volume-08/03-security-governance-masterclass.md': '/volume-08/security-governance-masterclass',
    'docs/volume-08/04-strategy-communication-masterclass.md': '/volume-08/strategy-communication-masterclass',
    'docs/volume-09/01-interview-framework-masterclass.md': '/volume-09/interview-framework-masterclass',
    'docs/volume-09/02-troubleshooting-scenarios-masterclass.md': '/volume-09/troubleshooting-scenarios-masterclass',
    'docs/volume-09/03-ai-architecture-and-design-masterclass.md': '/volume-09/ai-architecture-and-design-masterclass'
}

for filepath, slug in slugs.items():
    with open(filepath, 'r') as f:
        lines = f.readlines()
        
    has_slug = False
    for i, line in enumerate(lines):
        if line.startswith('slug:'):
            lines[i] = f'slug: "{slug}"\n'
            has_slug = True
            break
            
    if not has_slug:
        lines.insert(2, f'slug: "{slug}"\n')
        
    with open(filepath, 'w') as f:
        f.write("".join(lines))

