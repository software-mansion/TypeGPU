---
editUrl: false
next: false
prev: false
title: "Unwrap"
---

> **Unwrap**\<`T`\>: `T` *extends* `IKeyedSchema`\<infer TKeyDef, infer TInner\> ? `IKeyedSchema`\<`TKeyDef`, [`Unwrap`](/api/wigsill/data/type-aliases/unwrap/)\<`TInner`\>\> : `T` *extends* `ISchema`\<infer TInner\> ? `TInner` : `T`

Removes one layer of schema wrapping.

## Type Parameters

• **T**

## Examples

Keyed schemas are bypassed.

## Defined in

node\_modules/.pnpm/typed-binary@4.0.0/node\_modules/typed-binary/dist/index.d.ts:109
