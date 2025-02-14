// @ts-check

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';
import starlightBlog from 'starlight-blog';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';
import typegpu from 'unplugin-typegpu/rollup';
import importRawRedirectPlugin from './vite-import-raw-redirect-plugin.mjs';

/**
 * @template T
 * @param {T[]} items
 */
const stripFalsy = (items) =>
  items.filter(/** @return {item is Exclude<T, boolean>} */ (item) => !!item);

const DEV = import.meta.env.DEV;

/**
 * Plugin that converts code transformed by the `typegpu` plugin to a raw string.
 * @returns {{
 *   name: string;
 *   enforce: 'post';
 *   transform(code: string, id: string): { code: string } | undefined;
 * }}
 */
function toRawPlugin() {
  return {
    name: 'to-raw',
    enforce: 'post',

    transform(code, id) {
      if (id.endsWith('?tgpu=true')) {
        return {
          code: `export default ${JSON.stringify(code)
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029')};`,
        };
      }
    },
  };
}

// https://astro.build/config
export default defineConfig({
  site: 'https://docs.swmansion.com',
  base: 'TypeGPU',
  vite: {
    plugins: [
      typegpu({ include: [/tgpu=true/] }),
      toRawPlugin(),
      importRawRedirectPlugin({
        'typegpu/dist/index.d.ts?raw': '../../packages/typegpu/dist/index.d.ts',
        'typegpu/dist/data/index.d.ts?raw':
          '../../packages/typegpu/dist/data/index.d.ts',
        'typegpu/dist/std/index.d.ts?raw':
          '../../packages/typegpu/dist/std/index.d.ts',
      }),
    ],
  },
  integrations: [
    starlight({
      title: 'TypeGPU',
      customCss: ['./src/tailwind.css', './src/fonts/font-face.css'],
      plugins: stripFalsy([
        starlightBlog(),
        DEV &&
          starlightTypeDoc({
            entryPoints: [
              '../../packages/typegpu/src/index.ts',
              '../../packages/typegpu/src/data/index.ts',
              '../../packages/typegpu/src/std/index.ts',
            ],
            tsconfig: '../../packages/typegpu/tsconfig.json',
            typeDoc: {
              excludeInternal: true,
              excludeReferences: true,
            },
          }),
      ]),
      logo: {
        light: './src/assets/typegpu-logo-light.svg',
        dark: './src/assets/typegpu-logo-dark.svg',
        alt: 'TypeGPU Logo',
        replacesTitle: true,
      },
      components: {
        Head: './src/components/starlight/Head.astro',
        ThemeSelect: './src/components/starlight/ThemeSelect.astro',
        Sidebar: './src/components/starlight/Sidebar.astro',
      },
      social: {
        github: 'https://github.com/software-mansion/TypeGPU',
      },
      sidebar: stripFalsy([
        {
          label: 'Why TypeGPU?',
          slug: 'why-typegpu',
        },
        {
          label: 'Getting Started',
          slug: 'getting-started',
        },
        {
          label: 'Fundamentals',
          items: stripFalsy([
            {
              label: 'Roots',
              slug: 'fundamentals/roots',
            },
            {
              label: 'Functions',
              slug: 'fundamentals/functions',
            },
            {
              label: 'Buffers',
              slug: 'fundamentals/buffers',
            },
            {
              label: 'Data Schemas',
              slug: 'fundamentals/data-schemas',
            },
            {
              label: 'Bind Groups',
              slug: 'fundamentals/bind-groups',
            },
            {
              label: 'Resolve',
              slug: 'fundamentals/resolve',
            },
            {
              label: 'Vertex Layouts',
              slug: 'fundamentals/vertex-layouts',
              badge: { text: '0.4' },
            },
            DEV && {
              label: 'Slots',
              slug: 'fundamentals/slots',
            },
            // {
            //   label: 'Basic Principles',
            //   slug: 'guides/basic-principles',
            // },
            // {
            //   label: 'State Management',
            //   slug: 'guides/state-management',
            // },
            // {
            //   label: 'Parametrized Functions',
            //   slug: 'guides/parametrized-functions',
            // },
          ]),
        },
        {
          label: 'Integration',
          items: stripFalsy([
            {
              label: 'WebGPU Interoperability',
              slug: 'integration/webgpu-interoperability',
            },
            {
              label: 'Working with wgpu-matrix',
              slug: 'integration/working-with-wgpu-matrix',
            },
          ]),
        },
        {
          label: 'Tooling',
          items: stripFalsy([
            {
              label: 'Generator CLI',
              slug: 'tooling/tgpu-gen',
            },
          ]),
        },
        DEV && {
          label: 'Tutorials',
          items: [
            {
              label:
                'From a Triangle to Simulating Boids: Step-by-step Tutorial',
              slug: 'tutorials/triangle-to-boids',
            },
            {
              label: 'Game of life tutorial',
              slug: 'tutorials/game-of-life',
            },
          ],
        },
        {
          label: 'Reference',
          items: stripFalsy([
            {
              label: 'Data Schema Cheatsheet',
              slug: 'reference/data-schema-cheatsheet',
            },
            DEV && typeDocSidebarGroup,
          ]),
        },
      ]),
    }),
    tailwind({
      applyBaseStyles: false,
    }),
    react(),
    sitemap(),
  ],
});
