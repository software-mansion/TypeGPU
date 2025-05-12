import { useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { examples } from '../utils/examples/exampleContent.ts';
import { type Example, exampleCategories } from '../utils/examples/types.ts';
import { ExampleLink } from './ExampleLink.tsx';

export function SearchableExampleList(
  { excludeTags = [] }: { excludeTags?: string[] },
) {
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();

  const allExamples = useMemo<Example[]>(
    () =>
      Object.values(examples).filter((ex) =>
        !ex.metadata.tags?.some((tag) => excludeTags.includes(tag))
      ),
    [excludeTags],
  );

  const fuse = useMemo(
    () =>
      new Fuse(allExamples, {
        keys: [
          { name: 'metadata.title', weight: 0.7 },
          { name: 'metadata.tags', weight: 0.3 },
        ],
      }),
    [allExamples],
  );

  const filteredExamples = useMemo<Example[]>(
    () =>
      trimmedQuery
        ? fuse.search(trimmedQuery).map((result) => result.item)
        : allExamples,
    [trimmedQuery, fuse, allExamples],
  );

  const examplesByCategories = useMemo<Record<string, Example[]>>(
    () =>
      filteredExamples.reduce((groups, example) => {
        const category = example.metadata.category;
        if (!groups[category]) {
          groups[category] = [];
        }
        groups[category].push(example);
        return groups;
      }, {} as Record<string, Example[]>),
    [filteredExamples],
  );

  const categoriesToShow = useMemo(
    () =>
      exampleCategories
        .filter((category) => examplesByCategories[category.key]?.length > 0)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [examplesByCategories],
  );

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
          className='w-full box-border border border-purple-200 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-inset'
        />
      </div>
      <div className='flex flex-col gap-10 flex-1 overflow-y-auto min-h-0'>
        {categoriesToShow.length > 0
          ? (
            categoriesToShow.map((category) => (
              <div key={category.key} className='flex flex-col gap-5'>
                <div className='flex items-center justify-center w-full'>
                  <div className='h-px bg-gray-200 flex-grow' />
                  <h2 className='text-2xl font-bold text-black px-6 py-2 text-center'>
                    {category.label}
                  </h2>
                  <div className='h-px bg-gray-200 flex-grow' />
                </div>
                <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-6'>
                  {examplesByCategories[category.key]?.map((ex: Example) => (
                    <ExampleLink exampleKey={ex.key} key={ex.key}>
                      <div className='h-36 bg-gray-100 flex items-center justify-center overflow-hidden'>
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
                        <h3 className='text-lg font-semibold mb-2 text-black'>
                          {ex.metadata.title}
                        </h3>
                        {ex.metadata.tags && ex.metadata.tags.length > 0 && (
                          <div className='flex flex-wrap gap-1'>
                            {ex.metadata.tags.map((tag: string) => (
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
                </div>
              </div>
            ))
          )
          : (
            <div className='text-center text-gray-500'>
              No examples match your search.
            </div>
          )}
      </div>
    </div>
  );
}
