import os
import re

directory = "docs/nvidia-zero-to-hero/volume-01/"
files = [
    "chapter-01-what-is-ai-infrastructure.md",
    "chapter-07-nvidia-ecosystem-overview.md",
    "labs/lab-02-trace-an-ai-request-path.md"
]

replacements = {
    "chapter-02-why-cpus-became-insufficient.md": "chapter-02-why-cpus-became-insufficient",
    "chapter-03-cpu-vs-gpu.md": "chapter-03-cpu-vs-gpu",
    "./chapter-06-modern-ai-factory": "./chapter-06-modern-ai-factory",
    "../chapter-04-what-happens-when-chatgpt-answers": "../chapter-04-what-happens-when-chatgpt-answers",
    "../chapter-05-ai-infrastructure-landscape": "../chapter-05-ai-infrastructure-landscape"
}

# The files were generated with proper names but the Docusaurus build says broken links. 
# Oh wait, the problem is Docusaurus checks if the .md file exists.
# The files ARE still named chapter-02-why-cpus-became-insufficient.md
