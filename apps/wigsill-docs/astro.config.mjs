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
        'wigsill/dist/index.d.ts?raw': '../../packages/wigsill/dist/index.d.ts',
        'wigsill/dist/data/index.d.ts?raw':
          '../../packages/wigsill/dist/data/index.d.ts',
        'wigsill/dist/macro/index.d.ts?raw':
          '../../packages/wigsill/dist/macro/index.d.ts',
        'wigsill/dist/web/index.d.ts?raw':
          '../../packages/wigsill/dist/web/index.d.ts',
      }),
    ],
  },
  integrations: [
    starlight({
      title: 'wigsill',
      logo: {
        light: '/public/wigsill-logo-light.svg',
        dark: '/public/wigsill-logo-dark.svg',
        alt: 'Wigsill Logo',
        replacesTitle: true,
      },
      components: {
        Head: './src/components/starlight/Head.astro',
      },
      social: {
        github: 'https://github.com/software-mansion-labs/wigsill',
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
        //     '../../packages/wigsill/src',
        //     '../../packages/wigsill/src/data',
        //     '../../packages/wigsill/src/macro',
        //     '../../packages/wigsill/src/web',
        //   ],
        //   tsconfig: '../../packages/wigsill/tsconfig.json',
        // }),
      ],
    }),
    tailwind(),
    react(),
  ],
});
