import os
import re

replacements = {
    "chapter-1-processes-threads-cpu-scheduling-and-load": "linux-compute-memory-masterclass",
    "chapter-4-networking-ip-routes-sockets-tcp-dns-nat-and-tls": "linux-networking-masterclass",
    "chapter-5-namespaces-cgroups-and-container-mechanics": "linux-systemd-containers-masterclass",
    "chapter-3-files-file-descriptors-filesystems-and-block-i-o": "linux-storage-io-masterclass",
    "chapter-1-how-python-actually-executes-your-infrastructure-script": "python-core-oop-masterclass",
    "chapter-1-api-server-etcd-and-the-object-model": "k8s-control-plane-scheduling-masterclass"
}

def replace_in_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    modified = False
    for old, new in replacements.items():
        if old in content:
            content = content.replace(old, new)
            modified = True
            
    if modified:
        with open(filepath, 'w') as f:
            f.write(content)

for root, _, files in os.walk('.'):
    if 'node_modules' in root or '.git' in root or 'build' in root:
        continue
    for file in files:
        if file.endswith('.md') or file.endswith('.tsx') or file.endswith('.ts'):
            replace_in_file(os.path.join(root, file))

