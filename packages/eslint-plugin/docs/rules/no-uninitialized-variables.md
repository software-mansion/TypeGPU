# typegpu/no-uninitialized-variables

📝 Always assign an initial value when declaring a variable inside TypeGPU functions.

💼 This rule is enabled in the following configs: 🌐 `all`, ✅ `recommended`.

<!-- end auto-generated rule header -->

## Rule details

Examples of **incorrect** code for this rule:

```ts
const fn = () => { 
  'use gpu'; 
  let a; 
}
```

Examples of **correct** code for this rule:

```ts
let a;
```
```ts
const fn = () => { 
  'use gpu'; 
  let vec = d.vec3f();
} 
```
