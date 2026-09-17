import json

with open('content-manifest.json', 'r') as f:
    manifest = json.load(f)

# Mapping of old file prefixes to new files for V4, 5, 6
mapping = {
    'docs/volume-04/': [
        {
            'prefixes': ['01-chapter-1', '02-chapter-2', '08-senior-deep', '09-senior-deep'],
            'new_file': 'docs/volume-04/01-gpu-architecture-topology-masterclass.md',
            'title': 'GPU Architecture & Topology Masterclass'
        },
        {
            'prefixes': ['03-chapter-3', '04-chapter-4', '10-senior-deep', '11-senior-deep'],
            'new_file': 'docs/volume-04/02-gpu-software-operator-masterclass.md',
            'title': 'GPU Software & Operator Masterclass'
        },
        {
            'prefixes': ['05-chapter-5', '06-chapter-6', '07-chapter-7', '12-senior-deep', '13-senior-deep', '14-senior-deep'],
            'new_file': 'docs/volume-04/03-gpu-sharing-telemetry-masterclass.md',
            'title': 'GPU Sharing & Telemetry Masterclass'
        }
    ],
    'docs/volume-05/': [
        {
            'prefixes': ['01-chapter-1', '02-chapter-2', '10-senior-deep', '17-senior-deep'],
            'new_file': 'docs/volume-05/01-ai-workloads-training-masterclass.md',
            'title': 'AI Workloads & Distributed Training Masterclass'
        },
        {
            'prefixes': ['03-chapter-3', '04-chapter-4', '11-senior-deep', '12-senior-deep', '13-senior-deep'],
            'new_file': 'docs/volume-05/02-llm-inference-serving-masterclass.md',
            'title': 'LLM Inference & Serving Frameworks Masterclass'
        },
        {
            'prefixes': ['05-chapter-5', '06-chapter-6', '07-chapter-7', '08-chapter-8', '09-chapter-9', '14-senior-deep', '15-senior-deep', '16-senior-deep'],
            'new_file': 'docs/volume-05/03-ai-autoscaling-rag-masterclass.md',
            'title': 'Autoscaling, RAG & Architectures Masterclass'
        }
    ],
    'docs/volume-06/': [
        {
            'prefixes': ['01-chapter-1', '02-chapter-2', '03-chapter-3', '09-senior-deep', '10-senior-deep'],
            'new_file': 'docs/volume-06/01-ai-networking-rdma-masterclass.md',
            'title': 'AI Networking & RDMA Masterclass'
        },
        {
            'prefixes': ['04-chapter-4', '05-chapter-5', '11-senior-deep'],
            'new_file': 'docs/volume-06/02-gpudirect-fabric-operator-masterclass.md',
            'title': 'GPUDirect, Fabric & Operators Masterclass'
        },
        {
            'prefixes': ['06-chapter-6', '12-senior-deep'],
            'new_file': 'docs/volume-06/03-ai-storage-data-pipelines-masterclass.md',
            'title': 'AI Storage & Data Pipelines Masterclass'
        },
        {
            'prefixes': ['07-chapter-7', '08-chapter-8', '13-senior-deep', '14-senior-deep', '15-senior-deep'],
            'new_file': 'docs/volume-06/04-distributed-orchestration-masterclass.md',
            'title': 'Distributed Orchestration (Slurm vs K8s) Masterclass'
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
    
    if any(vol in source['file'] for vol in ['Volume_04', 'Volume_05', 'Volume_06']):
        source['sourceHeadings'] = [v['title'] for v in aggregated.values()]

with open('content-manifest.json', 'w') as f:
    json.dump(manifest, f, indent=2)
