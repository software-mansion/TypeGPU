// @ts-check

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';
import starlightBlog from 'starlight-blog';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';
import importRawRedirectPlugin from './vite-import-raw-redirect-plugin.mjs';

/**
 * @template T
 * @param {T[]} items
 */
const stripFalsy = (items) =>
  items.filter(/** @return {item is Exclude<T, boolean>} */ (item) => !!item);

const DEV = import.meta.env.DEV;

// https://astro.build/config
export default defineConfig({
  site: 'https://docs.swmansion.com',
  base: 'TypeGPU',
  vite: {
    plugins: [
      importRawRedirectPlugin({
        'typegpu/dist/index.d.ts?raw': '../../packages/typegpu/dist/index.d.ts',
        'typegpu/dist/data/index.d.ts?raw':
          '../../packages/typegpu/dist/data/index.d.ts',
        'typegpu/dist/experimental/index.d.ts?raw':
          '../../packages/typegpu/dist/experimental/index.d.ts',
        '@typegpu/jit/dist/index.d.ts?raw':
          '../../packages/jit/dist/index.d.ts',
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
              badge: { text: '0.2' },
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
              badge: { text: '0.2' },
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
            DEV && {
              label: 'WebGPU Interoperability',
              slug: 'integration/webgpu-interoperability',
              badge: { text: 'new' },
            },
            {
              label: 'Working with wgpu-matrix',
              slug: 'integration/working-with-wgpu-matrix',
              badge: { text: 'new' },
            },
          ]),
        },
        {
          label: 'Tooling',
          items: stripFalsy([
            {
              label: 'Generator CLI',
              slug: 'tooling/tgpu-gen',
              badge: { text: 'new' },
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
