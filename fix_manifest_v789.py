import json

with open('content-manifest.json', 'r') as f:
    manifest = json.load(f)

mapping = {
    'docs/volume-07/': [
        {
            'prefixes': ['01-chapter-1', '02-chapter-2', '03-chapter-3', '06-chapter-6', '07-chapter-7', '12-senior-deep', '13-senior-deep', '14-senior-deep'],
            'new_file': 'docs/volume-07/01-metrics-logs-traces-masterclass.md',
            'title': 'Metrics, Logs & Traces Masterclass'
        },
        {
            'prefixes': ['04-chapter-4', '05-chapter-5', '15-senior-deep', '16-senior-deep'],
            'new_file': 'docs/volume-07/02-k8s-gpu-observability-masterclass.md',
            'title': 'K8s & GPU Observability Masterclass'
        },
        {
            'prefixes': ['08-chapter-8', '09-chapter-9', '10-chapter-10', '11-chapter-11', '17-senior-deep', '18-senior-deep', '19-senior-deep'],
            'new_file': 'docs/volume-07/03-incident-response-alerts-masterclass.md',
            'title': 'Incident Response & Alerts Masterclass'
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
    
    if 'Volume_07' in source['file']:
        source['sourceHeadings'] = [v['title'] for v in aggregated.values()]

with open('content-manifest.json', 'w') as f:
    json.dump(manifest, f, indent=2)

