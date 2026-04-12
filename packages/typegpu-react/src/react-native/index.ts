import { WebGPUModule } from 'react-native-wgpu';

// Making sure the WebGPU module is installed before navigator.gpu is accessed
WebGPUModule.install();

export * from '../shared-exports.ts';

export { useConfigureContext } from './use-configure-context.ts';
