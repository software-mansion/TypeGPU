// @ts-check

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import tailwindVite from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import starlightBlog from 'starlight-blog';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';
import typegpu from 'unplugin-typegpu/rollup';
import { comptime } from 'comptime/vite';
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
        ...comptime({ timeout: 60_000 }),
        enforce: 'post',
      },
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
          sidebar: {
            label: 'Reference',
          },
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
              label: 'Your first GPU program',
              slug: 'fundamentals/your-first-gpu-program',
              badge: { text: 'new' },
            },
            {
              label: 'Going parallel with reusable resources',
              slug: 'fundamentals/compute-shaders',
              badge: { text: 'new' },
            },
            {
              label: 'Vertices and fragments',
              slug: 'fundamentals/vertices-and-fragments',
              badge: { text: 'new' },
            },
          ]),
        },
        {
          label: 'APIs',
          items: stripFalsy([
            {
              label: 'Roots',
              slug: 'apis/roots',
            },
            {
              label: 'Functions',
              slug: 'apis/functions',
            },
            {
              label: 'Pipelines',
              slug: 'apis/pipelines',
              badge: { text: 'new' },
            },
            {
              label: 'Buffers',
              slug: 'apis/buffers',
            },
            {
              label: 'Textures',
              slug: 'apis/textures',
              badge: { text: 'new' },
            },
            {
              label: 'Variables',
              slug: 'apis/variables',
            },
            {
              label: 'Data Schemas',
              slug: 'apis/data-schemas',
            },
            {
              label: 'Bind Groups',
              slug: 'apis/bind-groups',
            },
            {
              label: 'Resolve',
              slug: 'apis/resolve',
            },
            {
              label: 'Vertex Layouts',
              slug: 'apis/vertex-layouts',
            },

            {
              label: 'Slots',
              slug: 'apis/slots',
            },
            {
              label: 'Accessors',
              slug: 'apis/accessors',
            },
            {
              label: 'Utilities',
              slug: 'apis/utils',
              badge: { text: 'new' },
            },
          ]),
        },
        {
          label: 'Advanced',
          items: stripFalsy([
            {
              label: 'Enabling Features',
              slug: 'advanced/enabling-features',
            },
            {
              label: 'Timing Your Pipelines',
              slug: 'advanced/timestamp-queries',
            },
            DEV && {
              label: 'Naming Convention',
              slug: 'advanced/naming-convention',
              badge: { text: 'dev', variant: 'note' },
            },
            DEV && {
              label: 'Shader Generation',
              slug: 'advanced/shader-generation',
              badge: { text: 'dev', variant: 'note' },
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
              label: '@typegpu/react',
              slug: 'ecosystem/typegpu-react',
            },
            {
              label: '@typegpu/sdf',
              slug: 'ecosystem/typegpu-sdf',
            },
            {
              label: '@typegpu/radiance-cascades',
              slug: 'ecosystem/typegpu-radiance-cascades',
            },
            DEV && {
              label: '@typegpu/color',
              slug: 'ecosystem/typegpu-color',
              badge: { text: 'dev', variant: 'note' },
            },
            DEV && {
              label: 'Third-party',
              slug: 'ecosystem/third-party',
              badge: { text: 'dev', variant: 'note' },
            },
          ]),
        },
        DEV && {
          label: 'Tutorials',
          items: [
            {
              label: 'From a Triangle to Simulating Boids: Step-by-step Tutorial',
              slug: 'tutorials/triangle-to-boids',
              badge: { text: 'dev', variant: 'note' },
            },
            {
              label: 'Game of life tutorial',
              slug: 'tutorials/game-of-life',
              badge: { text: 'dev', variant: 'note' },
            },
          ],
        },
        {
          label: 'Tooling',
          items: stripFalsy([
            {
              label: 'Build Plugin',
              slug: 'tooling/unplugin-typegpu',
            },
            {
              label: 'Lint Plugin',
              slug: 'tooling/eslint-plugin-typegpu',
              badge: { text: 'new' },
            },
            {
              label: 'Generator CLI',
              slug: 'tooling/tgpu-gen',
            },
          ]),
        },
        typeDocSidebarGroup,
      ]),
    }),
    react(),
    sitemap(),
  ],
});
