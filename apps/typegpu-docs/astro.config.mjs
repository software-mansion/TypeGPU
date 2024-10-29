// @ts-check

// import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';
import starlightBlog from 'starlight-blog';
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
        'typegpu/dist/macro/index.d.ts?raw':
          '../../packages/typegpu/dist/macro/index.d.ts',
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
      plugins: [starlightBlog()],
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
            DEV && {
              label: 'Roots',
              slug: 'fundamentals/roots',
              badge: { text: '0.2', variant: 'default' },
            },
            {
              label: 'Buffers',
              slug: 'fundamentals/buffers',
            },
            {
              label: 'Data Schemas',
              slug: 'fundamentals/data-schemas',
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
          label: 'Tooling',
          items: [
            DEV && {
              label: 'TypeGPU Generator CLI',
              slug: 'tooling/tgpu-gen',
              badge: { text: 'new', variant: 'default' },
            },
          ],
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
      ]),
    }),
    tailwind({
      applyBaseStyles: false,
    }),
    react(),
    sitemap(),
  ],
});
