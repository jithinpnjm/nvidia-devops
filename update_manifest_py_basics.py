import json

with open('content-manifest.json', 'r') as f:
    manifest = json.load(f)

# Find Volume 2 source and insert the new file
for source in manifest['sources']:
    if 'Volume_02' in source['file']:
        source['generatedFiles'].insert(0, {
            'file': 'docs/volume-02/00-python-fundamentals-for-infrastructure-masterclass.md',
            'title': 'Python Fundamentals for Infrastructure Masterclass',
            'words': 15000,
            'tables': 5,
            'codeBlocks': 20,
            'images': 2
        })
        source['sourceHeadings'].insert(0, 'Python Fundamentals for Infrastructure Masterclass')

with open('content-manifest.json', 'w') as f:
    json.dump(manifest, f, indent=2)
