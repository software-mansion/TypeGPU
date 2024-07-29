---
editUrl: false
next: false
prev: false
title: "RenderPipelineOptions"
---

## Properties

### externalDeclarations?

> `optional` **externalDeclarations**: [`Wgsl`](/api/wigsill/type-aliases/wgsl/)[]

#### Defined in

[packages/wigsill/src/wigsillRuntime.ts:46](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wigsillRuntime.ts#L46)

***

### externalLayouts?

> `optional` **externalLayouts**: `GPUBindGroupLayout`[]

#### Defined in

[packages/wigsill/src/wigsillRuntime.ts:45](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wigsillRuntime.ts#L45)

***

### fragment

> **fragment**: `object`

#### args

> **args**: [`Wgsl`](/api/wigsill/type-aliases/wgsl/)[]

#### code

> **code**: [`WgslCode`](/api/wigsill/interfaces/wgslcode/)

#### output

> **output**: [`Wgsl`](/api/wigsill/type-aliases/wgsl/)

#### target

> **target**: `Iterable`\<`null` \| `GPUColorTargetState`\>

#### Defined in

[packages/wigsill/src/wigsillRuntime.ts:38](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wigsillRuntime.ts#L38)

***

### label?

> `optional` **label**: `string`

#### Defined in

[packages/wigsill/src/wigsillRuntime.ts:47](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wigsillRuntime.ts#L47)

***

### primitive

> **primitive**: `GPUPrimitiveState`

#### Defined in

[packages/wigsill/src/wigsillRuntime.ts:44](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wigsillRuntime.ts#L44)

***

### vertex

> **vertex**: `object`

#### args

> **args**: [`Wgsl`](/api/wigsill/type-aliases/wgsl/)[]

#### buffersLayouts?

> `optional` **buffersLayouts**: `Iterable`\<`null` \| `GPUVertexBufferLayout`\>

#### code

> **code**: [`WgslCode`](/api/wigsill/interfaces/wgslcode/)

#### output

> **output**: [`WgslStruct`](/api/wigsill/data/interfaces/wgslstruct/)\<`Record`\<`string`, [`AnyWgslData`](/api/wigsill/type-aliases/anywgsldata/)\>\>

#### Defined in

[packages/wigsill/src/wigsillRuntime.ts:32](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wigsillRuntime.ts#L32)
