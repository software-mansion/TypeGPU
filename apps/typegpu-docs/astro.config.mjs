// import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';
import importRawRedirectPlugin from './vite-import-raw-redirect-plugin';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [
      importRawRedirectPlugin({
        'typegpu/dist/index.d.ts?raw': '../../packages/typegpu/dist/index.d.ts',
        'typegpu/dist/data/index.d.ts?raw':
          '../../packages/typegpu/dist/data/index.d.ts',
        'typegpu/dist/macro/index.d.ts?raw':
          '../../packages/typegpu/dist/macro/index.d.ts',
        'typegpu/dist/web/index.d.ts?raw':
          '../../packages/typegpu/dist/web/index.d.ts',
      }),
    ],
  },
  integrations: [
    starlight({
      title: 'TypeGPU',
      logo: {
        light: '/public/typegpu-logo-light.svg',
        dark: '/public/typegpu-logo-dark.svg',
        alt: 'TypeGPU Logo',
        replacesTitle: true,
      },
      components: {
        Head: './src/components/starlight/Head.astro',
      },
      social: {
        github: 'https://github.com/software-mansion/typegpu',
      },
      sidebar: [
        {
          label: '⭐️ Live Examples',
          link: 'examples',
          attrs: {
            'data-astro-reload': true,
          },
        },
        {
          label: 'Guides',
          items: [
            // Each item here is one entry in the navigation menu.
            {
              label: 'Getting Started',
              slug: 'guides/getting-started',
            },
            {
              label: 'Basic Principles',
              slug: 'guides/basic-principles',
            },
            {
              label: 'State Management',
              slug: 'guides/state-management',
            },
            {
              label: 'Parametrized Functions',
              slug: 'guides/parametrized-functions',
            },
          ],
        },
        // typeDocSidebarGroup,
      ],
      plugins: [
        // Generate the documentation.
        // starlightTypeDoc({
        //   entryPoints: [
        //     '../../packages/typegpu/src',
        //     '../../packages/typegpu/src/data',
        //     '../../packages/typegpu/src/macro',
        //     '../../packages/typegpu/src/web',
        //   ],
        //   tsconfig: '../../packages/typegpu/tsconfig.json',
        // }),
      ],
    }),
    tailwind(),
    react(),
  ],
});
