---
title: "Chapter 13 - Project structure, CLI and CI/CD"
slug: "chapter-13-project-structure-cli-and-ci-cd"
sidebar_position: 14
description: "Chapter 13 - Project structure, CLI and CI/CD — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
<!-- source-table:1 -->

> After this chapter you should be able to: Package automation so another engineer can install, test, invoke, and release it predictably.


**A small production-style src layout**


<!-- source-table:2 -->

```text
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


<!-- source-table:3 -->

```text
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


<!-- source-table:4 -->

```text
# .github/workflows/ci.yml (core idea)
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -e . pytest
      - run: pytest -q
```


## Practice before moving on

1\. Create a pyproject.toml with a console entry point.

2\. Explain why imports are more predictable with a package than with a directory full of ad-hoc scripts.

3\. Design a CI gate for formatting, lint, types, security scan, unit tests and build.

## Targeted references

[Python Packaging User Guide](https://packaging.python.org/) - Modern packaging concepts and pyproject.toml.

[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Python modules; Python packages; pyproject.toml file; Adding tests to multi-file projects; CI/CD pipeline overview; Add static type and security checks; Pytest integration; Building the Python library.
