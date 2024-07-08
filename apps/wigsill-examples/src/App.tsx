import { Suspense } from 'react';
import { RESET } from 'jotai/utils';
import { useAtom } from 'jotai/react';

import { currentExampleAtom } from './router';
import { ExampleLink } from './common/ExampleLink';
import { examples } from './examples';
import { ExampleNotFound } from './ExampleNotFound';
import { Home } from './Home';

function App() {
  const [currentExample, setCurrentExample] = useAtom(currentExampleAtom);

  const content = (() => {
    if (!currentExample) {
      return <Home />;
    }

    if (currentExample && currentExample in examples) {
      const Example = examples[currentExample as keyof typeof examples];
      return <Example />;
    }

    return <ExampleNotFound />;
  })();

  return (
    <>
      <div className="flex h-screen">
        <aside className="px-4 min-w-64">
          <header className="pb-6">
            <h1
              className="mx-auto px-4 text-2xl py-4 font-outfit"
              onClick={() => setCurrentExample(RESET)}>
              <strong>wigsill</strong> - examples
            </h1>
          </header>
          <nav className="flex flex-col gap-2 overflow-y-auto">
            <ExampleLink exampleKey={undefined}>Home</ExampleLink>
            <hr className="my-2" />
            <ExampleLink exampleKey="random-tiles">Random tiles</ExampleLink>
            <ExampleLink exampleKey="another">Another</ExampleLink>
          </nav>
        </aside>
        <main className="flex-1 flex flex-col bg-slate-100">
          <Suspense fallback={'Loading...'}>{content}</Suspense>
        </main>
      </div>
    </>
  );
}

export default App;
