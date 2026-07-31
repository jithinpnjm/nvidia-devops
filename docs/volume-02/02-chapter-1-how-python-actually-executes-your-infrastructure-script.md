---
title: "Chapter 1 - How Python actually executes your infrastructure script"
slug: "chapter-1-how-python-actually-executes-your-infrastructure-script"
sidebar_position: 2
description: "Chapter 1 - How Python actually executes your infrastructure script — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
<!-- source-table:1 -->

> After this chapter you should be able to: Explain references, mutability, module execution, the main guard, and why state bugs appear in automation.


Python feels simple because the syntax hides machinery. For production automation, you need a correct mental model of that machinery: a variable name refers to an object; objects have types and identity; functions create local namespaces; importing a file executes its top-level statements; and mutable objects can be shared by several names. These facts explain many bugs that look mysterious when you only think in terms of “boxes holding values.”

![](pathname:///img/generated/volume-02-01.png)

Figure 1. Two names can point at the same mutable object. Mutation through either name changes the same object.

**Try it: aliasing a mutable list**


<!-- source-table:2 -->

```text
pods = ["api-0", "api-1"]
copy = pods
copy.append("api-2")

print(pods)   # ['api-0', 'api-1', 'api-2']
print(copy)   # same object
print(id(pods) == id(copy))  # True
```


The important operation above is not assignment of list contents. The assignment copy = pods binds a second name to the existing list object. If you need an independent shallow copy, use pods.copy() or list(pods). If nested mutable objects exist, a shallow copy still shares those nested objects; that is when copy.deepcopy() becomes relevant.

## Module execution and \_\_name\_\_


<!-- source-table:3 -->

```text
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


When you run python healthcheck.py, Python sets \_\_name\_\_ to "\_\_main\_\_" and executes main(). When another module imports healthcheck, Python sets \_\_name\_\_ to the module name, so the CLI entry point does not run. This lets one file contain reusable functions and an executable command without causing side effects during import.


<!-- source-table:4 -->

> Memory hook Think of import as “load the toolbox,” and the main guard as “only start the machine when this file is the program, not when someone opens the toolbox.”


## Work the scenario step by step


<!-- source-table:5 -->

> Scenario A unit test imports your disk checker and unexpectedly starts calling real system commands before the test begins.


**1\. Ask what executes at import time. Look for function calls, network requests, argparse parsing, environment validation, or subprocess calls at module scope.**

2\. Move executable behavior into functions. Keep module scope for constants, type definitions, and function/class definitions.

3\. Use a main() function and guard it with if \_\_name\_\_ == "\_\_main\_\_".

4\. Test the pure functions separately from the CLI adapter.


<!-- source-table:6 -->

> Reasoned conclusion The bug is architectural: import should define reusable behavior, not launch production behavior.


## Practice before moving on

1\. Predict the result when two variables reference the same dictionary and one changes a nested list.

2\. Write a module with main() that exits 0 on success and 2 on a failed health check. Import it from another file and prove the health check does not run.

3\. Explain the difference between == and is using an infrastructure example.

## Targeted references

[Python documentation: Data model](https://docs.python.org/3/reference/datamodel.html) - Use this when you need exact behavior for identity, types, attributes, and special methods.

[Udemy - Python for DevOps: Mastering Real-World Automation](https://www.udemy.com/course/python-devops) - Relevant lessons: Writing and running Python files; Variables; Lists; Dictionaries; Introduction to functions.
