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
  items.filter(/** @return {item is Exclude<T, false>} */ (item) => !!item);

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
      },
      social: {
        github: 'https://github.com/software-mansion/TypeGPU',
      },
      sidebar: stripFalsy([
        {
          label: 'Live Examples',
          link: 'examples',
          // attrs: {
          //   'data-astro-reload': true,
          // },
        },
        {
          label: 'Guides',
          items: stripFalsy([
            // Each item here is one entry in the navigation menu.
            {
              label: 'Getting Started',
              slug: 'guides/getting-started',
            },
            DEV && {
              label: 'Roots',
              slug: 'guides/roots',
              badge: { text: 'new', variant: 'default' },
            },
            {
              label: 'Typed Buffers',
              slug: 'guides/tgpu-buffer-api',
            },
            {
              label: 'Defining Data Types',
              slug: 'guides/defining-data-types',
            },
            DEV && {
              label: 'Generating JS from WGSL',
              slug: 'guides/generating-js-from-wgsl',
            },
            DEV && {
              label: 'TypeGPU CLI',
              slug: 'guides/tgpu-cli',
              badge: { text: 'new', variant: 'default' },
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
              label: 'Working with wgpu-matrix',
              slug: 'guides/wgpu-matrix-integration',
              badge: { text: 'new', variant: 'default' },
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
          label: 'FAQ',
          slug: 'faq',
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
