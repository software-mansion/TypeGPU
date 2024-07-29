---
editUrl: false
next: false
prev: false
title: "WgslFn"
---

## Extends

- [`WgslResolvable`](/api/wigsill/interfaces/wgslresolvable/)

## Properties

### label?

> `readonly` `optional` **label**: `string`

#### Inherited from

[`WgslResolvable`](/api/wigsill/interfaces/wgslresolvable/).[`label`](/api/wigsill/interfaces/wgslresolvable/#label)

#### Defined in

[packages/wigsill/src/types.ts:28](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L28)

## Methods

### $name()

> **$name**(`label`): [`WgslFn`](/api/wigsill/interfaces/wgslfn/)

#### Parameters

• **label**: `string`

#### Returns

[`WgslFn`](/api/wigsill/interfaces/wgslfn/)

#### Defined in

[packages/wigsill/src/wgslFunction.ts:18](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wgslFunction.ts#L18)

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

### with()

> **with**\<`T`\>(`slot`, `value`): `BoundWgslFn`

#### Type Parameters

• **T**

#### Parameters

• **slot**: [`WgslSlot`](/api/wigsill/interfaces/wgslslot/)\<`T`\>

• **value**: [`Eventual`](/api/wigsill/type-aliases/eventual/)\<`T`\>

#### Returns

`BoundWgslFn`

#### Defined in

[packages/wigsill/src/wgslFunction.ts:20](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wgslFunction.ts#L20)
