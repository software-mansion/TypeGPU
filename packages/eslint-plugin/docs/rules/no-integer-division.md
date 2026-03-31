# typegpu/no-integer-division

📝 Disallow division incorporating numbers wrapped in 'u32' and 'i32'.

⚠️ This rule _warns_ in the ⭐ `recommended` config.

<!-- end auto-generated rule header -->

## Rule details

Examples of **incorrect** code for this rule:

```ts
const a = d.u32(1) / d.u32(2);
```
```ts
const a = 1 / d.u32(2);
```
```ts
const a = 1 / d.i32(2);
```

Examples of **correct** code for this rule:

```ts
const a = 1 / 2;
```
```ts
const a = d.u32(d.u32(1) / d.u32(2));
```
```ts
const a = d.u32(1);
const b = d.u32(2);
const c = a / b;
```

Note that this rule is not type aware. 
Extracting the dividend and the divisor to variables will silence the rule,
but it will not make the code behave differently.