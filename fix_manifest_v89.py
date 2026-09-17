import json

with open('content-manifest.json', 'r') as f:
    manifest = json.load(f)

mapping = {
    'docs/volume-08/': [
        {
            'prefixes': ['01-chapter-1', '02-chapter-2', '03-chapter-3', '11-senior-deep', '12-senior-deep'],
            'new_file': 'docs/volume-08/01-architecture-design-masterclass.md',
            'title': 'Architecture & Design Masterclass'
        },
        {
            'prefixes': ['04-chapter-4', '05-chapter-5', '07-chapter-7', '13-senior-deep', '16-senior-deep'],
            'new_file': 'docs/volume-08/02-capacity-tco-masterclass.md',
            'title': 'Capacity & TCO Masterclass'
        },
        {
            'prefixes': ['08-chapter-8', '15-senior-deep'],
            'new_file': 'docs/volume-08/03-security-governance-masterclass.md',
            'title': 'Security & Governance Masterclass'
        },
        {
            'prefixes': ['06-chapter-6', '09-chapter-9', '10-chapter-10', '14-senior-deep', '17-senior-deep', '18-senior-deep'],
            'new_file': 'docs/volume-08/04-strategy-communication-masterclass.md',
            'title': 'Strategy & Communication Masterclass'
        }
    ],
    'docs/volume-09/': [
        {
            'prefixes': ['01-chapter-1', '02-chapter-2', '08-chapter-8', '09-chapter-9', '10-chapter-10', '12-chapter-12', '13-senior', '15-question', '20-question', '21-question', '22-current'],
            'new_file': 'docs/volume-09/01-interview-framework-masterclass.md',
            'title': 'Interview Framework Masterclass'
        },
        {
            'prefixes': ['03-chapter-3', '04-chapter-4', '05-chapter-5', '14-question', '16-question'],
            'new_file': 'docs/volume-09/02-troubleshooting-scenarios-masterclass.md',
            'title': 'Troubleshooting Scenarios Masterclass'
        },
        {
            'prefixes': ['06-chapter-6', '07-chapter-7', '11-chapter-11', '17-question', '18-question', '19-question'],
            'new_file': 'docs/volume-09/03-ai-architecture-and-design-masterclass.md',
            'title': 'AI Architecture & Design Masterclass'
        }
    ]
}

for source in manifest['sources']:
    new_generated_files = []
    aggregated = {}
    
    for gen_file in source['generatedFiles']:
        old_path = gen_file['file']
        matched = False
        
        for vol_prefix, rule_list in mapping.items():
            if old_path.startswith(vol_prefix):
                filename = old_path.replace(vol_prefix, '')
                for rule in rule_list:
                    for p in rule['prefixes']:
                        if filename.startswith(p):
                            matched = True
                            nf = rule['new_file']
                            if nf not in aggregated:
                                aggregated[nf] = {
                                    'file': nf,
                                    'title': rule['title'],
                                    'words': 0,
                                    'tables': 0,
                                    'codeBlocks': 0,
                                    'images': 0
                                }
                            aggregated[nf]['words'] += gen_file.get('words', 0)
                            aggregated[nf]['tables'] += gen_file.get('tables', 0)
                            aggregated[nf]['codeBlocks'] += gen_file.get('codeBlocks', 0)
                            aggregated[nf]['images'] += gen_file.get('images', 0)
                            break
                    if matched:
                        break
            if matched:
                break
        
        if not matched:
            new_generated_files.append(gen_file)
            
    for k, v in aggregated.items():
        new_generated_files.append(v)
        
    source['generatedFiles'] = new_generated_files
    
    if any(vol in source['file'] for vol in ['Volume_08', 'Volume_09']):
        source['sourceHeadings'] = [v['title'] for v in aggregated.values()]

with open('content-manifest.json', 'w') as f:
    json.dump(manifest, f, indent=2)

