import { examplesByCategory } from '../utils/examples/exampleContent';
import { exampleCategories } from '../utils/examples/types';
import { ExampleLink } from './ExampleLink';

function ExampleList() {
  return (
    <>
      <nav className="flex flex-col flex-1 gap-7 py-4 overflow-y-auto min-w-64">
        {/* <ExampleLink key={PLAYGROUND_KEY} exampleKey={PLAYGROUND_KEY}>
          Playground
        </ExampleLink>
        <hr /> */}
        {exampleCategories.map((category) =>
          (examplesByCategory[category.key] ?? []).map((example) => (
            <ExampleLink key={example.key} exampleKey={example.key}>
              {example.metadata.title}
            </ExampleLink>
          )),
        )}
      </nav>
    </>
  );
}

export default ExampleList;
