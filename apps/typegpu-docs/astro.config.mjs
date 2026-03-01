// @ts-check

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import tailwindVite from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import starlightBlog from 'starlight-blog';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';
import typegpu from 'unplugin-typegpu/rollup';
import { imagetools } from 'vite-imagetools';
import wasm from 'vite-plugin-wasm';
import basicSsl from '@vitejs/plugin-basic-ssl';
import rehypeMathJax from 'rehype-mathjax';
import remarkMath from 'remark-math';

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
  server: {
    // Required for '@rolldown/browser' to work in dev mode.
    // Since the service worker is hosted on the /TypeGPU path,
    // fetches from /@fs/ fail due to CORS. This fixes that.
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeMathJax],
  },
  vite: {
    define: {
      // Required for '@rolldown/browser' to work.
      'process.env.NODE_DEBUG_NATIVE': '""',
    },
    optimizeDeps: {
      exclude: ['@rolldown/browser', 'onnxruntime-web'],
    },
    // Allowing query params, for invalidation
    plugins: [
      wasm(),
      tailwindVite(),
      typegpu({ include: [/\.m?[jt]sx?/] }),
      imagetools(),
      {
        ...basicSsl(),
        apply(_, { mode }) {
          return DEV && mode === 'https';
        },
      },
    ],
    ssr: {
      noExternal: ['wgsl-wasm-transpiler-bundler', '@rolldown/browser', 'onnxruntime-web'],
    },
  },
  integrations: [
    starlight({
      title: 'TypeGPU',
      customCss: ['./src/tailwind.css', './src/fonts/font-face.css', './src/mathjax.css'],
      plugins: stripFalsy([
        starlightBlog({
          navigation: 'none',
        }),
        starlightTypeDoc({
          entryPoints: [
            '../../packages/typegpu/src/index.d.ts',
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
      social: [
        {
          label: 'GitHub',
          href: 'https://github.com/software-mansion/TypeGPU',
          icon: 'github',
        },
      ],
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
              label: 'Pipelines',
              slug: 'fundamentals/pipelines',
              badge: { text: 'new' },
            },
            {
              label: 'Buffers',
              slug: 'fundamentals/buffers',
            },
            {
              label: 'Textures',
              slug: 'fundamentals/textures',
              badge: { text: 'new' },
            },
            {
              label: 'Variables',
              slug: 'fundamentals/variables',
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
            },
            {
              label: 'Enabling Features',
              slug: 'fundamentals/enabling-features',
            },
            {
              label: 'Timing Your Pipelines',
              slug: 'fundamentals/timestamp-queries',
            },
            {
              label: 'Slots',
              slug: 'fundamentals/slots',
            },
            {
              label: 'Utilities',
              slug: 'fundamentals/utils',
              badge: { text: 'new' },
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
          label: 'Ecosystem',
          items: stripFalsy([
            {
              label: '@typegpu/noise',
              slug: 'ecosystem/typegpu-noise',
            },
            {
              label: '@typegpu/three',
              slug: 'ecosystem/typegpu-three',
            },
            {
              label: '@typegpu/sdf',
              slug: 'ecosystem/typegpu-sdf',
            },
            DEV && {
              label: '@typegpu/color',
              slug: 'ecosystem/typegpu-color',
            },
            DEV && {
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
              label: 'From a Triangle to Simulating Boids: Step-by-step Tutorial',
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
            DEV && {
              label: 'Naming Convention',
              slug: 'reference/naming-convention',
            },
            DEV && {
              label: 'Shader Generation',
              slug: 'reference/shader-generation',
            },
            typeDocSidebarGroup,
          ]),
        },
      ]),
    }),
    react(),
    sitemap(),
  ],
});
