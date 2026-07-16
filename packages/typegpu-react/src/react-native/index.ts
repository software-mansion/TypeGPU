import { WebGPUModule } from 'react-native-webgpu';

import { registerTypegpuReactSerializables } from './serialization/register-serializables.ts';

// Making sure the WebGPU module is installed before navigator.gpu is accessed
WebGPUModule.install();
// No-ops when react-native-worklets is not installed
registerTypegpuReactSerializables();

export * from '../shared-exports.ts';

export { useConfigureContext } from './use-configure-context.ts';
// Intentionally shadows the browser `useFrame`, this one can run the frame loop on the UI runtime
export { useFrame } from './core/use-frame.ts';
export {
  useConfigureWorkletContext,
  type WorkletCanvasContextRef,
} from './use-configure-worklet-context.ts';
