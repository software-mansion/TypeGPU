import { useAtom } from 'jotai/react';
import { RESET } from 'jotai/utils';
import { Suspense, useState } from 'react';
import { ExampleNotFound } from './ExampleNotFound';
import { Home } from './Home';
import { ExampleLink } from './common/ExampleLink';
import { Switch } from './common/Switch';
import { ExampleView } from './example/ExampleView';
import { examples } from './example/examples';
import { currentExampleAtom } from './router';

function App() {
  const [currentExample, setCurrentExample] = useAtom(currentExampleAtom);
  const [codeEditorShowing, setCodeEditorShowing] = useState(true);

  const content = (() => {
    if (!currentExample) {
      return <Home />;
    }

    if (currentExample in examples) {
      return (
        <ExampleView
          key={currentExample}
          example={examples[currentExample]}
          codeEditorShowing={codeEditorShowing}
        />
      );
    }

    return <ExampleNotFound />;
  })();

  return (
    <>
      <div className="flex h-screen">
        <aside className="flex flex-col p-4 min-w-64">
          <header className="pb-6">
            <button
              type="button"
              className="mx-auto p-4 text-2xl font-outfit cursor-pointer"
              onClick={() => setCurrentExample(RESET)}
            >
              <strong>wigsill</strong> - examples
            </button>
          </header>
          <nav className="flex flex-col flex-1 gap-2 overflow-y-auto">
            <ExampleLink exampleKey={undefined}>Home</ExampleLink>
            <hr className="my-2" />
            {Object.entries(examples).map(([key, example]) => (
              <ExampleLink key={key} exampleKey={key}>
                {example.metadata.title}
              </ExampleLink>
            ))}
          </nav>
          <label className="flex gap-3 items-center justify-center cursor-pointer p-4 bg-slate-100 rounded-lg">
            <span>Code editor</span>
            <Switch
              checked={codeEditorShowing}
              onChange={(e) => setCodeEditorShowing(e.target.checked)}
            />
          </label>
        </aside>
        <main className="flex-1 flex flex-col bg-slate-100">
          <Suspense fallback={'Loading...'}>{content}</Suspense>
        </main>
      </div>
    </>
  );
}

export default App;
