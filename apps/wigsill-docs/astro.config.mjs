import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

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
        {
          label: 'Reference',
          autogenerate: {
            directory: 'reference',
          },
        },
      ],
    }),
    tailwind(),
  ],
});
