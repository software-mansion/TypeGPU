// @ts-check

import react from '@astrojs/react';
import swmGeo, { structuredData } from './swm-geo.mjs';
import markdownPages from './markdown-pages.mjs';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import tailwindVite from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { version } from 'typegpu/package.json';
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

const sidebar = stripFalsy([
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
      {
        label: 'Minifying & Obfuscating Shaders',
        slug: 'advanced/minifying-shaders',
        badge: { text: 'new' },
      },
      DEV && {
        label: 'Naming Convention',
        slug: 'advanced/naming-convention',
        badge: { text: 'dev', variant: 'note' },
      },
      DEV && {
        label: 'Explaining the Magic',
        slug: 'advanced/explaining-the-magic',
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
        label: 'React Native Worklets',
        slug: 'integration/react-native/worklets',
        badge: { text: 'experimental' },
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
        label: '@typegpu/gl',
        slug: 'ecosystem/typegpu-gl',
        badge: { text: 'experimental' },
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
        label: 'TypeGPU CLI',
        slug: 'tooling/typegpu-cli',
        badge: { text: 'new' },
      },
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
        label: 'AI Tools',
        slug: 'tooling/ai-tools',
        badge: { text: 'new' },
      },
      {
        label: 'WGSL to TypeGPU',
        slug: 'tooling/tgpu-gen',
      },
    ]),
  },
  {
    label: 'Migrations',
    items: stripFalsy([
      {
        label: 'Migrating to 0.12',
        slug: 'migrations/0-12',
      },
      {
        label: 'Migrating to 0.11',
        slug: 'migrations/0-11',
      },
    ]),
  },
]);

const agentPreamble = `TypeGPU ${version} is a TypeScript toolkit for WebGPU. Its API is newer than most models' training data.

- In a project with TypeGPU installed, read node_modules/typegpu/skills/typegpu/SKILL.md first. It matches the installed version, and the .d.ts files in node_modules/typegpu are the exact API.
- The pages below are Markdown. The HTML version of each is at the same URL without .md.

In 'use gpu' functions:

- Write vector and matrix math with operators (a * b, v += d), not std.mul or std.add.
- Vectors, matrices, structs and arrays are references. Copy them (d.vec3f(v)) before assigning to a let, or use const.
- Write d.f32(1) where a float is needed. a / b is always f32; use std.intdiv for integers. Shift u32 right with >>>.
- Use std.* math, not Math.*.
- Write GPU methods as properties (step: () => { 'use gpu'; ... }), not shorthand methods.
- Values captured from the outer scope are baked in as constants. Use uniforms for anything that changes.

Around them:

- Write kernels as tgpu.computeFn with workgroupSize and a bounds check, run with createComputePipeline and dispatchWorkgroups.
- Record each frame into one root.createCommandEncoder() and submit once.
- Take all randomness and noise from @typegpu/noise.`;

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
    resolve: {
      // React islands and their Radix dependencies must share one dispatcher.
      dedupe: ['react', 'react-dom'],
    },
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
    swmGeo({
      name: 'TypeGPU',
      description: 'Type-safe WebGPU toolkit',
      repository: 'TypeGPU',
      preamble: agentPreamble,
      sidebar,
    }),
    markdownPages({ siteName: 'TypeGPU' }),
    starlight({
      head: [
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        },
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap',
          },
        },
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          content: JSON.stringify(
            structuredData({
              name: 'TypeGPU',
              description: 'Type-safe WebGPU toolkit',
              repository: 'TypeGPU',
            }),
          ),
        },
      ],
      title: 'TypeGPU',
      social: [
        {
          icon: 'discord',
          label: 'Join the TypeGPU Discord',
          href: 'https://discord.gg/8jpfgDqPcM',
        },
        {
          icon: 'github',
          label: 'TypeGPU on GitHub',
          href: 'https://github.com/software-mansion/TypeGPU',
        },
      ],
      customCss: [
        './src/tailwind.css',
        './src/fonts/font-face.css',
        './src/mathjax.css',
        './src/starlight-docs.css',
      ],
      plugins: stripFalsy([
        starlightBlog({
          navigation: 'none',
        }),
        // Only generating typedoc in production to speed up the dev server
        !DEV &&
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
        Footer: './src/components/starlight/Footer.astro',
        Head: './src/components/starlight/Head.astro',
        Header: './src/components/starlight/SiteHeader.astro',
        MobileMenuToggle: './src/components/starlight/MobileMenuToggle.astro',
        Sidebar: './src/components/starlight/Sidebar.astro',
      },
      sidebar: [...sidebar, typeDocSidebarGroup],
    }),
    react(),
    sitemap(),
  ],
});
