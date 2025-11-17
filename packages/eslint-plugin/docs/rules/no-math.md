# typegpu/no-math

📝 Disallow usage of JavaScript 'Math' methods inside 'use gpu' functions.

⚠️ This rule _warns_ in the ⭐ `recommended` config.

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
const fn = () => { 
  'use gpu';
  const a = std.sin(Math.PI);
}
```
```ts
// outside 'use gpu'
const a = Math.sin(1);
```