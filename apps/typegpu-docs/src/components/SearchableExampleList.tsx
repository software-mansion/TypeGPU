import { useMemo, useState } from 'react';
import { examples } from '../utils/examples/exampleContent.ts';
import type { Example } from '../utils/examples/types.ts';
import { ExampleLink } from './ExampleLink.tsx';

export function SearchableExampleList(
  { excludeTags = [] }: { excludeTags?: string[] },
) {
  const [query, setQuery] = useState('');
  const allExamples: Example[] = useMemo(() =>
    Object.values(examples)
      .filter((ex) =>
        !excludeTags.some((tag) => ex.metadata.tags?.includes(tag))
      ), [excludeTags]);

  const filteredExamples = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) {
      return allExamples;
    }
    return allExamples.filter(({ metadata }) => {
      const { title, tags = [] } = metadata;
      if (title.toLowerCase().includes(q)) {
        return true;
      }
      return tags.some((tag) => tag.toLowerCase().includes(q));
    });
  }, [query, allExamples]);

  return (
    <div className='flex flex-col w-full max-w-full'>
      <div
        className='sticky isolate top-0 pb-4 w-full flex-shrink-0 z-10'
        style={{
          background: 'linear-gradient(to bottom, white 50%, transparent 100%)',
        }}
      >
        <input
          type='text'
          placeholder='Search examples by name or tag...'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className='w-full box-border border border-purple-300 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-inset'
        />
      </div>
      <div className='grid grid-cols-1 gap-6 flex-1 overflow-y-auto min-h-0'>
        {filteredExamples.map((ex) => (
          <ExampleLink exampleKey={ex.key} key={ex.key}>
            <div className='h-24 bg-gray-100 flex items-center justify-center overflow-hidden'>
              {ex.thumbnailUrl
                ? (
                  <img
                    src={ex.thumbnailUrl}
                    alt={ex.metadata.title}
                    className='object-cover w-full h-full'
                  />
                )
                : (
                  <span className='text-gray-400 fallback'>
                    No thumbnail
                  </span>
                )}
            </div>
            <div className='p-3'>
              <h3 className='text-lg font-semibold mb-2'>
                {ex.metadata.title}
              </h3>
              {ex.metadata.tags && ex.metadata.tags.length > 0 && (
                <div className='flex flex-wrap gap-1'>
                  {ex.metadata.tags.map((tag) => (
                    <span
                      key={tag}
                      className='text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full'
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </ExampleLink>
        ))}
        {filteredExamples.length === 0 && (
          <div className='col-span-full text-center text-gray-500'>
            No examples match your search.
          </div>
        )}
      </div>
    </div>
  );
}
