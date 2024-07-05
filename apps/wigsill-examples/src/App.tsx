import { atom } from 'jotai/vanilla';
import { useAtomValue } from 'jotai/react';
import { WGSLRuntime, ProgramBuilder } from 'wigsill';

import { sampleShader } from './sampleShader';
import { Suspense } from 'react';

// using `jōtai` for a simple async resource store.
const runtimeAtom = atom(async () => {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice();

  return new WGSLRuntime(device);
});

const sampleShaderAtom = atom(async (get) => {
  const runtime = await get(runtimeAtom);

  const program = new ProgramBuilder(runtime, sampleShader).build({
    bindingGroup: 0,
    shaderStage: GPUShaderStage.COMPUTE,
  });

  return program.code;
});

function ShaderCodeView() {
  const resolvedCode = useAtomValue(sampleShaderAtom);

  return (
    <code className="block border p-4 bg-sky-950 text-white rounded-md whitespace-pre">
      {resolvedCode}
    </code>
  );
}

function App() {
  return (
    <main className="mx-auto px-4">
      <h1 className="text-2xl py-4">
        <strong>wigsill</strong> - examples
      </h1>
      <p>Edit `sampleShader.ts` and see the change in resolved code.</p>
      <Suspense fallback={'Loading...'}>
        <ShaderCodeView />
      </Suspense>
    </main>
  );
}

export default App;
