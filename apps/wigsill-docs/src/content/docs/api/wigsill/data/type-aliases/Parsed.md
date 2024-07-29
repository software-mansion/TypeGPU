---
editUrl: false
next: false
prev: false
title: "Parsed"
---

> **Parsed**\<`T`, `TKeyDict`\>: `T` *extends* `IKeyedSchema`\<infer TKeyDefinition, infer TUnwrapped\> ? [`Parsed`](/api/wigsill/data/type-aliases/parsed/)\<`TUnwrapped`, `TKeyDict` & `{ [key in TKeyDefinition]: Unwrap<T> }`\> : `T` *extends* `ISchema`\<infer TUnwrapped\> ? [`Parsed`](/api/wigsill/data/type-aliases/parsed/)\<`TUnwrapped`, `TKeyDict`\> : `T` *extends* `Ref`\<infer K\> ? `K` *extends* keyof `TKeyDict` ? [`Parsed`](/api/wigsill/data/type-aliases/parsed/)\<`TKeyDict`\[`K`\], `TKeyDict`\> : `never` : `T` *extends* `Record`\<`string`, `unknown`\> ? `{ [K in keyof T]: Parsed<T[K], TKeyDict> }` : `T` *extends* `unknown`[] ? `{ [K in keyof T]: Parsed<T[K], TKeyDict> }` : `T`

## Type Parameters

• **T**

• **TKeyDict** *extends* `{ [key in keyof TKeyDict]: TKeyDict[key] }` = `Record`\<`string`, `never`\>

## Defined in

node\_modules/.pnpm/typed-binary@4.0.0/node\_modules/typed-binary/dist/index.d.ts:207
