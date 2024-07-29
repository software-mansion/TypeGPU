---
editUrl: false
next: false
prev: false
title: "WgslBindable"
---

## Extends

- [`WgslResolvable`](/api/wigsill/interfaces/wgslresolvable/)

## Type Parameters

• **TData** *extends* [`AnyWgslData`](/api/wigsill/type-aliases/anywgsldata/) = [`AnyWgslData`](/api/wigsill/type-aliases/anywgsldata/)

• **TUsage** *extends* [`BufferUsage`](/api/wigsill/type-aliases/bufferusage/) = [`BufferUsage`](/api/wigsill/type-aliases/bufferusage/)

## Properties

### allocatable

> `readonly` **allocatable**: [`WgslAllocatable`](/api/wigsill/interfaces/wgslallocatable/)\<`TData`\>

#### Defined in

[packages/wigsill/src/types.ts:100](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L100)

***

### label?

> `readonly` `optional` **label**: `string`

#### Inherited from

[`WgslResolvable`](/api/wigsill/interfaces/wgslresolvable/).[`label`](/api/wigsill/interfaces/wgslresolvable/#label)

#### Defined in

[packages/wigsill/src/types.ts:28](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L28)

***

### usage

> `readonly` **usage**: `TUsage`

#### Defined in

[packages/wigsill/src/types.ts:101](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L101)

## Methods

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
