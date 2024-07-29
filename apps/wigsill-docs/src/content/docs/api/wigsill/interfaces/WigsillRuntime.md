---
editUrl: false
next: false
prev: false
title: "WigsillRuntime"
---

## Properties

### device

> `readonly` **device**: `GPUDevice`

#### Defined in

[packages/wigsill/src/wigsillRuntime.ts:12](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wigsillRuntime.ts#L12)

## Methods

### bufferFor()

> **bufferFor**(`allocatable`): `GPUBuffer`

#### Parameters

• **allocatable**: [`WgslAllocatable`](/api/wigsill/interfaces/wgslallocatable/)\<[`AnyWgslData`](/api/wigsill/type-aliases/anywgsldata/)\>

#### Returns

`GPUBuffer`

#### Defined in

[packages/wigsill/src/wigsillRuntime.ts:23](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wigsillRuntime.ts#L23)

***

### dispose()

> **dispose**(): `void`

#### Returns

`void`

#### Defined in

[packages/wigsill/src/wigsillRuntime.ts:24](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wigsillRuntime.ts#L24)

***

### flush()

> **flush**(): `void`

#### Returns

`void`

#### Defined in

[packages/wigsill/src/wigsillRuntime.ts:25](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wigsillRuntime.ts#L25)

***

### makeComputePipeline()

> **makeComputePipeline**(`options`): [`ComputePipelineExecutor`](/api/wigsill/interfaces/computepipelineexecutor/)

#### Parameters

• **options**: [`ComputePipelineOptions`](/api/wigsill/interfaces/computepipelineoptions/)

#### Returns

[`ComputePipelineExecutor`](/api/wigsill/interfaces/computepipelineexecutor/)

#### Defined in

[packages/wigsill/src/wigsillRuntime.ts:28](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wigsillRuntime.ts#L28)

***

### makeRenderPipeline()

> **makeRenderPipeline**(`options`): [`RenderPipelineExecutor`](/api/wigsill/interfaces/renderpipelineexecutor/)

#### Parameters

• **options**: [`RenderPipelineOptions`](/api/wigsill/interfaces/renderpipelineoptions/)

#### Returns

[`RenderPipelineExecutor`](/api/wigsill/interfaces/renderpipelineexecutor/)

#### Defined in

[packages/wigsill/src/wigsillRuntime.ts:27](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wigsillRuntime.ts#L27)

***

### readBuffer()

> **readBuffer**\<`TData`\>(`allocatable`): `Promise`\<[`Parsed`](/api/wigsill/data/type-aliases/parsed/)\<`TData`\>\>

#### Type Parameters

• **TData** *extends* [`AnyWgslData`](/api/wigsill/type-aliases/anywgsldata/)

#### Parameters

• **allocatable**: [`WgslAllocatable`](/api/wigsill/interfaces/wgslallocatable/)\<`TData`\>

#### Returns

`Promise`\<[`Parsed`](/api/wigsill/data/type-aliases/parsed/)\<`TData`\>\>

#### Defined in

[packages/wigsill/src/wigsillRuntime.ts:19](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wigsillRuntime.ts#L19)

***

### writeBuffer()

> **writeBuffer**\<`TValue`\>(`allocatable`, `data`): `void`

#### Type Parameters

• **TValue** *extends* [`AnyWgslData`](/api/wigsill/type-aliases/anywgsldata/)

#### Parameters

• **allocatable**: [`WgslAllocatable`](/api/wigsill/interfaces/wgslallocatable/)\<`TValue`\>

• **data**: [`Parsed`](/api/wigsill/data/type-aliases/parsed/)\<`TValue`\>

#### Returns

`void`

#### Defined in

[packages/wigsill/src/wigsillRuntime.ts:14](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/wigsillRuntime.ts#L14)
