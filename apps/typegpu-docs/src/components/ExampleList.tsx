import {
  PLAYGROUND_KEY,
  examplesByCategory,
} from '../utils/examples/exampleContent';
import { exampleCategories } from '../utils/examples/types';
import { ExampleLink } from './ExampleLink';

function ExampleList({ excludeTags = [] }: { excludeTags?: string[] }) {
  const filteredExamples = exampleCategories.flatMap((category) =>
    (examplesByCategory[category.key] ?? []).filter(
      (example) =>
        !example.metadata.tags?.some((tag) => excludeTags.includes(tag)),
    ),
  );

  return (
    <>
      <nav className="flex flex-col flex-1 gap-7 py-4 overflow-y-auto min-w-64">
        <ExampleLink key={PLAYGROUND_KEY} exampleKey={PLAYGROUND_KEY}>
          Playground
        </ExampleLink>
        <hr />
        {filteredExamples.map((example) => (
          <ExampleLink key={example.key} exampleKey={example.key}>
            {example.metadata.title}
          </ExampleLink>
        ))}
      </nav>
    </>
  );
}

export default ExampleList;
