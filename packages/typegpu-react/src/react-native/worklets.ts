import { WebGPUModule } from 'react-native-webgpu';

import { registerTypegpuReactSerializables } from './serialization/register-serializables.ts';

WebGPUModule.install();
registerTypegpuReactSerializables();

export * from '../shared-exports.ts';
// Intentionally shadows the browser `useFrame`, this one runs the frame loop on the UI runtime
export { useFrame } from './core/use-frame.ts';
export {
  useConfigureWorkletContext as useConfigureContext,
  type WorkletCanvasContextRef,
} from './use-configure-worklet-context.ts';
