import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import {gfm} from 'turndown-plugin-gfm';

const root = process.cwd();
const sourceDir = path.join(root, 'source_files');
const docsDir = path.join(root, 'docs');
const mediaDir = path.join(root, 'public', 'img', 'generated');
const manifestPath = path.join(root, 'content-manifest.json');

const volumeNames = [
  'Foundations Beneath Kubernetes',
  'Python for Production Infrastructure',
  'Kubernetes and Platform Engineering',
  'GPU and Accelerated Computing Foundations',
  'AI Workloads and AI Platform Architecture',
  'HPC, Networking and Storage for AI',
  'Observability, Reliability and Troubleshooting',
  'Senior Solutions Architecture Practice',
  'JR2018680 Interview Preparation',
];

const sourceFiles = (await fs.readdir(sourceDir))
  .filter((name) => name.toLowerCase().endsWith('.docx'))
  .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));

if (sourceFiles.length !== 10) {
  throw new Error(`Expected master index plus nine DOCX volumes; found ${sourceFiles.length}`);
}

const slugify = (value) => value
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[’']/g, '')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 78) || 'lesson';

const plainText = (value) => value
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ')
  .trim();

const words = (value) => plainText(value).split(/\s+/).filter(Boolean).length;
const count = (value, pattern) => (value.match(pattern) || []).length;
const yaml = (value) => JSON.stringify(value.replace(/\s+/g, ' ').trim());

const cellText = (value, preserveLines = false) => {
  const withLines = value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n');
  const decoded = withLines
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  return preserveLines
    ? decoded.replace(/\r/g, '').replace(/^\s+|\s+$/g, '')
    : decoded.replace(/\s+/g, ' ').trim();
};

const markdownTable = (tableHtml, marker) => {
  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cell[1]),
  ).filter((row) => row.length);
  const prefix = `\n\n<!-- source-table:${marker} -->\n\n`;
  if (!rows.length) return prefix;
  if (rows.length === 1 && rows[0].length === 1 && /<pre\b/i.test(rows[0][0])) {
    return `${prefix}\`\`\`text\n${cellText(rows[0][0], true)}\n\`\`\`\n\n`;
  }
  if (rows.length === 1 && rows[0].length === 1) return `${prefix}> ${cellText(rows[0][0]).replace(/\n/g, ' ')}\n\n`;
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => Array.from({length: width}, (_, index) => cellText(row[index] || '').replace(/\|/g, '\\|')));
  return `${prefix}| ${normalized[0].join(' | ')} |\n| ${Array(width).fill('---').join(' | ')} |\n${normalized.slice(1).map((row) => `| ${row.join(' | ')} |`).join('\n')}\n\n`;
};

const normalizeTables = (html) => {
  const tables = [];
  const tokenized = html.replace(/<table\b[\s\S]*?<\/table>/gi, (table) => {
    const token = `ACADEMYTABLETOKEN${tables.length}END`;
    tables.push(markdownTable(table, tables.length + 1));
    return `<p>${token}</p>`;
  });
  return {html: tokenized, tables};
};

