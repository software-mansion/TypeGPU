import { useAtom } from 'jotai';
import { codeEditorShownAtom } from '../utils/examples/codeEditorShownAtom';
import {
  PLAYGROUND_KEY,
  examplesByCategory,
} from '../utils/examples/exampleContent';
import { exampleCategories } from '../utils/examples/types';
import { ExampleLink } from './ExampleLink';
import { Switch } from './design/Switch';

function ExampleList() {
  const [codeEditorShowing, setCodeEditorShowing] =
    useAtom(codeEditorShownAtom);

  return (
    <>
      <nav className="flex flex-col flex-1 gap-2 p-4  overflow-y-auto min-w-64">
        <ExampleLink key={PLAYGROUND_KEY} exampleKey={PLAYGROUND_KEY}>
          Playground
        </ExampleLink>
        <hr />
        {exampleCategories.map((category) => (
          <section key={category.key} className="pb-4">
            <h2 className="text-sm text-slate-500">{category.label}</h2>
            {(examplesByCategory[category.key] ?? []).map((example) => (
              <ExampleLink key={example.key} exampleKey={example.key}>
                {example.metadata.title}
              </ExampleLink>
            ))}
          </section>
        ))}
      </nav>
      <div className="p-4">
        <label className="flex gap-3 items-center justify-center cursor-pointer p-4 bg-[#f6f6ff] rounded-lg">
          <span>Code editor</span>
          <Switch
            checked={codeEditorShowing}
            onChange={(e) => setCodeEditorShowing(e.target.checked)}
          />
        </label>
      </div>
    </>
  );
}

export default ExampleList;
