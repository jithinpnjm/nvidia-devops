#!/usr/bin/env python3
"""Fetch selected public NVIDIA docs -> Markdown with metadata -> SQLite FTS5 index.

  nvingest.py fetch [name...]   crawl HTML sources / download PDFs into data/raw
  nvingest.py convert [name...] raw -> data/md/<name>/*.md (front matter: url, version, hash)
  nvingest.py index             rebuild data/index.db (heading-level chunks)
  nvingest.py search "query" [-n 10] [-s source]
"""
import sys as _sys; _sys.setrecursionlimit(20000)
import argparse, hashlib, json, re, sqlite3, sys, time, tomllib
import urllib.robotparser
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urldefrag, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

ROOT = Path(__file__).parent
DATA = ROOT / "data"
UA = "nvingest/0.1 (personal study corpus; polite crawler)"
DELAY = 1.0


def load_cfg():
    return tomllib.loads((ROOT / "sources.toml").read_text())


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def slug(url: str) -> str:
    p = urlparse(url)
    s = re.sub(r"[^A-Za-z0-9]+", "_", p.path.strip("/")) or "index"
    return s[-120:]


def robots_for(url):
    """urllib's reader chokes on this machine's CA store, so fetch robots.txt with httpx."""
    rp = urllib.robotparser.RobotFileParser()
    p = urlparse(url)
    try:
        r = httpx.get(f"{p.scheme}://{p.netloc}/robots.txt", headers={"User-Agent": UA},
                      follow_redirects=True, timeout=20)
        if r.status_code == 200 and "html" not in r.headers.get("content-type", ""):
            rp.parse(r.text.splitlines())
        elif r.status_code in (401, 403, 429) or r.status_code >= 500:
            rp.disallow_all = True
        else:
            rp.parse([])  # 404 / HTML error page: no robots rules
    except Exception:
        rp.disallow_all = True
    return rp


def fetch_html(src, client):
    raw = DATA / "raw" / src["name"]
    raw.mkdir(parents=True, exist_ok=True)
    rp = robots_for(src["seed"])
    prefixes = tuple([src["prefix"]] if isinstance(src["prefix"], str) else src["prefix"])
    seen, q, n = set(), deque([src["seed"]]), 0
    if src.get("pagetree"):  # JS-navigated doc sites expose their TOC as JSON
        base = "{0.scheme}://{0.netloc}".format(urlparse(src["seed"]))
        def paths(nodes):
            for x in nodes:
                yield x["path"]; yield from paths(x.get("children", []))
        try:
            q.extend(base + p for p in paths(client.get(src["pagetree"]).json()))
        except Exception as e:
            print("pagetree failed", e)
    meta_path = raw / "_meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    cap = src.get("max_pages", 500)
    while q:
        url = urldefrag(q.popleft())[0]
        if url in seen or not url.startswith(prefixes):
            continue
        path = urlparse(url).path
        if "/_sources/" in url or "/_static/" in url or re.search(r"\.(?!html?$|xhtml$)[A-Za-z0-9]{2,5}$", path.rsplit("/", 1)[-1]):
            continue
        if n >= cap:
            print(f"WARNING [{src['name']}]: stopped at max_pages={cap}; more pages remain queued"); break
        seen.add(url)
        if not rp.can_fetch(UA, url):
            print("robots-skip", url); continue
        f = raw / (slug(url) + ".html")
        if f.exists():
            body = f.read_bytes()
        else:
            time.sleep(DELAY)
            try:
                r = client.get(url)
            except Exception as e:
                print("error", type(e).__name__, url); continue
            if r.status_code != 200 or "html" not in r.headers.get("content-type", ""):
                print("skip", r.status_code, url); continue
            body = r.content
            f.write_bytes(body)
            meta[f.name] = {"url": str(r.url), "retrieved_at": datetime.now(timezone.utc).isoformat()}
        n += 1
        print(f"[{src['name']}] {n} {url}")
        meta.setdefault(f.name, {"url": url, "retrieved_at": "cached"})
        for a in BeautifulSoup(body, "html.parser").find_all("a", href=True):
            try:
                q.append(urljoin(url, a["href"]))
            except ValueError:  # malformed hrefs like http://[host]:port
                pass
        if n % 25 == 0:
            meta_path.write_text(json.dumps(meta, indent=1))
    meta_path.write_text(json.dumps(meta, indent=1))


