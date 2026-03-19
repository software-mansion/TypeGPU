const adapter = await navigator.gpu?.requestAdapter();
void adapter?.requestDevice().then((device) => device.destroy());

export const isGPUSupported = !!adapter;
