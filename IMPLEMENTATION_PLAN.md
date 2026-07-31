# NVIDIA SA Academy implementation plan

1. Build a repeatable DOCX-to-Markdown pipeline from the canonical `source_files/` directory, preserving headings, paragraphs, lists, code-like blocks, tables, links, and embedded images.
2. Generate stable chapter routes beneath `docs/intro` and `docs/volume-01` through `docs/volume-09`, plus category metadata and a coverage manifest.
3. Add strict validation for volume/chapter coverage, source-versus-generated word counts, tables, code blocks, images, empty chapters, and required curriculum topics; publish the results to `CONTENT_COVERAGE_REPORT.md`.
4. Build a TypeScript Docusaurus application with a compact dark technical design, local search, Mermaid support, curriculum navigation, lesson progress controls, and contextual tutor hooks.
5. Implement the dashboard, visual learning, browser-side Python labs, troubleshooting simulator, architecture practice, interview mode, contextual resources, and browser-local progress tracking.
6. Add GitHub Pages configuration/workflows and operational documentation.
7. Run generation, validation, type checking, and the production build; fix failures and record any source or runtime limitations.

## Source findings

- `source_files/` and untracked `SOURCE_FILES/` contain byte-identical copies of the same ten DOCX files. `source_files/` is treated as canonical; neither copy is deleted.
- No existing Docusaurus application exists, so the project is created at the repository root.
- The requested `sources/SKILL.md` and `sources/SOURCE_MAP.md` are not present. Tutor behavior and resource metadata are therefore derived from the master index and volume content, without invented URLs or private claims.
