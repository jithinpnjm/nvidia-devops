---
title: "Chapter 1 - How Python actually executes your infrastructure script"
slug: "chapter-1-how-python-actually-executes-your-infrastructure-script"
sidebar_position: 2
description: "Chapter 1 - How Python actually executes your infrastructure script — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---

*(original text preserved in full; ➕ marks additions)*

> After this chapter you should be able to: Explain references, mutability, module execution, the main guard, and why state bugs appear in automation.

Python feels simple because the syntax hides machinery. For production automation, you need a correct mental model of that machinery: a variable name refers to an object; objects have types and identity; functions create local namespaces; importing a file executes its top-level statements; and mutable objects can be shared by several names. These facts explain many bugs that look mysterious when you only think in terms of "boxes holding values."

![](pathname:///img/generated/volume-02-01.png)

Figure 1. Two names can point at the same mutable object. Mutation through either name changes the same object.

**Try it: aliasing a mutable list**
```python
pods = ["api-0", "api-1"]
copy = pods
copy.append("api-2")

print(pods)  # ['api-0', 'api-1', 'api-2']
print(copy)  # same object
print(id(pods) == id(copy))  # True
```
The important operation above is not assignment of list contents. The assignment `copy = pods` binds a second name to the existing list object. If you need an independent shallow copy, use `pods.copy()` or `list(pods)`. If nested mutable objects exist, a shallow copy still shares those nested objects; that is when `copy.deepcopy()` becomes relevant.

➕ **Diagram: two names, one object**
```
pods ──┐
       ├──▶ ["api-0", "api-1", "api-2"]   (one list object in memory)
copy ──┘

copy.append("api-2") mutates the object both names point at —
pods and copy were never two separate lists.

id(pods) == id(copy)  →  True
```
Neither name "owns" the list more than the other; both are equally valid references to the same object, which is why mutating through either one is visible through both.

➕ **The trap this actually causes in production, with output:**
```python
def add_node(nodes, name, tags=None):
    if tags is None:
        tags = []
    tags.append(name)          # looks safe...
    nodes[name] = tags
    return tags

cluster = {}
shared_tags = ["gpu"]
add_node(cluster, "gpu-1", shared_tags)
add_node(cluster, "gpu-2", shared_tags)   # passed the SAME list both times
print(cluster)
# {'gpu-1': ['gpu', 'gpu-1', 'gpu-2'], 'gpu-2': ['gpu', 'gpu-1', 'gpu-2']}  ← both nodes share one list!
```
The caller passing the same mutable object to two calls is the real-world version of the aliasing bug — the function itself did nothing wrong. **Interview framing:** "the bug isn't in the function, it's in the assumption that passing a reference means passing a copy — Python never copies on assignment or on function call."

➕ **Diagram: the shared-list trap over time**
```
shared_tags = ["gpu"]                                one list object, id=0x100

add_node(cluster, "gpu-1", shared_tags)
  tags is shared_tags               (same id=0x100)
  tags.append("gpu-1")  →  ["gpu", "gpu-1"]           object 0x100 mutated

add_node(cluster, "gpu-2", shared_tags)
  tags is STILL shared_tags         (same id=0x100)
  tags.append("gpu-2")  →  ["gpu", "gpu-1", "gpu-2"]  object 0x100 mutated again

cluster["gpu-1"] and cluster["gpu-2"] both point at object 0x100 —
neither node ever had "its own" list.
```
The timeline makes the bug's timing obvious: the second call doesn't create a second list, it mutates the same object the first call already mutated.

## Module execution and \_\_name\_\_
```python
# healthcheck.py
def check_disk() -> bool:
    print("checking disk")
    return True

def main() -> int:
    ok = check_disk()
    return 0 if ok else 2

if __name__ == "__main__":
    raise SystemExit(main())
```
When you run `python healthcheck.py`, Python sets `__name__` to `"__main__"` and executes `main()`. When another module imports `healthcheck`, Python sets `__name__` to the module name, so the CLI entry point does not run. This lets one file contain reusable functions and an executable command without causing side effects during import.

**Memory hook:** Think of import as "load the toolbox," and the main guard as "only start the machine when this file is the program, not when someone opens the toolbox."

➕ **Shortcut — prove it to yourself in 10 seconds:**
```bash
$ python -c "import healthcheck"    # prints nothing — check_disk() never ran
$ python healthcheck.py             # prints "checking disk" — main() ran
```
If your unit test suite ever prints unexpected output or makes real network calls the moment `import` runs (before any test function executes), this main-guard omission is the first thing to check — it's the single most common reason "importing a module for testing" accidentally executes production behavior.

## Work the scenario step by step
**Scenario:** A unit test imports your disk checker and unexpectedly starts calling real system commands before the test begins.

1. Ask what executes at import time. Look for function calls, network requests, argparse parsing, environment validation, or subprocess calls at module scope.
2. Move executable behavior into functions. Keep module scope for constants, type definitions, and function/class definitions.
3. Use a main() function and guard it with `if __name__ == "__main__"`.
4. Test the pure functions separately from the CLI adapter.

**Reasoned conclusion:** The bug is architectural: import should define reusable behavior, not launch production behavior.

## Practice before moving on
1. Predict the result when two variables reference the same dictionary and one changes a nested list.
2. Write a module with main() that exits 0 on success and 2 on a failed health check. Import it from another file and prove the health check does not run.
3. Explain the difference between == and is using an infrastructure example.

➕ 4. Fix the `add_node` bug above two ways: (a) create a new list inside the function instead of mutating the passed-in one, (b) have the caller pass `list(shared_tags)` at the call site. Explain which fix you'd actually ship and why (hint: defense should live at the boundary most likely to be reused carelessly).

## Targeted references
[Python documentation: Data model](https://docs.python.org/3/reference/datamodel.html) - Use this when you need exact behavior for identity, types, attributes, and special methods.
[Udemy - Python for DevOps: Mastering Real-World Automation](https://www.udemy.com/course/python-devops) - Relevant lessons: Writing and running Python files; Variables; Lists; Dictionaries; Introduction to functions.
