import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORGANIZATION_ID = 'https://swmansion.com/#organization';

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

// Sidebar entries without a group are collected under one heading
function sidebarSections(sidebar) {
  const sections = [];
  for (const entry of sidebar) {
    if (entry.items) {
      sections.push({ label: entry.label, items: entry.items.filter((item) => item.slug) });
    } else if (entry.slug) {
      const last = sections.at(-1);
      if (last?.ungrouped) last.items.push(entry);
      else sections.push({ label: 'Start here', ungrouped: true, items: [entry] });
    }
  }
  return sections;
}

function buildLlmsTxt({ description, name, preamble, prefix, readPage, sidebar }) {
  const lines = [`# ${name}`];
  if (description) lines.push('', `> ${description}`);
  if (preamble) lines.push('', preamble.trim());

  for (const section of sidebarSections(sidebar)) {
    const entries = section.items.flatMap(({ label, slug }) => {
      const html = readPage(slug);
      if (html === undefined) return [];
      const detail = decode(
        /<meta[^>]+name="description"[^>]+content="([^"]*)"/i.exec(html)?.[1] ?? '',
      );
      return [`- [${label}](${prefix}${slug}.md)${detail ? `: ${detail}` : ''}`];
    });
    if (entries.length) lines.push('', `## ${section.label}`, '', ...entries);
  }

  lines.push(
    '',
    '## About',
    '',
    `- [Software Mansion](https://swmansion.com): maintainer of ${name}`,
    '',
  );

  return lines.join('\n');
}

/**
 * @typedef {{ label: string, slug?: string, items?: { label: string, slug?: string }[] }} SidebarEntry
 * @param {{ description?: string, name?: string, preamble?: string, repository?: string, sidebar?: SidebarEntry[] }} [options]
 */
export default function swmGeo({ description, name, preamble, sidebar = [] } = {}) {
  let site = 'https://docs.swmansion.com';
  let base = '/';

  return {
    name: 'swm-geo',
    hooks: {
      'astro:config:done': ({ config }) => {
        if (config.site) site = String(config.site).replace(/\/$/, '');
        base = `/${String(config.base ?? '/').replace(/^\/|\/$/g, '')}/`.replace('//', '/');
      },
      'astro:build:done': ({ dir }) => {
        const outDir = fileURLToPath(dir);
        fs.writeFileSync(
          path.join(outDir, 'llms.txt'),
          buildLlmsTxt({
            description,
            name,
            preamble,
            prefix: `${site}${base}`,
            readPage: (slug) => {
              const file = path.join(outDir, slug, 'index.html');
              return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
            },
            sidebar,
          }),
          'utf8',
        );
      },
    },
  };
}
