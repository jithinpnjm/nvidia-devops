#!/usr/bin/env python3
"""Audit chapters against the corpus.
  audit.py docs/volume-03            audit every .md under a path
  audit.py --summary docs            one line per file (unsupported / checked)
Unsupported != wrong. It means "no passage in the corpus mentions it": a lead to review by hand.
"""
import argparse, collections, json, pathlib, re, sqlite3

DB = sqlite3.connect(str(pathlib.Path(__file__).parent / "data/index.db"))
ENV = re.compile(r"\b((?:NCCL|CUDA|TORCH|DCGM|UCX|OMPI|SLURM|NVIDIA|MLX|PMIX|NVSHMEM|CUDNN|TRT|HF|VLLM|OMP|GDS|CUFILE|UFM|MELLANOX|MLNX|DOCA|NV)[A-Z0-9]*_[A-Z0-9_]+)\b")
FLAG = re.compile(r"(?<![\w-])(--[a-z][a-z0-9]+(?:[-_][a-z0-9]+)*)")
PATH = re.compile(r"(?<![\w.])(/(?:cm|etc|proc|sys|usr/local/cuda[^/\s]*|opt)/[A-Za-z0-9_./-]{3,})")
cache = {}

def supported(tok: str) -> int:
    if tok in cache: return cache[tok]
    words = re.findall(r"[A-Za-z0-9]+", tok)
    if not words: return 1
    q = '"' + " ".join(words) + '"'
    try:
        n = DB.execute("select count(*) from (select 1 from chunks where chunks match ? limit 3)", (q,)).fetchone()[0]
    except sqlite3.OperationalError:
        n = 1
    cache[tok] = n
    return n

def tokens(text: str):
    text = re.sub(r"^---.*?---", "", text, count=1, flags=re.S)
    out = collections.OrderedDict()
    for rx, kind in ((ENV, "env"), (FLAG, "flag"), (PATH, "path")):
        for m in rx.finditer(text):
            t = m.group(1).rstrip(".,:;)`'\"")
            if len(t) > 3: out.setdefault((kind, t), 0); out[(kind, t)] += 1
    return out

def audit(path: pathlib.Path):
    toks = tokens(path.read_text(errors="replace"))
    bad = [(k, t, c) for (k, t), c in toks.items() if supported(t) == 0]
    return len(toks), bad

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("path"); ap.add_argument("--summary", action="store_true")
    a = ap.parse_args()
    files = sorted(pathlib.Path(a.path).rglob("*.md")) if pathlib.Path(a.path).is_dir() else [pathlib.Path(a.path)]
    for f in files:
        n, bad = audit(f)
        if a.summary:
            print(f"{len(bad):4d}/{n:<4d} {f}")
        elif bad:
            print(f"\n## {f}  ({len(bad)} unsupported of {n})")
            for k, t, c in bad: print(f"  {k:5s} {t}  x{c}")