def fetch_pdf(src, client):
    raw = DATA / "raw" / src["name"]
    raw.mkdir(parents=True, exist_ok=True)
    f = raw / "doc.pdf"
    if not f.exists():
        r = client.get(src["url"]); r.raise_for_status()
        f.write_bytes(r.content)
    (raw / "_meta.json").write_text(json.dumps(
        {"doc.pdf": {"url": src["url"], "retrieved_at": datetime.now(timezone.utc).isoformat()}}))
    print(f"[{src['name']}] pdf saved")


def fetch_md(src, client):
    raw = DATA / "raw" / src["name"]; raw.mkdir(parents=True, exist_ok=True)
    meta = {}
    for i, u in enumerate(src["urls"]):
        r = client.get(u); r.raise_for_status()
        (raw / f"{i:02d}_{Path(urlparse(u).path).name}").write_bytes(r.content)
        meta[f"{i:02d}_{Path(urlparse(u).path).name}"] = {"url": u, "retrieved_at": datetime.now(timezone.utc).isoformat()}
        time.sleep(DELAY)
    (raw / "_meta.json").write_text(json.dumps(meta, indent=1))


def convert_md(src):
    raw = DATA / "raw" / src["name"]; out = DATA / "md" / src["name"]; out.mkdir(parents=True, exist_ok=True)
    meta = json.loads((raw / "_meta.json").read_text())
    for name, m in meta.items():
        b = (raw / name).read_bytes()
        (out / (Path(name).stem + ".md")).write_text(front(src, m["url"], sha(b)) + b.decode("utf-8", "replace") + "\n")


def fetch_git(src, client):
    import subprocess
    repo = DATA / "raw" / src["name"] / "repo"
    if not repo.exists():
        repo.parent.mkdir(parents=True, exist_ok=True)
        run = lambda *a, **k: subprocess.run(a, check=True, **k)
        run("git", "clone", "--depth", "1", "--filter=blob:none", "--sparse", src["repo"], str(repo))
        run("git", "-C", str(repo), "sparse-checkout", "set", *src["paths"])
    sha_ = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    (repo.parent / "_meta.json").write_text(json.dumps({"commit": sha_}))
    print(f"[{src['name']}] cloned @ {sha_[:10]}")


def convert_git(src):
    raw = DATA / "raw" / src["name"]; repo = raw / "repo"
    out = DATA / "md" / src["name"]; out.mkdir(parents=True, exist_ok=True)
    commit = json.loads((raw / "_meta.json").read_text())["commit"]
    web = src["repo"].removesuffix(".git")
    for p in src["paths"]:
        for f in sorted((repo / p).rglob("*")):
            if f.suffix not in (".rst", ".md", ".txt", ".adoc") or not f.is_file(): continue
            rel = f.relative_to(repo)
            url = f"{web}/blob/{commit}/{rel}"
            (out / ("_".join(rel.parts) + ".md")).write_text(front(src, url, sha(f.read_bytes())) + f.read_text(errors="replace") + "\n")


def front(src, url, h, extra=""):
    return (f"---\nsource: {src['name']}\nproduct: {src['product']}\nversion: {src.get('version','unknown')}\n"
            f"url: {url}\nsha256: {h}\n{extra}---\n\n")


BLOCK = {"p", "li", "dt", "dd", "blockquote"}


