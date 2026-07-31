---
title: "Senior Deep Dive 5 — Subprocess is a process API, not a shell shortcut"
slug: "senior-deep-dive-5-subprocess-is-a-process-api-not-a-shell-shortcut"
sidebar_position: 22
description: "Senior Deep Dive 5 — Subprocess is a process API, not a shell shortcut — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
Use argument arrays, not shell strings, whenever possible. Decide whether stderr is evidence you need to preserve, enforce timeouts, capture exit status, and make command execution injectable so tests do not require real kubectl or nvidia-smi. shell=True is an explicit trust boundary because shell metacharacters become executable syntax.

**Safe external command wrapper**

from dataclasses import dataclass
    import subprocess

@dataclass(frozen=True)
class CmdResult:
    argv: tuple\[str, ...\]
    rc: int
    stdout: str
    stderr: str

def run(argv: list\[str\], timeout\_s: float = 10) -> CmdResult:
    try:
        cp = subprocess.run(
            argv,
            text=True,
            capture\_output=True,
            timeout=timeout\_s,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"timeout: &#123;argv&#125;") from exc
    return CmdResult(tuple(argv), cp.returncode, cp.stdout, cp.stderr)

result = run(\["nvidia-smi", "--query-gpu=index,uuid,temperature.gpu",
              "--format=csv,noheader,nounits"\])
if result.rc != 0:
    raise RuntimeError(result.stderr.strip())
