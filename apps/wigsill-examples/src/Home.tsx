import { CodeResolver } from './CodeResolver';
import { CodeEditor } from './CodeEditor';

export function Home() {
  return (
    <div className="px-6 py-4">
      <p>Edit `sampleShader.ts` and see the change in resolved code.</p>
      <CodeResolver />
      <CodeEditor />
    </div>
  );
}
