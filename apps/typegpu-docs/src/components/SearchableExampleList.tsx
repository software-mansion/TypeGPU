import { useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { examples } from '../utils/examples/exampleContent.ts';
import { type Example, exampleCategories } from '../utils/examples/types.ts';
import { ExampleCard } from './ExampleCard.tsx';

function ExamplesGrid({ examples }: { examples: Example[] }) {
  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-6'>
      {examples.map((ex) => <ExampleCard example={ex} key={ex.key} />)}
    </div>
  );
}

export function SearchableExampleList(
  { excludeTags = [], scrollContainerRef }: {
    excludeTags?: string[];
    scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  },
) {
  const [query, setQuery] = useState('');

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

  const filteredExamples = useMemo<Example[]>(() => {
    const trimmedQuery = query.trim();
    return trimmedQuery
      ? fuse.search(trimmedQuery).map((r) => r.item)
      : allExamples;
  }, [query, fuse, allExamples]);

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
        className='sticky top-0 z-20 bg-white w-full pb-4 flex-shrink-0'
        style={{
          background: 'linear-gradient(to bottom, white 60%, transparent 100%)',
        }}
      >
        <input
          type='text'
          placeholder='Search examples by name or tag...'
          value={query}
          onChange={(e) => {
            if (scrollContainerRef?.current) {
              scrollContainerRef.current.scrollTop = 0;
            }
            setQuery(e.target.value);
          }}
          className='w-full box-border border border-purple-200 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-inset'
        />
      </div>
      <div className='flex flex-col gap-10 flex-1'>
        {query.trim()
          ? (
            filteredExamples.length > 0
              ? (
                <div className='flex flex-col gap-5'>
                  <ExamplesGrid examples={filteredExamples} />
                </div>
              )
              : (
                <div className='text-center text-gray-500'>
                  No examples match your search.
                </div>
              )
          )
          : (
            categoriesToShow.length > 0 && (
              categoriesToShow.map((category) => (
                <div key={category.key} className='flex flex-col'>
                  <div
                    className='sticky z-10 bg-white flex items-center justify-center w-full top-8'
                    style={{
                      background:
                        'linear-gradient(to bottom, white 70%, transparent 100%)',
                    }}
                  >
                    <div className='h-px bg-gray-200 flex-grow' />
                    <h2 className='text-2xl font-bold px-3 py-2'>
                      {category.label}
                    </h2>
                    <div className='h-px bg-gray-200 flex-grow' />
                  </div>
                  <ExamplesGrid
                    examples={examplesByCategories[category.key] || []}
                  />
                </div>
              ))
            )
          )}
      </div>
    </div>
  );
}
