---
editUrl: false
next: false
prev: false
title: "ResolutionCtx"
---

Passed into each resolvable item. All sibling items share a resolution ctx,
and a new resolution ctx is made when going down each level in the tree.

## Properties

### usedSlots

> `readonly` **usedSlots**: `Iterable`\<[`WgslSlot`](/api/wigsill/interfaces/wgslslot/)\<`unknown`\>\>

Slots that were used by items resolved by this context.

#### Defined in

[packages/wigsill/src/types.ts:14](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L14)

## Methods

### addBinding()

> **addBinding**(`bindable`, `identifier`): `void`

#### Parameters

• **bindable**: [`WgslBindable`](/api/wigsill/interfaces/wgslbindable/)\<[`AnyWgslData`](/api/wigsill/type-aliases/anywgsldata/), [`BufferUsage`](/api/wigsill/type-aliases/bufferusage/)\>

• **identifier**: `WgslIdentifier`

#### Returns

`void`

#### Defined in

[packages/wigsill/src/types.ts:17](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L17)

***

### addDeclaration()

> **addDeclaration**(`item`): `void`

#### Parameters

• **item**: [`WgslResolvable`](/api/wigsill/interfaces/wgslresolvable/)

#### Returns

`void`

#### Defined in

[packages/wigsill/src/types.ts:16](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L16)

***

### nameFor()

> **nameFor**(`token`): `string`

#### Parameters

• **token**: [`WgslResolvable`](/api/wigsill/interfaces/wgslresolvable/)

#### Returns

`string`

#### Defined in

[packages/wigsill/src/types.ts:18](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L18)

***

### resolve()

> **resolve**(`item`, `slotValueOverrides`?): `string`

#### Parameters

• **item**: [`Wgsl`](/api/wigsill/type-aliases/wgsl/)

• **slotValueOverrides?**: [`SlotValuePair`](/api/wigsill/type-aliases/slotvaluepair/)\<`unknown`\>[]

#### Returns

`string`

#### Defined in

[packages/wigsill/src/types.ts:24](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L24)

***

### unwrap()

> **unwrap**\<`T`\>(`eventual`): `T`

Unwraps all layers of slot indirection and returns the concrete value if available.

#### Type Parameters

• **T**

#### Parameters

• **eventual**: [`Eventual`](/api/wigsill/type-aliases/eventual/)\<`T`\>

#### Returns

`T`

#### Throws

#### Defined in

[packages/wigsill/src/types.ts:23](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/types.ts#L23)
