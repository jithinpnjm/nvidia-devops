#!/usr/bin/env python3
"""show.py "query" [-s source] [-n N] [-c chars] : print full chunk bodies for top FTS hits"""
import argparse, re, sqlite3
ap = argparse.ArgumentParser(); ap.add_argument("q"); ap.add_argument("-s"); ap.add_argument("-n", type=int, default=3); ap.add_argument("-c", type=int, default=1800)
a = ap.parse_args()
q = " ".join(f'"{t}"' for t in re.findall(r"[A-Za-z0-9_]+", a.q))
sql = "select source,url,heading,body from chunks where chunks match ?" + (" and source=?" if a.s else "") + " order by rank limit ?"
db = sqlite3.connect("data/index.db")
rows = db.execute(sql, [q] + ([a.s] if a.s else []) + [a.n]).fetchall()
if not rows:  # AND of every term found nothing: fall back to OR, best BM25 first
    q = " OR ".join(f'"{t}"' for t in re.findall(r"[A-Za-z0-9_]+", a.q))
    rows = db.execute(sql, [q] + ([a.s] if a.s else []) + [a.n]).fetchall()
for s, u, h, b in rows:
    print(f"\n##### [{s}] {h}\n{u}\n{b[:a.c]}")
