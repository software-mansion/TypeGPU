import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';

import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
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
          label: 'Guides',
          items: [
            // Each item here is one entry in the navigation menu.
            {
              label: 'Getting Started',
              slug: 'guides/getting-started',
            },
            {
              label: 'Parametrized Functions',
              slug: 'guides/parametrized-functions',
            },
          ],
        },
        typeDocSidebarGroup,
      ],
      plugins: [
        // Generate the documentation.
        starlightTypeDoc({
          entryPoints: [
            '../../packages/wigsill/src',
            '../../packages/wigsill/src/data',
            '../../packages/wigsill/src/macro',
            '../../packages/wigsill/src/web',
          ],
          tsconfig: '../../packages/wigsill/tsconfig.json',
        }),
      ],
    }),
    tailwind(),
  ],
});
