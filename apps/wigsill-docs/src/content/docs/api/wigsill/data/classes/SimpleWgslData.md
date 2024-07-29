---
editUrl: false
next: false
prev: false
title: "SimpleWgslData"
---

## Extends

- `Schema`\<[`Unwrap`](/api/wigsill/data/type-aliases/unwrap/)\<`TSchema`\>\>

## Type Parameters

• **TSchema** *extends* `AnySchema`

## Implements

- [`WgslData`](/api/wigsill/interfaces/wgsldata/)\<[`Unwrap`](/api/wigsill/data/type-aliases/unwrap/)\<`TSchema`\>\>

## Constructors

### new SimpleWgslData()

> **new SimpleWgslData**\<`TSchema`\>(`__namedParameters`): [`SimpleWgslData`](/api/wigsill/data/classes/simplewgsldata/)\<`TSchema`\>

byteAlignment has to be a power of 2

#### Parameters

• **\_\_namedParameters**

• **\_\_namedParameters.byteAlignment**: `number`

• **\_\_namedParameters.code**: [`Wgsl`](/api/wigsill/type-aliases/wgsl/)

• **\_\_namedParameters.schema**: `TSchema`

#### Returns

[`SimpleWgslData`](/api/wigsill/data/classes/simplewgsldata/)\<`TSchema`\>

#### Overrides

`Schema<Unwrap<TSchema>>.constructor`

#### Defined in

[packages/wigsill/src/data/std140.ts:33](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/data/std140.ts#L33)

## Properties

### \_\_unwrapped

> `readonly` **\_\_unwrapped**: [`Unwrap`](/api/wigsill/data/type-aliases/unwrap/)\<`TSchema`\>

#### Implementation of

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`__unwrapped`](/api/wigsill/interfaces/wgsldata/#__unwrapped)

#### Inherited from

`Schema.__unwrapped`

#### Defined in

node\_modules/.pnpm/typed-binary@4.0.0/node\_modules/typed-binary/dist/index.d.ts:164

***

### byteAlignment

> `readonly` **byteAlignment**: `number`

#### Implementation of

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`byteAlignment`](/api/wigsill/interfaces/wgsldata/#bytealignment)

#### Defined in

[packages/wigsill/src/data/std140.ts:25](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/data/std140.ts#L25)

***

### size

> `readonly` **size**: `number`

#### Implementation of

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`size`](/api/wigsill/interfaces/wgsldata/#size)

#### Defined in

[packages/wigsill/src/data/std140.ts:24](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/data/std140.ts#L24)

## Methods

### measure()

> **measure**(`value`, `measurer`): `IMeasurer`

#### Parameters

• **value**: *typeof* `MaxValue` \| `ParseUnwrapped`\<`TSchema`\>

• **measurer**: `IMeasurer` = `...`

#### Returns

`IMeasurer`

#### Implementation of

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`measure`](/api/wigsill/interfaces/wgsldata/#measure)

#### Overrides

`Schema.measure`

#### Defined in

[packages/wigsill/src/data/std140.ts:64](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/data/std140.ts#L64)

***

### read()

> **read**(`input`): `ParseUnwrapped`\<`TSchema`\>

#### Parameters

• **input**: `ISerialInput`

#### Returns

`ParseUnwrapped`\<`TSchema`\>

#### Implementation of

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`read`](/api/wigsill/interfaces/wgsldata/#read)

#### Overrides

`Schema.read`

#### Defined in

[packages/wigsill/src/data/std140.ts:59](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/data/std140.ts#L59)

***

### resolve()

> **resolve**(`ctx`): `string`

#### Parameters

• **ctx**: [`ResolutionCtx`](/api/wigsill/interfaces/resolutionctx/)

#### Returns

`string`

#### Implementation of

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`resolve`](/api/wigsill/interfaces/wgsldata/#resolve)

#### Defined in

[packages/wigsill/src/data/std140.ts:75](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/data/std140.ts#L75)

***

### resolveReferences()

> **resolveReferences**(): `void`

#### Returns

`void`

#### Implementation of

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`resolveReferences`](/api/wigsill/interfaces/wgsldata/#resolvereferences)

#### Overrides

`Schema.resolveReferences`

#### Defined in

[packages/wigsill/src/data/std140.ts:50](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/data/std140.ts#L50)

***

### seekProperty()

> **seekProperty**(`_reference`, `_prop`): `null` \| `PropertyDescription`

#### Parameters

• **\_reference**: *typeof* `MaxValue` \| [`Parsed`](/api/wigsill/data/type-aliases/parsed/)\<[`Unwrap`](/api/wigsill/data/type-aliases/unwrap/)\<`TSchema`\>, `Record`\<`string`, `never`\>\>

• **\_prop**: keyof [`Unwrap`](/api/wigsill/data/type-aliases/unwrap/)\<`TSchema`\>

#### Returns

`null` \| `PropertyDescription`

#### Implementation of

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`seekProperty`](/api/wigsill/interfaces/wgsldata/#seekproperty)

#### Inherited from

`Schema.seekProperty`

#### Defined in

node\_modules/.pnpm/typed-binary@4.0.0/node\_modules/typed-binary/dist/index.d.ts:169

***

### write()

> **write**(`output`, `value`): `void`

#### Parameters

• **output**: `ISerialOutput`

• **value**: `ParseUnwrapped`\<`TSchema`\>

#### Returns

`void`

#### Implementation of

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`write`](/api/wigsill/interfaces/wgsldata/#write)

#### Overrides

`Schema.write`

#### Defined in

[packages/wigsill/src/data/std140.ts:54](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/data/std140.ts#L54)
