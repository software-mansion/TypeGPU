import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

const DROPPED_TAGS = new Set(['script', 'style', 'link', 'svg', 'button', 'canvas', 'noscript']);

const hasClass = (node, name) => node.properties?.className?.includes(name);

const textOf = (node) =>
  node.type === 'text' ? node.value : (node.children ?? []).map(textOf).join('');

function find(node, test) {
  if (test(node)) return node;
  for (const child of node.children ?? []) {
    const found = find(child, test);
    if (found) return found;
  }
}

const element = (tagName, properties, children) => ({
  type: 'element',
  tagName,
  properties,
  children,
});

// The copy button holds the code as displayed, without Twoslash popups or cut setup lines
function codeBlock(node) {
  const code = find(node, (n) => n.properties?.dataCode !== undefined)?.properties.dataCode;
  const language = find(node, (n) => n.tagName === 'pre')?.properties.dataLanguage;
  return element('pre', {}, [
    element('code', language ? { className: [`language-${language}`] } : {}, [
      { type: 'text', value: String(code ?? '').replaceAll('\x7f', '\n') },
    ]),
  ]);
}

function tabs(node) {
  const labels = [];
  const panels = [];
  const collectTabs = (n) => {
    if (n.properties?.role === 'tab') labels.push(textOf(n).trim());
    else if (n.properties?.role === 'tabpanel') panels.push(n);
    else n.children?.forEach(collectTabs);
  };
  collectTabs(node);

  return element(
    'div',
    {},
    panels.flatMap((panel, i) => [
      element('p', {}, [element('strong', {}, [{ type: 'text', value: labels[i] ?? '' }])]),
      ...panel.children.map(clean).filter(Boolean),
    ]),
  );
}

function clean(node) {
  if (node.type === 'comment') return null;
  if (node.type !== 'element') return node;
  if (
    DROPPED_TAGS.has(node.tagName) ||
    hasClass(node, 'sl-anchor-link') ||
    node.properties?.ariaHidden === true ||
    node.properties?.ariaHidden === 'true'
  ) {
    return null;
  }
  if (hasClass(node, 'expressive-code')) return codeBlock(node);
  if (node.tagName === 'starlight-tabs') return tabs(node);

  return {
    ...node,
    tagName: node.tagName === 'aside' ? 'blockquote' : node.tagName,
    children: node.children.map(clean).filter(Boolean),
  };
}

const processor = unified()
  .use(rehypeParse)
  .use(rehypeRemark)
  .use(remarkGfm)
  .use(remarkStringify, { bullet: '-', fences: true });

function htmlToMarkdown(html, siteName) {
  const tree = unified().use(rehypeParse).parse(html);
  const content = find(tree, (n) => hasClass(n, 'sl-markdown-content'));
  if (!content) return undefined;

  const title = textOf(find(tree, (n) => n.tagName === 'title') ?? { type: 'text', value: '' })
    .replace(new RegExp(`\\s*\\|\\s*${siteName}$`), '')
    .trim();
  const description = find(
    tree,
    (n) => n.tagName === 'meta' && n.properties?.name === 'description',
  )?.properties.content;

  const body = processor.stringify(processor.runSync({ type: 'root', children: [clean(content)] }));
  return `# ${title}\n\n${description ? `> ${description}\n\n` : ''}${body}`;
}

/**
 * Writes a Markdown copy of every documentation page next to its HTML, at `<page>.md`.
 * @param {{ siteName: string }} options
 * @returns {import('astro').AstroIntegration}
 */
export default function markdownPages({ siteName }) {
  return {
    name: 'markdown-pages',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const outDir = fileURLToPath(dir);
        let count = 0;
        for (const file of fs.readdirSync(outDir, { recursive: true, encoding: 'utf8' })) {
          if (!file.endsWith('index.html')) continue;
          const markdown = htmlToMarkdown(
            fs.readFileSync(path.join(outDir, file), 'utf8'),
            siteName,
          );
          if (!markdown) continue;
          const route = path.dirname(file);
          fs.writeFileSync(path.join(outDir, route === '.' ? 'index.md' : `${route}.md`), markdown);
          count++;
        }
        logger.info(`Wrote ${count} Markdown pages`);
      },
    },
  };
}
