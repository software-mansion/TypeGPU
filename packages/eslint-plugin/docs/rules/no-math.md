# typegpu/no-math

📝 Disallow usage of JavaScript 'Math' methods inside 'use gpu' functions.

💼⚠️ This rule is enabled in the 🌐 `all` config. This rule _warns_ in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule details

Examples of **incorrect** code for this rule:

```ts
const fn = () => { 
  'use gpu';
  const vec = Math.sin(0);
}
```

Examples of **correct** code for this rule:

```ts
const a = Math.sin(1);
```
```ts
const fn = () => { 
  'use gpu';
  const a = std.sin(Math.PI);
}
```
