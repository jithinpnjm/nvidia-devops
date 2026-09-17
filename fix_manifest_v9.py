import json

with open('content-manifest.json', 'r') as f:
    data = json.load(f)

for volume in data['volumes']:
    if volume['id'] == 'volume-09':
        volume['chapters'] = [
            {
                "id": "01-interview-framework-masterclass",
                "title": "Interview Framework & Whiteboard Masterclass",
                "path": "docs/volume-09/01-interview-framework-masterclass.md",
                "learning_objectives": ["Master the interview framework"]
            },
            {
                "id": "02-troubleshooting-scenarios-masterclass",
                "title": "Troubleshooting Scenarios Masterclass",
                "path": "docs/volume-09/02-troubleshooting-scenarios-masterclass.md",
                "learning_objectives": ["Master troubleshooting"]
            },
            {
                "id": "03-ai-architecture-and-design-masterclass",
                "title": "AI Architecture & Design Masterclass",
                "path": "docs/volume-09/03-ai-architecture-and-design-masterclass.md",
                "learning_objectives": ["Master AI architecture"]
            }
        ]

with open('content-manifest.json', 'w') as f:
    json.dump(data, f, indent=2)

