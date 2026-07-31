# NVIDIA Senior DevOps / AI Infrastructure Solutions Architect Academy

A production-oriented Docusaurus learning platform for senior Cloud, DevOps, SRE, Platform, GPU/AI infrastructure, HPC, and Solutions Architecture mastery. The core curriculum is generated without chapter compression from the repository's nine-volume DOCX study series.

This is an independent learning project based on public technical knowledge. It is not an NVIDIA product and does not claim insider information.

## Architecture

```text
source_files/*.docx
        │
        ▼
Mammoth OOXML extraction ── embedded media → public/img/generated
        │
        ▼
Turndown/GFM normalization
        │
        ▼
docs/intro + docs/volume-01…09
        │
        ├── content-manifest.json
        └── CONTENT_COVERAGE_REPORT.md
        │
        ▼
Docusaurus → static GitHub Pages site
```

The React application adds interactive system diagrams, browser-only Pyodide labs, evidence-driven troubleshooting, architecture and interview practice, contextual resources, tutor integration, local search, and localStorage progress. Core reading requires no backend.

## Local setup

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run generate-content
npm start
```

The development URL is normally `http://localhost:3000/nvidia-devops/`.

## Generation and validation

```bash
npm run generate-content
npm run validate-content
npm run typecheck
npm run build
```

Or run the complete gate:

```bash
npm run check
```

`generate-content` treats lowercase `source_files/` as canonical, converts every DOCX, splits volumes at source Heading 1 boundaries, emits stable slugs/front matter/category metadata, extracts media, and records conversion metadata. `validate-content` fails on a missing volume, missing major heading, empty chapter, suspicious word loss, or lost table/code/image accounting.

To update content, replace the applicable canonical DOCX without renaming its volume prefix, run `npm run generate-content`, inspect the generated lesson changes and `CONTENT_COVERAGE_REPORT.md`, then run `npm run check`. Do not hand-edit generated volume lessons; change the source or generator.

## Browser Python

The playground loads Pyodide only on the Labs page. Code runs in a disposable Web Worker, never on a project server, and the worker is terminated after a 12-second limit. Pyodide is loaded from its pinned jsDelivr release at runtime, so first execution needs network access.

## Tutor integration

No API key is embedded. Set a public, user-authorized integration endpoint at build time:

```bash
TUTOR_BACKEND_URL=https://your-tutor-gateway.example npm run build
```

The frontend sends topic, route, selected text, and `TEACH` mode to that endpoint. Without it, the Tutor page generates a contextual prompt for the learner to copy or open in ChatGPT. Keep credentials and provider API calls behind an authenticated gateway.

## Search and progress

Search is a build-time local index and works on GitHub Pages without hosted search infrastructure. Progress is stored only in the current browser under `nvidia-sa-academy.progress.v1`; the storage interface is isolated so authenticated persistence can replace it later.

## Deployment

`.github/workflows/deploy-pages.yml` generates, validates, type-checks, builds, and deploys the static `build/` artifact with official GitHub Pages actions. Configure repository Pages source as **GitHub Actions**.

Expected URL: <https://jithinpnjm.github.io/nvidia-devops/>

## Source limitations

The prompt referenced `sources/SKILL.md` and `sources/SOURCE_MAP.md`, but neither exists in the repository. Tutor behavior follows the flow stated in the master request, and the resource layer uses vetted official landing/documentation URLs instead of inventing source-map entries. Both duplicate DOCX directories are preserved; `SOURCE_FILES/` was already untracked and is not modified.
