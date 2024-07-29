---
editUrl: false
next: false
prev: false
title: "createRuntime"
---

> **createRuntime**(`options`?): `Promise`\<[`WigsillRuntime`](/api/wigsill/interfaces/wigsillruntime/)\>

## Parameters

• **options?**: `GPUDevice` \| [`CreateRuntimeOptions`](/api/wigsill/web/type-aliases/createruntimeoptions/)

## Returns

`Promise`\<[`WigsillRuntime`](/api/wigsill/interfaces/wigsillruntime/)\>

## Examples

When given no options, the function will ask the browser for a suitable GPU device.
```ts
createRuntime();
```

If there are specific options that should be used when requesting a device, you can pass those in.
```ts
const adapterOptions: GPURequestAdapterOptions = ...;
const deviceDescriptor: GPUDeviceDescriptor = ...;
createRuntime({ adapter: adapterOptions, device: deviceDescriptor });
```

If a specific device should be used instead, it can be passed in as a parameter.
```ts
const device: GPUDevice = ...;
createRuntime(device);
```

## Defined in

[packages/wigsill/src/web/webWigsillRuntime.ts:369](https://github.com/software-mansion-labs/wigsill/blob/3eabd476f023822e50f40404033f5b0520bf8089/packages/wigsill/src/web/webWigsillRuntime.ts#L369)
