# typegpu/no-unsupported-syntax

📝 Disallow JS syntax that will not be parsed to correct WGSL.

⚠️ This rule _warns_ in the ⭐ `recommended` config.

<!-- end auto-generated rule header -->

## Rule details

Examples of **incorrect** code for this rule:

```ts
const fn = () => { 
  'use gpu'; 
  const helper = (n) => 2 * n; // ArrowFunctionExpression
  return helper(1);
}
```
```ts
const fn = () => { 
  'use gpu'; 
  const myStruct = Struct({prop: 1});
  const otherStruct = Struct({...myStruct}); // SpreadElement
  return helper(1);
}
```
```ts
const fn = () => { 
  'use gpu'; 
  throw new Error(); // ThrowStatement
}
```

Examples of **correct** code for this rule:

```ts
const fn = (a) => { 
  'use gpu';
  let counter = 0; 
  let i = a;
  while (i) {
    if (i % 2 === 1) {
      counter += 1;
    }
    i >>= 1;
  }
  return otherFn(counter);
} 
```
```ts
const fn = () => { 
  'use gpu'; 
  let a = 0;
  const arr = [1, 2, 3];
  for (const item of arr) {
    a += item;
  }
  return a;
} 
```

Note that it is possible that TypeGPU starts/stops supporting JS syntax from version to version.
Make sure that the minor version of `typegpu` and `eslint-plugin-typegpu matches`.
