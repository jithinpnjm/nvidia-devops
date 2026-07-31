import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(await fs.readFile(path.join(root, 'content-manifest.json'), 'utf8'));
const failures = [];
const rows = [];
const requiredTopics = [
  'cgroups', 'NUMA', 'Kubernetes', 'GPU Operator', 'MIG', 'DCGM', 'Xid', 'NVLink',
  'NCCL', 'RDMA', 'RoCE', 'InfiniBand', 'GPUDirect', 'Slurm', 'KV cache', 'TTFT',
  'TensorRT-LLM', 'NIM', 'vLLM', 'Dynamo', 'Prometheus', 'SLO', 'TCO', 'PoC',
];

if (manifest.sources.length !== 10) failures.push(`Expected ten sources, found ${manifest.sources.length}`);
for (let volume = 1; volume <= 9; volume += 1) {
  if (!manifest.sources.some((source) => source.volume === volume)) failures.push(`Volume ${volume} is missing`);
}

let allGenerated = '';
for (const source of manifest.sources) {
  let generatedWords = 0;
  let generatedTables = 0;
  let generatedCode = 0;
  let generatedImages = 0;
  let sourceBody = '';
  if (!source.generatedFiles.length) failures.push(`${source.file}: no generated chapters`);
  for (const lesson of source.generatedFiles) {
    const absolute = path.join(root, lesson.file);
    const body = await fs.readFile(absolute, 'utf8');
    sourceBody += `\n${body}`;
    allGenerated += `\n${body}`;
    generatedWords += lesson.words;
    generatedTables += lesson.tables;
    generatedCode += lesson.codeBlocks;
    generatedImages += lesson.images;
    if (lesson.words < 8) failures.push(`${lesson.file}: chapter is effectively empty (${lesson.words} words)`);
  }
  const ratio = source.sourceWords ? generatedWords / source.sourceWords : 1;
  if (ratio < 0.9) failures.push(`${source.file}: generated/source word ratio ${ratio.toFixed(2)} is suspiciously low`);
  for (const heading of source.sourceHeadings) {
    const mapped = source.volume === 0
      ? sourceBody.includes(`# ${heading}`)
      : source.generatedFiles.some((lesson) => lesson.title === heading);
    if (!mapped) failures.push(`${source.file}: heading missing: ${heading}`);
  }
  if (source.sourceTables > 0 && generatedTables < source.sourceTables) failures.push(`${source.file}: tables lost (${generatedTables}/${source.sourceTables})`);
  if (source.sourceCodeBlocks > 0 && generatedCode < source.sourceCodeBlocks) failures.push(`${source.file}: code blocks lost (${generatedCode}/${source.sourceCodeBlocks})`);
  if (source.sourceImages > 0 && generatedImages < source.sourceImages) failures.push(`${source.file}: images lost (${generatedImages}/${source.sourceImages})`);
  rows.push({source, generatedWords, generatedTables, generatedCode, generatedImages, ratio});
}

for (const topic of requiredTopics) {
  if (!allGenerated.toLowerCase().includes(topic.toLowerCase())) failures.push(`Required topic not found: ${topic}`);
}

const totals = rows.reduce((acc, row) => ({
  sourceWords: acc.sourceWords + row.source.sourceWords,
  generatedWords: acc.generatedWords + row.generatedWords,
  tables: acc.tables + row.generatedTables,
  code: acc.code + row.generatedCode,
  images: acc.images + row.generatedImages,
  lessons: acc.lessons + row.source.generatedFiles.length,
}), {sourceWords: 0, generatedWords: 0, tables: 0, code: 0, images: 0, lessons: 0});

const report = `# Content coverage report

Generated deterministically from the canonical \`SOURCE_FILES/\` DOCX curriculum. Counts are based on the normalized conversion model used to generate the site.

| Source | Lessons | Source words | Generated words | Coverage | Tables | Code blocks | Images |
|---|---:|---:|---:|---:|---:|---:|---:|
${rows.map(({source, generatedWords, generatedTables, generatedCode, generatedImages, ratio}) => `| ${source.file.replaceAll('|', '\\|')} | ${source.generatedFiles.length} | ${source.sourceWords.toLocaleString()} | ${generatedWords.toLocaleString()} | ${(ratio * 100).toFixed(1)}% | ${generatedTables}/${source.sourceTables} | ${generatedCode}/${source.sourceCodeBlocks} | ${generatedImages}/${source.sourceImages} |`).join('\n')}
| **Total** | **${totals.lessons}** | **${totals.sourceWords.toLocaleString()}** | **${totals.generatedWords.toLocaleString()}** | **${(totals.generatedWords / totals.sourceWords * 100).toFixed(1)}%** | **${totals.tables}** | **${totals.code}** | **${totals.images}** |

## Validation result

${failures.length ? `FAILED with ${failures.length} issue(s):\n\n${failures.map((failure) => `- ${failure}`).join('\n')}` : `PASS — all nine volumes exist; every source major heading maps to a non-empty lesson; normalized word coverage is above the loss threshold; and source tables, code blocks, and images are accounted for.`}

## Scope notes

- The separate requested \`SKILL.md\` and \`SOURCE_MAP.md\` files were not present in either source directory at generation time.
- Conversion warnings are retained in \`content-manifest.json\` for auditability.
- Coverage counts validate structural preservation; they do not claim that external URLs remain current.
`;
await fs.writeFile(path.join(root, 'CONTENT_COVERAGE_REPORT.md'), report);

if (failures.length) {
  console.error(failures.map((failure) => `ERROR: ${failure}`).join('\n'));
  process.exit(1);
}
console.log(`Coverage PASS: ${totals.lessons} lessons, ${totals.generatedWords.toLocaleString()} normalized words, ${totals.tables} tables, ${totals.code} code blocks, ${totals.images} images.`);
