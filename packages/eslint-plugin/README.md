<div align="center">

# eslint-plugin-typegpu

TypeGPU specific linting rules for ESLint.

[Docs](https://docs.swmansion.com/TypeGPU/tooling/eslint-plugin-typegpu/) -- [GitHub](https://github.com/software-mansion/TypeGPU/tree/main/packages/eslint-plugin) -- [npm](https://www.npmjs.com/package/eslint-plugin-typegpu)

</div>

## Installataion

`npm add -D eslint-plugin-typegpu`

After installing, the plugin needs to be configured.

## Configuration

Configuration depends on the linter used. 

In eslint, either define the used rules manually, or use one of the configs provided by the plugin.

```ts
import typegpu from "eslint-plugin-typegpu";

export default defineConfig([
// other configs
  typegpu.configs.recommended,
]);
```

## List of supported rules

