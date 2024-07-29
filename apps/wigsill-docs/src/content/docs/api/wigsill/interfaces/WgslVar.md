---
editUrl: false
next: false
prev: false
title: "WgslVar"
---

## Extends

- [`WgslResolvable`](/api/wigsill/interfaces/wgslresolvable/)

## Type Parameters

• **TDataType** *extends* [`AnyWgslData`](/api/wigsill/type-aliases/anywgsldata/)

## Properties

### label?

> `readonly` `optional` **label**: `string`

#### Inherited from

[`WgslResolvable`](/api/wigsill/interfaces/wgslresolvable/).[`label`](/api/wigsill/interfaces/wgslresolvable/#label)

#### Defined in

[packages/wigsill/src/types.ts:28](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L28)

## Methods

### $name()

> **$name**(`label`): [`WgslVar`](/api/wigsill/interfaces/wgslvar/)\<`TDataType`\>

#### Parameters

• **label**: `string`

#### Returns

[`WgslVar`](/api/wigsill/interfaces/wgslvar/)\<`TDataType`\>

#### Defined in

[packages/wigsill/src/wgslVariable.ts:12](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wgslVariable.ts#L12)

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
