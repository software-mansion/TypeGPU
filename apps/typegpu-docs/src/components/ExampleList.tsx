import { examplesByCategory } from '../utils/examples/exampleContent.ts';
import { exampleCategories } from '../utils/examples/types.ts';
import { ExampleLink } from './ExampleLink.tsx';

function ExampleList({ excludeTags = [] }: { excludeTags?: string[] }) {
  return (
    <>
      <nav className='box-border flex min-w-64 flex-1 flex-col gap-6 overflow-y-auto py-4'>
        {
          /* <ExampleLink key={PLAYGROUND_KEY} exampleKey={PLAYGROUND_KEY}>
          Playground
        </ExampleLink>
        <hr className="border-tameplum-100" /> */
        }
        {exampleCategories.map((category) =>
          (examplesByCategory[category.key] ?? []).map((example) => {
            if (
              example.metadata.tags?.some((tag) => excludeTags.includes(tag))
            ) {
              return null;
            }

            return (
              <ExampleLink
                key={example.key}
                exampleKey={example.key}
                isExperimental={example.metadata.tags?.includes(
                  'experimental',
                ) ?? false}
              >
                {example.metadata.title}
              </ExampleLink>
            );
          })
        )}
      </nav>
    </>
  );
}

export default ExampleList;
