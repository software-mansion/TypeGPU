import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORGANIZATION_ID = 'https://swmansion.com/#organization';

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const decode = (value) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/g, "'")
    .trim();

// Same @id as swmansion.com, so engines read one company across both domains.
export function structuredData({ description, name, repository }) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ORGANIZATION_ID,
        name: 'Software Mansion',
        url: 'https://swmansion.com',
        sameAs: [
          'https://github.com/software-mansion',
          'https://www.linkedin.com/company/software-mansion/',
          'https://twitter.com/swmansion',
          'https://www.youtube.com/c/SoftwareMansion',
        ],
      },
      {
        '@type': 'SoftwareSourceCode',
        name,
        ...(description ? { description } : {}),
        ...(repository
          ? {
              codeRepository: `https://github.com/software-mansion/${repository}`,
            }
          : {}),
        author: { '@id': ORGANIZATION_ID },
        maintainer: { '@id': ORGANIZATION_ID },
      },
    ],
  };
}

function collect(dir, root = dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, root, found);
    else if (entry.name.endsWith('.html') && entry.name !== '404.html')
      found.push(path.relative(root, full));
  }
  return found;
}

export function buildLlmsTxt({ description, files, name, prefix, readFile }) {
  const entries = [];

  for (const file of files) {
    const html = readFile(file);
    const raw = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
    const title = decode(raw).replace(
      new RegExp(`\\s*[|·]\\s*${escapeRegExp(name)}$`),
      '',
    );
    if (!title) continue;

    const detail = decode(
      /<meta[^>]+name="description"[^>]+content="([^"]*)"/i.exec(html)?.[1] ??
        '',
    );
    const route = file.replace(/index\.html$/, '').replace(/\.html$/, '');
    entries.push(
      `- [${title}](${prefix}${route})${detail ? `: ${detail}` : ''}`,
    );
  }

  const lines = [`# ${name}`];
  if (description) lines.push('', `> ${description}`);
  if (entries.length) lines.push('', '## Documentation', '', ...entries.sort());
  lines.push(
    '',
    '## About',
    '',
    `- [Software Mansion](https://swmansion.com): maintainer of ${name}`,
    '',
  );

  return lines.join('\n');
}

export default function swmGeo({ description, name, repository } = {}) {
  let site = 'https://docs.swmansion.com';
  let base = '/';

  return {
    name: 'swm-geo',
    hooks: {
      'astro:config:done': ({ config }) => {
        if (config.site) site = String(config.site).replace(/\/$/, '');
        base =
          `/${String(config.base ?? '/').replace(/^\/|\/$/g, '')}/`.replace(
            '//',
            '/',
          );
      },
      'astro:build:done': ({ dir }) => {
        const outDir = fileURLToPath(dir);
        fs.writeFileSync(
          path.join(outDir, 'llms.txt'),
          buildLlmsTxt({
            description,
            files: collect(outDir),
            name,
            prefix: `${site}${base}`,
            readFile: (file) =>
              fs.readFileSync(path.join(outDir, file), 'utf8'),
          }),
          'utf8',
        );
      },
    },
  };
}
