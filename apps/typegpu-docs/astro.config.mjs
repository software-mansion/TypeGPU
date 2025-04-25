// @ts-check

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';
import starlightBlog from 'starlight-blog';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';
import typegpu from 'unplugin-typegpu/rollup';

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
    // Allowing query params, for invalidation
    plugins: [typegpu({ include: [/\.m?[jt]sx?/] })],
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
        DEV && {
          label: 'Ecosystem',
          items: stripFalsy([
            {
              label: '@typegpu/noise',
              slug: 'ecosystem/typegpu-noise',
            },
            {
              label: '@typegpu/color',
              slug: 'ecosystem/typegpu-color',
            },
            {
              label: 'Third-party',
              slug: 'ecosystem/third-party',
            },
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
              label: 'React Native',
              slug: 'integration/react-native',
            },
            {
              label: 'WESL Interoperability',
              slug: 'integration/wesl-interoperability',
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
              label: 'Build Plugin',
              slug: 'tooling/unplugin-typegpu',
            },
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
            DEV && {
              label: 'Naming Convention',
              slug: 'reference/naming-convention',
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
