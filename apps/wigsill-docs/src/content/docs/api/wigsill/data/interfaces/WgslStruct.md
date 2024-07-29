---
editUrl: false
next: false
prev: false
title: "WgslStruct"
---

## Extends

- `ISchema`\<`UnwrapRecord`\<`TProps`\>\>.[`WgslData`](/api/wigsill/interfaces/wgsldata/)\<`UnwrapRecord`\<`TProps`\>\>

## Type Parameters

• **TProps** *extends* `Record`\<`string`, [`AnyWgslData`](/api/wigsill/type-aliases/anywgsldata/)\>

## Properties

### \_\_unwrapped

> `readonly` **\_\_unwrapped**: `UnwrapRecord`\<`TProps`\>

#### Inherited from

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`__unwrapped`](/api/wigsill/interfaces/wgsldata/#__unwrapped)

#### Defined in

node\_modules/.pnpm/typed-binary@4.0.0/node\_modules/typed-binary/dist/index.d.ts:155

***

### byteAlignment

> `readonly` **byteAlignment**: `number`

#### Inherited from

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`byteAlignment`](/api/wigsill/interfaces/wgsldata/#bytealignment)

#### Defined in

[packages/wigsill/src/types.ts:107](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L107)

***

### label?

> `readonly` `optional` **label**: `string`

#### Inherited from

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`label`](/api/wigsill/interfaces/wgsldata/#label)

#### Defined in

[packages/wigsill/src/types.ts:28](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L28)

***

### size

> `readonly` **size**: `number`

#### Inherited from

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`size`](/api/wigsill/interfaces/wgsldata/#size)

#### Defined in

[packages/wigsill/src/types.ts:108](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L108)

## Methods

### $name()

> **$name**(`label`): `this`

#### Parameters

• **label**: `string`

#### Returns

`this`

#### Defined in

[packages/wigsill/src/data/struct.ts:25](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/data/struct.ts#L25)

***

### measure()

> **measure**(`value`, `measurer`?): `IMeasurer`

#### Parameters

• **value**: *typeof* `MaxValue` \| [`Parsed`](/api/wigsill/data/type-aliases/parsed/)\<`UnwrapRecord`\<`TProps`\>, `Record`\<`string`, `never`\>\>

• **measurer?**: `IMeasurer`

#### Returns

`IMeasurer`

#### Inherited from

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`measure`](/api/wigsill/interfaces/wgsldata/#measure)

#### Defined in

node\_modules/.pnpm/typed-binary@4.0.0/node\_modules/typed-binary/dist/index.d.ts:159

***

### read()

> **read**(`input`): [`Parsed`](/api/wigsill/data/type-aliases/parsed/)\<`UnwrapRecord`\<`TProps`\>, `Record`\<`string`, `never`\>\>

#### Parameters

• **input**: `ISerialInput`

#### Returns

[`Parsed`](/api/wigsill/data/type-aliases/parsed/)\<`UnwrapRecord`\<`TProps`\>, `Record`\<`string`, `never`\>\>

#### Inherited from

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`read`](/api/wigsill/interfaces/wgsldata/#read)

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

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`resolve`](/api/wigsill/interfaces/wgsldata/#resolve)

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

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`resolveReferences`](/api/wigsill/interfaces/wgsldata/#resolvereferences)

#### Defined in

node\_modules/.pnpm/typed-binary@4.0.0/node\_modules/typed-binary/dist/index.d.ts:156

***

### seekProperty()

> **seekProperty**(`reference`, `prop`): `null` \| `PropertyDescription`

#### Parameters

• **reference**: *typeof* `MaxValue` \| [`Parsed`](/api/wigsill/data/type-aliases/parsed/)\<`UnwrapRecord`\<`TProps`\>, `Record`\<`string`, `never`\>\>

• **prop**: keyof `UnwrapRecord`\<`TProps`\>

#### Returns

`null` \| `PropertyDescription`

#### Inherited from

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`seekProperty`](/api/wigsill/interfaces/wgsldata/#seekproperty)

#### Defined in

node\_modules/.pnpm/typed-binary@4.0.0/node\_modules/typed-binary/dist/index.d.ts:160

***

### write()

> **write**(`output`, `value`): `void`

#### Parameters

• **output**: `ISerialOutput`

• **value**: [`Parsed`](/api/wigsill/data/type-aliases/parsed/)\<`UnwrapRecord`\<`TProps`\>, `Record`\<`string`, `never`\>\>

#### Returns

`void`

#### Inherited from

[`WgslData`](/api/wigsill/interfaces/wgsldata/).[`write`](/api/wigsill/interfaces/wgsldata/#write)

#### Defined in

node\_modules/.pnpm/typed-binary@4.0.0/node\_modules/typed-binary/dist/index.d.ts:157