const mdxSafe = (markdown) => {
  let fenced = false;
  return markdown.split('\n').map((line) => {
    if (/^```/.test(line.trim())) { fenced = !fenced; return line; }
    if (fenced) return line;
    if (/^<!-- source-table:\d+ -->$/.test(line.trim())) return line;
    let safe = line.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
    safe = safe.replace(/<br\s*\/?\s*>/gi, '  ');
    safe = safe.replace(/</g, '&lt;');
    if (/^(import|export)\s/.test(safe)) safe = `    ${safe}`;
    return safe;
  }).join('\n');
};

await fs.mkdir(docsDir, {recursive: true});
await fs.rm(mediaDir, {recursive: true, force: true});
await fs.mkdir(mediaDir, {recursive: true});
for (const dir of ['intro', ...Array.from({length: 9}, (_, i) => `volume-${String(i + 1).padStart(2, '0')}`)]) {
  await fs.rm(path.join(docsDir, dir), {recursive: true, force: true});
  await fs.mkdir(path.join(docsDir, dir), {recursive: true});
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  emDelimiter: '_',
});
turndown.use(gfm);
turndown.addRule('lineBreak', {filter: 'br', replacement: () => '<br />'});
turndown.addRule('caption', {
  filter: (node) => node.nodeName === 'P' && node.classList?.contains('caption'),
  replacement: (content) => `\n\n_${content}_\n\n`,
});

const manifest = {
  generatedAt: new Date().toISOString(),
  canonicalSource: 'source_files',
  sources: [],
};

for (const [sourceIndex, sourceName] of sourceFiles.entries()) {
  const isMaster = sourceName.startsWith('00_');
  const volumeNumber = isMaster ? 0 : Number(sourceName.match(/Volume_(\d+)/)?.[1]);
  const targetDirName = isMaster ? 'intro' : `volume-${String(volumeNumber).padStart(2, '0')}`;
  const targetDir = path.join(docsDir, targetDirName);
  let imageIndex = 0;

  const result = await mammoth.convertToHtml(
    {path: path.join(sourceDir, sourceName)},
    {
      styleMap: [
        "p[style-name='Title'] => h1.document-title:fresh",
        "p[style-name='Subtitle'] => p.subtitle:fresh",
        "p[style-name='Code'] => pre:separator('\\n')",
        "p[style-name='Code Block'] => pre:separator('\\n')",
        "p[style-name='CodeBlock4'] => pre:separator('\\n')",
        "p[style-name='Quote'] => blockquote > p:fresh",
        "p[style-name='Intense Quote'] => blockquote > p:fresh",
        "p[style-name='caption'] => p.caption:fresh",
      ],
      convertImage: mammoth.images.imgElement(async (image) => {
        imageIndex += 1;
        const extension = image.contentType?.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
        const fileName = `${targetDirName}-${String(imageIndex).padStart(2, '0')}.${extension}`;
        await fs.writeFile(path.join(mediaDir, fileName), Buffer.from(await image.read('base64'), 'base64'));
        return {src: `pathname:///img/generated/${fileName}`};
      }),
    },
  );

  // Word document titles are presentation metadata, not chapter boundaries.
  let html = result.value.replace(/<h1 class="document-title">([\s\S]*?)<\/h1>/i, '<div class="document-title">$1</div>');
  const sourceHeadings = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => plainText(match[1]));
  let chunks;
  if (isMaster) {
    chunks = [{title: 'Master Index', html}];
  } else {
    const matches = [...html.matchAll(/<h1[^>]*>[\s\S]*?<\/h1>/gi)];
    const preface = matches.length ? html.slice(0, matches[0].index) : html;
    chunks = matches.map((match, index) => {
      const end = matches[index + 1]?.index ?? html.length;
      return {
        title: plainText(match[0]),
        html: `${index === 0 ? preface : ''}${html.slice(match.index, end)}`,
      };
    });
  }

  const usedSlugs = new Set();
  const generatedFiles = [];
  for (const [chapterIndex, chunk] of chunks.entries()) {
    let slug = isMaster ? 'master-index' : slugify(chunk.title);
    if (usedSlugs.has(slug)) slug = `${slug}-${chapterIndex + 1}`;
    usedSlugs.add(slug);
    const fileName = `${String(chapterIndex + 1).padStart(2, '0')}-${slug}.md`;
    const normalized = normalizeTables(chunk.html);
    let markdown = turndown.turndown(normalized.html);
    normalized.tables.forEach((table, index) => { markdown = markdown.replace(`ACADEMYTABLETOKEN${index}END`, table); });
    const chapterHeadingIndex = markdown.split('\n').findIndex((line) => line.trim() === `# ${chunk.title}`);
    if (chapterHeadingIndex >= 0) {
      const lines = markdown.split('\n'); lines.splice(chapterHeadingIndex, 1); markdown = lines.join('\n');
    }
    markdown = mdxSafe(markdown)
      .replace(/\u00a0/g, ' ')
      .replace(/^[ \t]+$/gm, '')
      .replace(/^#\s+[^\n]+\n+/, '')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
    const title = chunk.title || `${volumeNames[volumeNumber - 1]} overview`;
    const description = isMaster
      ? 'Curriculum map and guided learning flow for the NVIDIA Senior DevOps and AI Infrastructure Solutions Architect Academy.'
      : `${title} — ${volumeNames[volumeNumber - 1]}.`;
    const frontMatter = [
      '---',
      `title: ${yaml(title)}`,
      `slug: ${yaml(slug)}`,
      `sidebar_position: ${chapterIndex + 1}`,
      `description: ${yaml(description)}`,
      `source_document: ${yaml(sourceName)}`,
      '---',
      '',
    ].join('\n');
    await fs.writeFile(path.join(targetDir, fileName), `${frontMatter}${markdown}\n`);
    generatedFiles.push({
      file: path.posix.join('docs', targetDirName, fileName),
      title,
      words: words(chunk.html),
      tables: count(chunk.html, /<table\b/gi),
      codeBlocks: count(chunk.html, /<pre\b/gi),
      images: count(chunk.html, /<img\b/gi),
    });
  }

  const label = isMaster ? 'Start Here' : `Volume ${volumeNumber}: ${volumeNames[volumeNumber - 1]}`;
  await fs.writeFile(path.join(targetDir, '_category_.json'), `${JSON.stringify({label, position: sourceIndex + 1, collapsible: true}, null, 2)}\n`);
  manifest.sources.push({
    file: sourceName,
    volume: volumeNumber,
    directory: targetDirName,
    sourceWords: words(html),
    sourceTables: count(html, /<table\b/gi),
    sourceCodeBlocks: count(html, /<pre\b/gi),
    sourceImages: count(html, /<img\b/gi),
    sourceHeadings,
    conversionMessages: result.messages.map((message) => message.message),
    generatedFiles,
  });
}

await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${manifest.sources.reduce((sum, source) => sum + source.generatedFiles.length, 0)} lessons from ${manifest.sources.length} DOCX files.`);
