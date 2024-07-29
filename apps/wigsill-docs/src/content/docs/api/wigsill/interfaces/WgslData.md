---
editUrl: false
next: false
prev: false
title: "WgslData"
---

## Extends

- `ISchema`\<`TInner`\>.[`WgslResolvable`](/api/wigsill/interfaces/wgslresolvable/)

## Extended by

- [`WgslStruct`](/api/wigsill/data/interfaces/wgslstruct/)

## Type Parameters

• **TInner**

## Properties

### \_\_unwrapped

> `readonly` **\_\_unwrapped**: `TInner`

#### Inherited from

`ISchema.__unwrapped`

#### Defined in

node\_modules/.pnpm/typed-binary@4.0.0/node\_modules/typed-binary/dist/index.d.ts:155

***

### byteAlignment

> `readonly` **byteAlignment**: `number`

#### Defined in

[packages/wigsill/src/types.ts:107](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L107)

***

### label?

> `readonly` `optional` **label**: `string`

#### Inherited from

[`WgslResolvable`](/api/wigsill/interfaces/wgslresolvable/).[`label`](/api/wigsill/interfaces/wgslresolvable/#label)

#### Defined in

[packages/wigsill/src/types.ts:28](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L28)

***

### size

> `readonly` **size**: `number`

#### Defined in

[packages/wigsill/src/types.ts:108](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L108)

## Methods

### measure()

> **measure**(`value`, `measurer`?): `IMeasurer`

#### Parameters

• **value**: *typeof* `MaxValue` \| [`Parsed`](/api/wigsill/data/type-aliases/parsed/)\<`TInner`, `Record`\<`string`, `never`\>\>

• **measurer?**: `IMeasurer`

#### Returns

`IMeasurer`

#### Inherited from

`ISchema.measure`

#### Defined in

node\_modules/.pnpm/typed-binary@4.0.0/node\_modules/typed-binary/dist/index.d.ts:159

***

### read()

> **read**(`input`): [`Parsed`](/api/wigsill/data/type-aliases/parsed/)\<`TInner`, `Record`\<`string`, `never`\>\>

#### Parameters

• **input**: `ISerialInput`

#### Returns

[`Parsed`](/api/wigsill/data/type-aliases/parsed/)\<`TInner`, `Record`\<`string`, `never`\>\>

#### Inherited from

`ISchema.read`

#### Defined in

node\_modules/.pnpm/typed-binary@4.0.0/node\_modules/typed-binary/dist/index.d.ts:158

***

### resolve()

> **resolve**(`ctx`): `string`

#### Parameters

• **ctx**: [`ResolutionCtx`](/api/wigsill/interfaces/resolutionctx/)

#### Returns

`string`

#### Inherited from

[`WgslResolvable`](/api/wigsill/interfaces/wgslresolvable/).[`resolve`](/api/wigsill/interfaces/wgslresolvable/#resolve)

#### Defined in

[packages/wigsill/src/types.ts:30](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L30)

***

### resolveReferences()

> **resolveReferences**(`ctx`): `void`

#### Parameters

• **ctx**: `IRefResolver`

#### Returns

`void`

#### Inherited from

`ISchema.resolveReferences`

#### Defined in

node\_modules/.pnpm/typed-binary@4.0.0/node\_modules/typed-binary/dist/index.d.ts:156

***

### seekProperty()

> **seekProperty**(`reference`, `prop`): `null` \| `PropertyDescription`

#### Parameters

• **reference**: *typeof* `MaxValue` \| [`Parsed`](/api/wigsill/data/type-aliases/parsed/)\<`TInner`, `Record`\<`string`, `never`\>\>

• **prop**: keyof `TInner`

#### Returns

`null` \| `PropertyDescription`

#### Inherited from

`ISchema.seekProperty`

#### Defined in

node\_modules/.pnpm/typed-binary@4.0.0/node\_modules/typed-binary/dist/index.d.ts:160

***

### write()

> **write**(`output`, `value`): `void`

#### Parameters

• **output**: `ISerialOutput`

• **value**: [`Parsed`](/api/wigsill/data/type-aliases/parsed/)\<`TInner`, `Record`\<`string`, `never`\>\>

#### Returns

`void`

#### Inherited from

`ISchema.write`

#### Defined in

node\_modules/.pnpm/typed-binary@4.0.0/node\_modules/typed-binary/dist/index.d.ts:157
