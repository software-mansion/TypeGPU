---
editUrl: false
next: false
prev: false
title: "WgslResolvableSlot"
---

## Extends

- [`WgslResolvable`](/api/wigsill/interfaces/wgslresolvable/).[`WgslSlot`](/api/wigsill/interfaces/wgslslot/)\<`T`\>

## Type Parameters

• **T** *extends* [`Wgsl`](/api/wigsill/type-aliases/wgsl/)

## Properties

### \_\_brand

> `readonly` **\_\_brand**: `"WgslSlot"`

#### Inherited from

[`WgslSlot`](/api/wigsill/interfaces/wgslslot/).[`__brand`](/api/wigsill/interfaces/wgslslot/#__brand)

#### Defined in

[packages/wigsill/src/types.ts:50](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L50)

***

### defaultValue

> `readonly` **defaultValue**: `undefined` \| `T`

#### Inherited from

[`WgslSlot`](/api/wigsill/interfaces/wgslslot/).[`defaultValue`](/api/wigsill/interfaces/wgslslot/#defaultvalue)

#### Defined in

[packages/wigsill/src/types.ts:52](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L52)

***

### label?

> `readonly` `optional` **label**: `string`

#### Inherited from

[`WgslSlot`](/api/wigsill/interfaces/wgslslot/).[`label`](/api/wigsill/interfaces/wgslslot/#label)

#### Defined in

[packages/wigsill/src/types.ts:28](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L28)

## Methods

### $name()

> **$name**(`label`): [`WgslResolvableSlot`](/api/wigsill/interfaces/wgslresolvableslot/)\<`T`\>

#### Parameters

• **label**: `string`

#### Returns

[`WgslResolvableSlot`](/api/wigsill/interfaces/wgslresolvableslot/)\<`T`\>

#### Overrides

[`WgslSlot`](/api/wigsill/interfaces/wgslslot/).[`$name`](/api/wigsill/interfaces/wgslslot/#$name)

#### Defined in

[packages/wigsill/src/types.ts:81](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L81)

***

### areEqual()

> **areEqual**(`a`, `b`): `boolean`

Used to determine if code generated using either value `a` or `b` in place
of the slot will be equivalent. Defaults to `Object.is`.

#### Parameters

• **a**: `T`

• **b**: `T`

#### Returns

`boolean`

#### Inherited from

[`WgslSlot`](/api/wigsill/interfaces/wgslslot/).[`areEqual`](/api/wigsill/interfaces/wgslslot/#areequal)

#### Defined in

[packages/wigsill/src/types.ts:62](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L62)

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
