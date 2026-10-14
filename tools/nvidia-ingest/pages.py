#!/usr/bin/env python3
"""Print pages [a,b] of a PDF-sourced md:  pages.py bcm11-admin 800 812"""
import re, sys
n, a, b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
t = open(f"data/md/{n}/doc.md").read()
for m in re.finditer(r"(?s)\n## Page (\d+)\n(.*?)(?=\n## Page \d+\n|\Z)", t):
    if a <= int(m.group(1)) <= b:
        print(f"\n===== p.{m.group(1)} =====\n{m.group(2).strip()}")
