import json

with open('content-manifest.json', 'r') as f:
    manifest = json.load(f)

for source in manifest['sources']:
    if any(vol in source['file'] for vol in ['Volume_01', 'Volume_02', 'Volume_03']):
        source['sourceHeadings'] = [v['title'] for v in source['generatedFiles']]

with open('content-manifest.json', 'w') as f:
    json.dump(manifest, f, indent=2)