def table_md(t):
    rows = [[c.get_text(" ", strip=True).replace("|", "\\|") for c in r.find_all(["th", "td"])]
            for r in t.find_all("tr")]
    rows = [r for r in rows if r]
    if not rows: return ""
    w = max(map(len, rows))
    rows = [r + [""] * (w - len(r)) for r in rows]
    out = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * w]
    out += ["| " + " | ".join(r) + " |" for r in rows[1:]]
    return "\n".join(out)


def inline(el):
    parts = []
    for c in el.children:
        if isinstance(c, str): parts.append(re.sub(r"\s+", " ", c))
        elif c.name == "code": parts.append("`" + c.get_text() + "`")
        elif c.name == "a": parts.append(inline(c))
        elif c.name in ("ul", "ol", "pre", "table"): continue
        else: parts.append(inline(c))
    return "".join(parts)


def html_to_md(body: bytes) -> str:
    soup = BeautifulSoup(body, "html.parser")
    for t in soup(["script", "style", "nav", "header", "footer", "aside", "form", "button"]):
        t.decompose()
    root = (soup.select_one("article[role=main], div[role=main], main, article, div.body, div.document")
            or soup.body)
    out = []
    def own_pres(el):
        """pre blocks under el that are not inside a nested list item (those are emitted with their own li)."""
        res = []
        for pre in el.find_all("pre"):
            p = pre.parent
            while p is not None and p is not el and p.name != "li":
                p = p.parent
            if p is el: res.append(pre)
        return res
    def emit_list(lst, depth):
        for i, li in enumerate(lst.find_all("li", recursive=False), 1):
            mark = f"{i}." if lst.name == "ol" else "-"
            out.append("  " * depth + f"{mark} " + inline(li).strip())
            for pre in own_pres(li):  # code nested in div.highlight etc.
                out.append("```\n" + pre.get_text().strip("\n") + "\n```")
            for sub in li.find_all(["ul", "ol"], recursive=False):
                emit_list(sub, depth + 1)
    def walk(el, depth=0):
        for c in el.children:
            if isinstance(c, str): continue
            n = c.name
            if n in ("h1", "h2", "h3", "h4", "h5", "h6"):
                out.append("#" * int(n[1]) + " " + re.sub(r"[¶#]\s*$", "", c.get_text(" ", strip=True)).strip())
            elif n == "pre":
                out.append("```\n" + c.get_text().strip("\n") + "\n```")
            elif n == "table":
                out.append(table_md(c))
            elif n in ("ul", "ol"):
                emit_list(c, depth)
            elif n in BLOCK:
                t = inline(c).strip()
                if t: out.append(t)
                for pre in own_pres(c):
                    out.append("```\n" + pre.get_text().strip("\n") + "\n```")
            else:  # div/section/custom elements (astro-island, fern-*): descend
                walk(c, depth)
    walk(root)
    return "\n\n".join(o for o in out if o.strip())


def convert_html(src):
    raw = DATA / "raw" / src["name"]
    out = DATA / "md" / src["name"]; out.mkdir(parents=True, exist_ok=True)
    meta = json.loads((raw / "_meta.json").read_text())
    for f in sorted(raw.glob("*.html")):
        if f.name not in meta or (out / (f.stem + ".md")).exists(): continue
        body = f.read_bytes()
        try:
            md = html_to_md(body)
        except (RecursionError, AttributeError) as e:
            print("unconvertible", type(e).__name__, f.name); continue
        if not md:
            print("empty", f.name); continue
        (out / (f.stem + ".md")).write_text(front(src, meta[f.name]["url"], sha(body)) + md + "\n")


def convert_pdf(src):
    import fitz
    raw = DATA / "raw" / src["name"]
    out = DATA / "md" / src["name"]; out.mkdir(parents=True, exist_ok=True)
    f = raw / "doc.pdf"
    doc = fitz.open(f)
    parts = [f"# {src['product']} ({src.get('version','')})\n"]
    for i, page in enumerate(doc, 1):
        parts.append(f"\n## Page {i}\n\n{page.get_text()}")
    (out / "doc.md").write_text(front(src, src["url"], sha(f.read_bytes()), f"pages: {len(doc)}\n") + "".join(parts))


