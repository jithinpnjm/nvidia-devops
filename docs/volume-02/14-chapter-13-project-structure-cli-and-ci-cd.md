---
title: "Chapter 13 - Project structure, CLI and CI/CD"
slug: "chapter-13-project-structure-cli-and-ci-cd"
sidebar_position: 14
description: "Chapter 13 - Project structure, CLI and CI/CD — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---

*(original text preserved in full; ➕ marks additions)*

> After this chapter you should be able to: Package automation so another engineer can install, test, invoke, and release it predictably.

**A small production-style src layout**
```
infra-doctor/
├── pyproject.toml
├── src/
│   └── infra_doctor/
│       ├── __init__.py
│       ├── cli.py
│       ├── model.py
│       ├── parser.py
│       └── kubernetes.py
└── tests/
    ├── test_parser.py
    └── test_policy.py
```
```toml
# pyproject.toml
[project]
name = "infra-doctor"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["requests>=2.32"]

[project.scripts]
infra-doctor = "infra_doctor.cli:main"
```
An entry point makes the tool executable after installation without asking users to know its package layout. CI should run formatting/lint checks, static analysis, tests, and build verification before publishing or packaging.
```yaml
# .github/workflows/ci.yml (core idea)
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -e . pytest
      - run: pytest -q
```

➕ **Why `src/` layout specifically (a real interview question — "why not just put the package at the repo root?"):**
```
Without src/:  package/           WITH src/:  src/package/
               tests/                          tests/
```
Without `src/`, running `pytest` from the repo root can silently import the *local, uninstalled* copy of your package (because the current directory is on `sys.path`) even when a different (possibly stale) version is `pip install`ed — masking packaging bugs until a real install elsewhere fails. `src/` layout forces tests to run against the actually-installed package, catching packaging mistakes locally instead of in CI or production.

➕ **The full gate, extending the CI skeleton above to match Practice #3's ask (formatting, lint, types, security scan, tests, build):**
```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-python@v5
    with: { python-version: "3.12" }
  - run: pip install -e ".[dev]"
  - run: ruff format --check .          # formatting
  - run: ruff check .                    # lint
  - run: mypy src/infra_doctor --strict  # types
  - run: pip-audit                       # dependency security scan
  - run: pytest -q --cov=infra_doctor    # tests + coverage
  - run: python -m build                 # build verification — does packaging even succeed?
```
This ordering matters: fast/cheap checks (formatting, lint) run before slow/expensive ones (tests, build) so a trivial formatting mistake fails in seconds, not after a multi-minute test suite runs — a real CI-design tradeoff worth naming if asked to design this pipeline live.

## Practice before moving on
1. Create a pyproject.toml with a console entry point.
2. Explain why imports are more predictable with a package than with a directory full of ad-hoc scripts.
3. Design a CI gate for formatting, lint, types, security scan, unit tests and build.

➕ 4. Deliberately remove `src/` (flatten the package to repo root), run `pytest` from the root, and see whether it's importing your editable-installed package or a same-named local file — reproduce the exact ambiguity `src/` layout exists to prevent.

## Targeted references
[Python Packaging User Guide](https://packaging.python.org/) - Modern packaging concepts and pyproject.toml.
[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Python modules; Python packages; pyproject.toml file; Adding tests to multi-file projects; CI/CD pipeline overview; Add static type and security checks; Pytest integration; Building the Python library.

➕ **Visual model — a production change passes progressively cheaper gates first:**
```
format / lint ─► typecheck ─► unit tests ─► package ─► integration ─► release
    seconds          seconds       seconds      minutes      minutes       approval
```
**Memory hook:** *"Fast certainty first, expensive uncertainty later."* `pyproject.toml` defines the build/test contract so the laptop and CI run the same gates.
