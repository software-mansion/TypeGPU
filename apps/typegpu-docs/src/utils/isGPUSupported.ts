const adapter = await navigator.gpu?.requestAdapter();
adapter?.requestDevice().then((device) => device.destroy());

export const isGPUSupported = !!adapter;
