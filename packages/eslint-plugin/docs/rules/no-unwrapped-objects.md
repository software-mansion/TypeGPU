# typegpu/no-unwrapped-objects

📝 Disallow unwrapped Plain Old JavaScript Objects inside 'use gpu' functions (except returns).

🚨 This rule is enabled in the ⭐ `recommended` config.

<!-- end auto-generated rule header -->

## Rule details

Examples of **incorrect** code for this rule:

```ts
const fn = () => {
  'use gpu'; 
  const unwrapped = { a: 1 };
}
```

Examples of **correct** code for this rule:

```ts
const pojo = { a: 1 };
```
```ts
const fn = () => { 
  'use gpu'; 
  return { a: 1 }; 
}
```
```ts
const Schema = d.struct({ a: d.u32 });

const fn = () => {
  'use gpu';
  const wrapped = Schema({ a: 1 });
}
```