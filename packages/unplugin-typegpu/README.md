<div align="center">

# unplugin-typegpu

[GitHub](https://github.com/software-mansion/TypeGPU/tree/main/packages/unplugin-typegpu)

Read more about the plugin in the
[TypeGPU documentation](https://docs.swmansion.com/TypeGPU/tooling/unplugin-typegpu/).

</div>

A set of bundler plugins that enhance [TypeGPU](https://typegpu.com) with:

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

void plugin(typegpu());
```

## TypeGPU is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with
experience in building web and mobile apps. We are Core React Native
Contributors and experts in dealing with all kinds of React Native issues. We
can help you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=typegpu&utm_medium=readme).
