import Fuse from 'fuse.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { examples } from '../examples/exampleContent.ts';
import { type Example, exampleCategories } from '../utils/examples/types.ts';
import { ExampleCard } from './ExampleCard.tsx';

function ExamplesGrid({ examples }: { examples: Example[] }) {
  return (
    <div className="mx-1 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-1">
      {examples.map((ex) => (
        <ExampleCard example={ex} key={ex.key} />
      ))}
    </div>
  );
}

const DEV = process.env.NODE_ENV === 'development';
const TEST = process.env.NODE_ENV === 'test';

export function SearchableExampleList({
  excludeTags = [],
  scrollContainerRef,
}: {
  excludeTags?: string[];
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const [query, setQuery] = useState('');

  const allExamples = useMemo(
    () =>
      Object.values(examples).filter(
        (ex) =>
          !ex.metadata.tags?.some((tag) => excludeTags.includes(tag)) &&
          (DEV || TEST || !ex.metadata.dev),
      ),
    [excludeTags],
  );

  const fuse = useMemo(
    () =>
      new Fuse(allExamples, {
        keys: [
          { name: 'metadata.title', weight: 0.7 },
          { name: 'metadata.tags', weight: 0.3 },
          { name: 'metadata.category', weight: 0.1 },
        ],
        threshold: 0.4,
      }),
    [allExamples],
  );

  const filteredExamples = useMemo(() => {
    const trimmedQuery = query.trim();
    return trimmedQuery ? fuse.search(trimmedQuery).map((r) => r.item) : allExamples;
  }, [query, fuse, allExamples]);

  const examplesByCategories = useMemo(
    () =>
      filteredExamples.reduce(
        (groups, example) => {
          const category = example.metadata.category;
          if (!groups[category]) {
            groups[category] = [];
          }
          groups[category].push(example);
          return groups;
        },
        {} as Record<string, Example[]>,
      ),
    [filteredExamples],
  );

  const categoriesToShow = useMemo(
    () =>
      exampleCategories
        .filter((category) => examplesByCategories[category.key]?.length > 0)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [examplesByCategories],
  );

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        inputRef.current?.focus();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', listener);

    return () => window.removeEventListener('keydown', listener);
  }, []);

  return (
    <div className="flex w-full flex-col">
      <div
        className="sticky top-0 z-20 w-full bg-white pb-4"
        style={{
          background: 'linear-gradient(to bottom, white 60%, transparent 100%)',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Search examples by name or tag..."
          value={query}
          onChange={(e) => {
            if (scrollContainerRef?.current) {
              scrollContainerRef.current.scrollTop = 0;
            }
            setQuery(e.target.value);
          }}
          className="box-border w-full rounded-full border border-purple-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-inset"
        />
      </div>
      <div className="flex flex-1 flex-col gap-10">
        {query.trim() ? (
          filteredExamples.length > 0 ? (
            <div className="flex flex-col gap-5">
              <ExamplesGrid examples={filteredExamples} />
            </div>
          ) : (
            <div className="text-center text-gray-500">No examples match your search.</div>
          )
        ) : (
          categoriesToShow.map((category) => (
            <div key={category.key} className="flex flex-col">
              <div
                className="sticky top-8 z-10 flex w-full items-center justify-center bg-white pb-5"
                style={{
                  background: 'linear-gradient(to bottom, white 50%, transparent 100%)',
                }}
              >
                <hr className="box-border w-full border-tameplum-100 border-t" />
                <h2 className="px-3 py-1 text-center font-bold text-2xl">{category.label}</h2>
                <hr className="box-border w-full border-tameplum-100 border-t" />
              </div>
              <ExamplesGrid examples={examplesByCategories[category.key] || []} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
