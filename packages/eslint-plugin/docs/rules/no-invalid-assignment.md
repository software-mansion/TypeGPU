# typegpu/no-invalid-assignment

📝 Disallow assignments that will generate invalid WGSL.

🚨 This rule is enabled in the ⭐ `recommended` config.

<!-- end auto-generated rule header -->

## Rule details

Examples of **incorrect** code for this rule:

```ts
const fn = (a) => { 
  'use gpu'; 
  a = 1;
}
```
```ts
const fn = (a) => { 
  'use gpu'; 
  a.prop++;
}
```
```ts
let a;
const fn = () => { 
  'use gpu'; 
  a = 1;
}
```

Examples of **correct** code for this rule:

```ts
const fn = () => {
  'use gpu';
  const ref = d.ref(0);
  other(ref);
};

const other = (ref: d.ref<number>) => {
  'use gpu';
  ref.$ = 1;
};
```
```ts
const privateVar = tgpu.privateVar(d.u32);
const fn = () => { 
  'use gpu'; 
  privateVar.$ = 1;
}
```

