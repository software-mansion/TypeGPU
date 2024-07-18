import { useAtomValue } from 'jotai/react';
import { atom } from 'jotai/vanilla';
import { ProgramBuilder, WigsillRuntime } from 'wigsill';
import { sampleShader } from './sampleShader';

// using `jōtai` for a simple async resource store.
const runtimeAtom = atom(async () => {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('No WebGPU compatible GPU found.');
  }
  const device = await adapter.requestDevice();

  return new WigsillRuntime(device);
});

const sampleShaderAtom = atom(async (get) => {
  const runtime = await get(runtimeAtom);

  const program = new ProgramBuilder(runtime, sampleShader).build({
    bindingGroup: 0,
    shaderStage: GPUShaderStage.COMPUTE,
  });

  return program.code;
});

export function CodeResolver() {
  const resolvedCode = useAtomValue(sampleShaderAtom);

  return (
    <code className="block border p-4 bg-sky-950 text-white rounded-md whitespace-pre">
      {resolvedCode}
    </code>
  );
}
