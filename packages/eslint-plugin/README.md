<div align="center">

# eslint-plugin-typegpu

TypeGPU specific linting rules for ESLint.

[Docs](https://docs.swmansion.com/TypeGPU/tooling/eslint-plugin-typegpu/) -- [GitHub](https://github.com/software-mansion/TypeGPU/tree/main/packages/eslint-plugin) -- [npm](https://www.npmjs.com/package/eslint-plugin-typegpu)

</div>

## Installation

`npm add -D eslint-plugin-typegpu`

After installing, the plugin needs to be configured.

## Configuration

Configuration depends on the linter used. 

In eslint, either define the used rules manually, or use one of the configs provided by the plugin.

```ts
import { defineConfig } from "eslint/config";
import typegpu from "eslint-plugin-typegpu";

export default defineConfig([
// other configs
  typegpu.configs.recommended,
]);
```

`eslint-plugin-typegpu` provides two configs: `all` (enabled on all rules) and `recommended`.

## List of supported rules

<!-- begin auto-generated rules list -->

🚨 Configurations enabled in.\
⚠️ Configurations set to warn in.\
💤 Configurations disabled in.\
⭐ Set in the `recommended` configuration.

| Name                                                                   | Description                                                                                 | 🚨 | ⚠️ | 💤 |
| :--------------------------------------------------------------------- | :------------------------------------------------------------------------------------------ | :- | :- | :- |
| [no-integer-division](docs/rules/no-integer-division.md)               | Disallow division incorporating numbers wrapped in 'u32' and 'i32'                          |    | ⭐  |    |
| [no-math](docs/rules/no-math.md)                                       | Disallow usage of JavaScript 'Math' methods inside 'use gpu' functions                      |    | ⭐  |    |
| [no-uninitialized-variables](docs/rules/no-uninitialized-variables.md) | Disallow variable declarations without initializers inside 'use gpu' functions              | ⭐  |    |    |
| [no-unwrapped-objects](docs/rules/no-unwrapped-objects.md)             | Disallow unwrapped Plain Old JavaScript Objects inside 'use gpu' functions (except returns) |    |    | ⭐  |

<!-- end auto-generated rules list -->
