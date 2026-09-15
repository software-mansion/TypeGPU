<div align="center">

# unplugin-typegpu

[GitHub](https://github.com/software-mansion/TypeGPU/tree/main/packages/unplugin-typegpu)

Read more about the plugin in the
[TypeGPU documentation](https://docs.swmansion.com/TypeGPU/tooling/unplugin-typegpu/).

</div>

A set of bundler plugins and runtime hooks that enhance [TypeGPU](https://typegpu.com) with:

- JavaScript/TypeScript shader support ('use gpu' directive)
- Improved debugging with automatic naming of resources

## Getting Started

```sh
npm install unplugin-typegpu
```

- babel

```js
// babel.config.js (React Native with Expo)

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['unplugin-typegpu/babel'],
  };
};
```

- vite

```ts
// vite.config.js

import { defineConfig } from 'vite';
import typegpu from 'unplugin-typegpu/vite';

export default defineConfig({
  plugins: [typegpu()],
});
```

- bun

```ts
// preload.ts

import { plugin } from 'bun';
import typegpu from 'unplugin-typegpu/bun';

await plugin(typegpu());
```

Run with `bun --preload ./preload.ts main.ts`, or add
`preload = ["./preload.ts"]` to `bunfig.toml`.
For `Bun.build`, pass `typegpu()` in the `plugins` array instead.
The Bun plugin accepts a single regular expression for `include` and does not
support `exclude`.

- Node.js (22.15+) and Deno (2.8+)

```js
// preload.mjs
import install from 'unplugin-typegpu/node';

const hooks = install(); // Accepts the usual plugin options.
// Call hooks.deregister() to stop transforming future imports.
```

Run with `node --import ./preload.mjs main.ts` or
`deno run --import ./preload.mjs main.ts`. `unplugin-typegpu/deno` is an alias
for the same installer.

The hooks transform `.js`, `.ts`, `.mjs`, `.mts`, `.cjs`, and `.cts` modules.
Deno also handles `.jsx` and `.tsx`; Node.js needs an additional JSX loader.
Node.js's native TypeScript support is limited to erasable syntax by default
and does not use `tsconfig.json`.

Alternatively, call `install()`
in your entry module and then load your application with `await import('./main.ts')`.
Static imports in the module calling `install()` are loaded before the hooks are
installed. Already loaded modules are not transformed retroactively.

## TypeGPU is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with
experience in building web and mobile apps. We are Core React Native
Contributors and experts in dealing with all kinds of React Native issues. We
can help you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=typegpu&utm_medium=readme).
