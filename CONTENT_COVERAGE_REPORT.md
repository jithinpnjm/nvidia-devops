# Content coverage report

Generated deterministically from the canonical `SOURCE_FILES/` DOCX curriculum. Counts are based on the normalized conversion model used to generate the site.

| Source | Lessons | Source words | Generated words | Coverage | Tables | Code blocks | Images |
|---|---:|---:|---:|---:|---:|---:|---:|
| 00_Master_Index.docx | 1 | 532 | 532 | 100.0% | 5/5 | 0/0 | 1/1 |
| Volume_01_Foundations_Beneath_Kubernetes(3).docx | 13 | 3,886 | 3,886 | 100.0% | 42/42 | 20/20 | 5/5 |
| Volume_02_Python_for_Production_Infrastructure(3).docx | 26 | 6,875 | 6,875 | 100.0% | 72/72 | 39/39 | 8/8 |
| Volume_03_Kubernetes_and_Platform_Engineering(3).docx | 17 | 3,338 | 3,338 | 100.0% | 39/39 | 17/17 | 4/4 |
| Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx | 14 | 2,302 | 2,302 | 100.0% | 24/24 | 8/8 | 4/4 |
| Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx | 17 | 2,617 | 2,617 | 100.0% | 26/26 | 1/1 | 3/3 |
| Volume_06_HPC,_Networking_and_Storage_for_AI(2).docx | 15 | 2,155 | 2,155 | 100.0% | 22/22 | 7/7 | 3/3 |
| Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx | 19 | 2,253 | 2,253 | 100.0% | 28/28 | 5/5 | 3/3 |
| Volume_08_Senior_Solutions_Architecture_Practice(2).docx | 18 | 2,295 | 2,295 | 100.0% | 28/28 | 2/2 | 3/3 |
| Volume_09_JR2018680_Interview_Preparation(2).docx | 22 | 2,729 | 2,729 | 100.0% | 39/39 | 3/3 | 3/3 |
| **Total** | **162** | **28,982** | **28,982** | **100.0%** | **325** | **102** | **37** |

## Validation result

PASS — all nine volumes exist; every source major heading maps to a non-empty lesson; normalized word coverage is above the loss threshold; and source tables, code blocks, and images are accounted for.

## Scope notes

- The separate requested `SKILL.md` and `SOURCE_MAP.md` files were not present in either source directory at generation time.
- Conversion warnings are retained in `content-manifest.json` for auditability.
- Coverage counts validate structural preservation; they do not claim that external URLs remain current.
