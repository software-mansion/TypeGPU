---
editUrl: false
next: false
prev: false
title: "WgslSlot"
---

## Extended by

- [`WgslResolvableSlot`](/api/wigsill/interfaces/wgslresolvableslot/)

## Type Parameters

• **T**

## Properties

### \_\_brand

> `readonly` **\_\_brand**: `"WgslSlot"`

#### Defined in

[packages/wigsill/src/types.ts:50](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L50)

***

### defaultValue

> `readonly` **defaultValue**: `undefined` \| `T`

#### Defined in

[packages/wigsill/src/types.ts:52](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L52)

***

### label?

> `readonly` `optional` **label**: `string`

#### Defined in

[packages/wigsill/src/types.ts:54](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L54)

## Methods

### $name()

> **$name**(`label`): [`WgslSlot`](/api/wigsill/interfaces/wgslslot/)\<`T`\>

#### Parameters

• **label**: `string`

#### Returns

[`WgslSlot`](/api/wigsill/interfaces/wgslslot/)\<`T`\>

#### Defined in

[packages/wigsill/src/types.ts:56](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L56)

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

#### Defined in

[packages/wigsill/src/types.ts:62](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L62)
