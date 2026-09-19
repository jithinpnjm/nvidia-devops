import re

with open('docs/nvidia-zero-to-hero/volume-01/chapter-06-modern-ai-factory.md', 'r') as f:
    content = f.read()

# Fix the Mermaid subgraph linking issue
bad_mermaid = """    Power -->|Heavy Gauge Wires| Compute Rack
    CDU -->|Chilled Water Pipes| Compute Rack"""

good_mermaid = """    Power -->|Heavy Gauge Wires| Node1
    CDU -->|Chilled Water Pipes| Node1"""

content = content.replace(bad_mermaid, good_mermaid)

with open('docs/nvidia-zero-to-hero/volume-01/chapter-06-modern-ai-factory.md', 'w') as f:
    f.write(content)
