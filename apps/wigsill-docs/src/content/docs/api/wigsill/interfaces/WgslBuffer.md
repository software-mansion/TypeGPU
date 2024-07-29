---
editUrl: false
next: false
prev: false
title: "WgslBuffer"
---

## Extends

- [`WgslAllocatable`](/api/wigsill/interfaces/wgslallocatable/)\<`TData`\>

## Type Parameters

• **TData** *extends* [`AnyWgslData`](/api/wigsill/type-aliases/anywgsldata/)

• **TAllows** *extends* [`BufferUsage`](/api/wigsill/type-aliases/bufferusage/) = `never`

## Properties

### dataType

> `readonly` **dataType**: `TData`

The data type this allocatable was constructed with.
It informs the size and format of data in both JS and
binary.

#### Inherited from

[`WgslAllocatable`](/api/wigsill/interfaces/wgslallocatable/).[`dataType`](/api/wigsill/interfaces/wgslallocatable/#datatype)

#### Defined in

[packages/wigsill/src/types.ts:92](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L92)

***

### flags

> `readonly` **flags**: `number`

#### Inherited from

[`WgslAllocatable`](/api/wigsill/interfaces/wgslallocatable/).[`flags`](/api/wigsill/interfaces/wgslallocatable/#flags)

#### Defined in

[packages/wigsill/src/types.ts:93](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L93)

## Methods

### $addFlags()

> **$addFlags**(`flags`): [`WgslBuffer`](/api/wigsill/interfaces/wgslbuffer/)\<`TData`, `TAllows`\>

#### Parameters

• **flags**: `number`

#### Returns

[`WgslBuffer`](/api/wigsill/interfaces/wgslbuffer/)\<`TData`, `TAllows`\>

#### Defined in

[packages/wigsill/src/wgslBuffer.ts:16](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wgslBuffer.ts#L16)

***

### $allowMutableStorage()

> **$allowMutableStorage**(): [`WgslBuffer`](/api/wigsill/interfaces/wgslbuffer/)\<`TData`, `"mutable_storage"` \| `TAllows`\>

#### Returns

[`WgslBuffer`](/api/wigsill/interfaces/wgslbuffer/)\<`TData`, `"mutable_storage"` \| `TAllows`\>

#### Defined in

[packages/wigsill/src/wgslBuffer.ts:15](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wgslBuffer.ts#L15)

***

### $allowReadonlyStorage()

> **$allowReadonlyStorage**(): [`WgslBuffer`](/api/wigsill/interfaces/wgslbuffer/)\<`TData`, `"readonly_storage"` \| `TAllows`\>

#### Returns

[`WgslBuffer`](/api/wigsill/interfaces/wgslbuffer/)\<`TData`, `"readonly_storage"` \| `TAllows`\>

#### Defined in

[packages/wigsill/src/wgslBuffer.ts:14](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wgslBuffer.ts#L14)

***

### $allowUniform()

> **$allowUniform**(): [`WgslBuffer`](/api/wigsill/interfaces/wgslbuffer/)\<`TData`, `"uniform"` \| `TAllows`\>

#### Returns

[`WgslBuffer`](/api/wigsill/interfaces/wgslbuffer/)\<`TData`, `"uniform"` \| `TAllows`\>

#### Defined in

[packages/wigsill/src/wgslBuffer.ts:13](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wgslBuffer.ts#L13)

***

### $name()

> **$name**(`label`): [`WgslBuffer`](/api/wigsill/interfaces/wgslbuffer/)\<`TData`, `TAllows`\>

#### Parameters

• **label**: `string`

#### Returns

[`WgslBuffer`](/api/wigsill/interfaces/wgslbuffer/)\<`TData`, `TAllows`\>

#### Defined in

[packages/wigsill/src/wgslBuffer.ts:12](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wgslBuffer.ts#L12)

***

### asReadonlyStorage()

> **asReadonlyStorage**(): `"readonly_storage"` *extends* `TAllows` ? `WgslBufferUsage`\<`TData`, `"readonly_storage"`\> : `null`

#### Returns

`"readonly_storage"` *extends* `TAllows` ? `WgslBufferUsage`\<`TData`, `"readonly_storage"`\> : `null`

#### Defined in

[packages/wigsill/src/wgslBuffer.ts:26](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wgslBuffer.ts#L26)

***

### asStorage()

> **asStorage**(): `"mutable_storage"` *extends* `TAllows` ? `WgslBufferUsage`\<`TData`, `"mutable_storage"`\> : `null`

#### Returns

`"mutable_storage"` *extends* `TAllows` ? `WgslBufferUsage`\<`TData`, `"mutable_storage"`\> : `null`

#### Defined in

[packages/wigsill/src/wgslBuffer.ts:22](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wgslBuffer.ts#L22)

***

### asUniform()

> **asUniform**(): `"uniform"` *extends* `TAllows` ? `WgslBufferUsage`\<`TData`, `"uniform"`\> : `null`

#### Returns

`"uniform"` *extends* `TAllows` ? `WgslBufferUsage`\<`TData`, `"uniform"`\> : `null`

#### Defined in

[packages/wigsill/src/wgslBuffer.ts:18](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wgslBuffer.ts#L18)