def targets(cfg, names):
    for kind, fn_f, fn_c in (("source", fetch_html, convert_html), ("pdf", fetch_pdf, convert_pdf), ("md", fetch_md, convert_md), ("git", fetch_git, convert_git)):
        for s in cfg.get(kind, []):
            if not names or s["name"] in names:
                yield s, fn_f, fn_c


def cmd_index():
    db = DATA / "index.db"; db.unlink(missing_ok=True)
    con = sqlite3.connect(db)
    con.execute("create virtual table chunks using fts5(source, url, heading, body, tokenize='porter unicode61')")
    total = 0
    for f in sorted((DATA / "md").glob("*/*.md")):
        text = f.read_text()
        fm = dict(re.findall(r"^(\w+): (.*)$", text.split("---")[1], re.M))
        body = text.split("---", 2)[2]
        for sec in re.split(r"(?m)^(?=#{1,4} )", body):
            sec = sec.strip()
            if len(sec) < 40: continue
            head = sec.splitlines()[0].lstrip("# ").strip()
            con.execute("insert into chunks values (?,?,?,?)", (fm.get("source"), fm.get("url"), head, sec))
            total += 1
    books = load_cfg().get("books", {}).get("dir")
    for d in sorted(Path(books).glob("*")) if books else []:
        name = "book:" + d.name[:40]
        if not any(d.rglob("*.md")):  # PDF-only book: index page text
            import fitz
            for pdf in d.glob("*.pdf"):
                for i, page in enumerate(fitz.open(pdf), 1):
                    txt = page.get_text().strip()
                    if len(txt) < 80: continue
                    head = f"p.{i}: " + txt.splitlines()[0][:80]
                    con.execute("insert into chunks values (?,?,?,?)", (name, f"{pdf}#page={i}", head, txt))
                    total += 1
            continue
        for f in sorted(d.rglob("*.md")):
            if f.name == "README.md": continue
            for sec in re.split(r"(?m)^(?=#{1,4} )", f.read_text()):
                sec = sec.strip()
                if len(sec) < 40: continue
                head = sec.splitlines()[0].lstrip("# ").strip()
                con.execute("insert into chunks values (?,?,?,?)", (name, str(f), head, sec))
                total += 1
    con.commit(); print("chunks:", total)


def cmd_search(q, n, source):
    con = sqlite3.connect(DATA / "index.db")
    sql = "select source, url, heading, snippet(chunks,3,'[',']','…',40) from chunks where chunks match ?"
    args = [" ".join(f'"{t}"' for t in re.findall(r"[A-Za-z0-9_]+", q))]  # quote tokens: FTS5 chokes on . - : etc.
    if source: sql += " and source = ?"; args.append(source)
    for s, u, h, sn in con.execute(sql + " order by rank limit ?", (*args, n)):
        print(f"\n{s} | {h}\n{u}\n{sn}")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    for c in ("fetch", "convert"):
        sub.add_parser(c).add_argument("names", nargs="*")
    sub.add_parser("index")
    s = sub.add_parser("search"); s.add_argument("q"); s.add_argument("-n", type=int, default=10); s.add_argument("-s")
    a = ap.parse_args(); cfg = load_cfg()
    if a.cmd == "fetch":
        with httpx.Client(headers={"User-Agent": UA}, follow_redirects=True, timeout=30) as c:
            for s_, ff, _ in targets(cfg, a.names): ff(s_, c)
    elif a.cmd == "convert":
        for s_, _, cf in targets(cfg, a.names): cf(s_)
    elif a.cmd == "index": cmd_index()
    else: cmd_search(a.q, a.n, a.s)


if __name__ == "__main__":
    main()
