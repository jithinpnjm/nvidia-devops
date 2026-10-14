#!/usr/bin/env python3
"""Detect and remove synthetic padding from docs.

Padding shapes found in this repo:
  A. numbered template lines  ("Concept 17: Advanced ...", "<!-- padding line 4 -->"): lines identical after
     digit normalization, appearing >= 8 times outside code fences and tables.
  B. exact duplicate prose paragraphs repeated many times: keep the first occurrence.
  C. numbered template headings ("### Syscall Deep Dive 12: ...") with their body paragraph.
Usage: cleanpad.py [--apply] PATH...
"""
import collections, pathlib, re, sys

def segments(lines):
    """yield (index, in_fence) for each line"""
    infence = False
    for i, l in enumerate(lines):
        if l.lstrip().startswith("```"):
            yield i, True
            infence = not infence
            continue
        yield i, infence

def analyze(text):
    lines = text.split("\n")
    flags = [f for _, f in segments(lines)]
    norm = [re.sub(r"\d+", "#", l.strip()) for l in lines]
    eligible = [(not flags[i]) and (len(l.strip()) > 40 or (l.lstrip().startswith("#") and len(l.strip()) > 12))
                and not l.lstrip().startswith(("|", "```"))
                for i, l in enumerate(lines)]
    cnt = collections.Counter(norm[i] for i in range(len(lines)) if eligible[i] and not lines[i].lstrip().startswith("#"))
    hraw = collections.defaultdict(set)
    for i in range(len(lines)):
        if eligible[i] and lines[i].lstrip().startswith("#"):
            hraw[norm[i]].add(lines[i].strip())
    hcnt = {k: len(v) for k, v in hraw.items()}  # distinct numbered variants only
    raw = collections.Counter(lines[i].strip() for i in range(len(lines)) if eligible[i] and not lines[i].lstrip().startswith("#"))
    remove = set()
    seen_raw = set()
    for i in range(len(lines)):
        if not eligible[i] or lines[i].lstrip().startswith("#"):
            continue
        s = lines[i].strip()
        if cnt[norm[i]] >= 8 and raw[s] < cnt[norm[i]]:  # same template, numbers differ => padding
            remove.add(i)
        elif raw[s] >= 3:  # exact repeats: keep first occurrence
            if s in seen_raw:
                remove.add(i)
            seen_raw.add(s)
    # numbered template headings: drop only stubs (empty body) or headings whose body is already padding
    for i in range(len(lines)):
        if eligible[i] and lines[i].lstrip().startswith("#") and hcnt.get(norm[i], 0) >= 8:
            j = i + 1
            body = []
            while j < len(lines) and not lines[j].lstrip().startswith("#"):
                if lines[j].strip():
                    body.append(j)
                j += 1
            if all(k in remove for k in body):
                remove.add(i)
                remove.update(range(i + 1, j))
    return lines, remove

def clean(text):
    lines, remove = analyze(text)
    out = [l for i, l in enumerate(lines) if i not in remove]
    s = "\n".join(out)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s, len(remove)

if __name__ == "__main__":
    apply = "--apply" in sys.argv
    tot = 0
    for p in [a for a in sys.argv[1:] if not a.startswith("--")]:
        for f in sorted(pathlib.Path(p).rglob("*.md")) if pathlib.Path(p).is_dir() else [pathlib.Path(p)]:
            t = f.read_text()
            new, n = clean(t)
            if n:
                tot += n
                print(f"{n:5d} lines  {f}")
                if apply:
                    f.write_text(new)
    print("TOTAL", tot)
