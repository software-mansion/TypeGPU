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

<!-- begin auto-generated rules list -->

💼 Configurations enabled in.\
⚠️ Configurations set to warn in.\
🌐 Set in the `all` configuration.\
✅ Set in the `recommended` configuration.

| Name                                                           | Description                                                                                | 💼 | ⚠️ |
| :------------------------------------------------------------- | :----------------------------------------------------------------------------------------- | :- | :- |
| [integer-division](docs/rules/integer-division.md)             | Avoid dividing numbers wrapped in 'u32' and 'i32'.                                         | 🌐 | ✅  |
| [math](docs/rules/math.md)                                     | Disallow usage of JavaScript 'Math' methods inside 'use gpu' functions; use 'std' instead. | 🌐 | ✅  |
| [uninitialized-variable](docs/rules/uninitialized-variable.md) | Always assign an initial value when declaring a variable inside TypeGPU functions.         | 🌐 | ✅  |
| [unwrapped-pojo](docs/rules/unwrapped-pojo.md)                 | Wrap Plain Old JavaScript Objects with schemas.                                            | 🌐 | ✅  |

<!-- end auto-generated rules list -->
