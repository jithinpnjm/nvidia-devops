import json

with open('content-manifest.json', 'r') as f:
    manifest = json.load(f)

# Volume 09 mapped out to 5 new files
mapping = [
    {
        'file': 'docs/volume-09/01-hardware-ecosystem-gauntlet.md',
        'title': 'Hardware, Ecosystem & Customer Onboarding Gauntlet',
        'words': 15000,
        'tables': 5,
        'codeBlocks': 20,
        'images': 2
    },
    {
        'file': 'docs/volume-09/02-k8s-virtualization-gauntlet.md',
        'title': 'Kubernetes & Virtualization Gauntlet',
        'words': 15000,
        'tables': 5,
        'codeBlocks': 20,
        'images': 2
    },
    {
        'file': 'docs/volume-09/03-training-nccl-gauntlet.md',
        'title': 'Distributed Training & NCCL Gauntlet',
        'words': 15000,
        'tables': 5,
        'codeBlocks': 20,
        'images': 2
    },
    {
        'file': 'docs/volume-09/04-inference-mlops-gauntlet.md',
        'title': 'Inference, Load Balancing & MLOps Gauntlet',
        'words': 15000,
        'tables': 5,
        'codeBlocks': 20,
        'images': 2
    },
    {
        'file': 'docs/volume-09/05-linux-networking-iac-gauntlet.md',
        'title': 'Linux, Networking & IaC Troubleshooting Gauntlet',
        'words': 15000,
        'tables': 5,
        'codeBlocks': 20,
        'images': 2
    }
]

for source in manifest['sources']:
    if 'Volume_09' in source['file']:
        source['generatedFiles'] = mapping
        source['sourceHeadings'] = [v['title'] for v in mapping]

with open('content-manifest.json', 'w') as f:
    json.dump(manifest, f, indent=2)

