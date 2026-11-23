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

function findAll(node, test) {
  return test(node) ? [node] : (node.children ?? []).flatMap((child) => findAll(child, test));
}

const element = (tagName, properties, children) => ({
  type: 'element',
  tagName,
  properties,
  children,
});

// The copy button holds the code as displayed, without Twoslash popups or cut setup lines,
// but it also drops the markers of diff lines, so those blocks are rebuilt from the lines
function codeBlock(node) {
  const lines = findAll(node, (n) => hasClass(n, 'ec-line'));
  const isDiff = lines.some((line) => hasClass(line, 'del') || hasClass(line, 'ins'));
  const code = isDiff
    ? lines
        .map((line) => {
          const marker = hasClass(line, 'del') ? '-' : hasClass(line, 'ins') ? '+' : ' ';
          return marker + textOf(find(line, (n) => hasClass(n, 'code')) ?? line);
        })
        .join('\n')
    : String(
        find(node, (n) => n.properties?.dataCode !== undefined)?.properties.dataCode ?? '',
      ).replaceAll('\x7f', '\n');
  const language = isDiff
    ? 'diff'
    : find(node, (n) => n.tagName === 'pre')?.properties.dataLanguage;
  const title = textOf(find(node, (n) => hasClass(n, 'title')) ?? { type: 'text', value: '' });
  const pre = element('pre', {}, [
    element('code', language ? { className: [`language-${language}`] } : {}, [
      { type: 'text', value: code },
    ]),
  ]);
  if (!title) return pre;
  return element('div', {}, [
    element('p', {}, [
      element('strong', {}, [element('code', {}, [{ type: 'text', value: title }])]),
    ]),
    pre,
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
    node.properties?.ariaHidden === 'true'
  ) {
    return null;
  }
  if (hasClass(node, 'expressive-code')) return codeBlock(node);
  if (node.tagName === 'starlight-tabs') return tabs(node);

  const children = node.children.map(clean).filter(Boolean);
  if (hasClass(node, 'starlight-aside')) {
    const label = node.properties.ariaLabel;
    return element('blockquote', {}, [
      element('p', {}, [element('strong', {}, [{ type: 'text', value: label }])]),
      ...children,
    ]);
  }
  return { ...node, children };
}

const processor = unified()
  .use(rehypeParse)
  .use(rehypeRemark)
  .use(remarkGfm)
  .use(remarkStringify, { bullet: '-', fences: true });

function htmlToMarkdown(html, siteName) {
  const tree = processor.parse(html);
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
