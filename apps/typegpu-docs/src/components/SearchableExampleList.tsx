import Fuse from 'fuse.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { examples } from '../examples/exampleContent.ts';
import { groupExamplesByCategoryAtom } from '../utils/examples/exampleViewStateAtoms.ts';
import { type Example, exampleCategories } from '../utils/examples/types.ts';
import { useHydratedAtom } from '../utils/useHydrated.ts';
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

const HIDDEN_API_IDS = new Set(['~unstable']);

export function SearchableExampleList({
  excludeApis = [],
  scrollContainerRef,
}: {
  excludeApis?: string[];
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const [query, setQuery] = useState('');
  const [groupByCategory] = useHydratedAtom(groupExamplesByCategoryAtom, false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedApis, setSelectedApis] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  const allExamples = useMemo(
    () =>
      Object.values(examples).filter(
        (ex) =>
          !ex.usedApis.some((api) => excludeApis.includes(api)) &&
          (DEV || TEST || !ex.metadata.dev),
      ),
    [excludeApis],
  );

  const availableTags = useMemo(
    () =>
      Array.from(new Set(allExamples.flatMap((ex) => ex.metadata.tags ?? []))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [allExamples],
  );

  const availableApis = useMemo(
    () =>
      Array.from(
        new Set(allExamples.flatMap((ex) => ex.usedApis.filter((id) => !HIDDEN_API_IDS.has(id)))),
      ).sort((a, b) => a.localeCompare(b)),
    [allExamples],
  );

  const tagFilteredExamples = useMemo(
    () =>
      allExamples.filter(
        (ex) =>
          (selectedTags.length === 0 ||
            (ex.metadata.tags ?? []).some((tag) => selectedTags.includes(tag))) &&
          (selectedApis.length === 0 || ex.usedApis.some((api) => selectedApis.includes(api))),
      ),
    [allExamples, selectedTags, selectedApis],
  );

  const fuse = useMemo(
    () =>
      new Fuse(tagFilteredExamples, {
        keys: [
          { name: 'metadata.title', weight: 0.7 },
          { name: 'metadata.tags', weight: 0.2 },
          { name: 'usedApis', weight: 0.2 },
          { name: 'metadata.category', weight: 0.1 },
        ],
        threshold: 0.4,
      }),
    [tagFilteredExamples],
  );

  const filteredExamples = useMemo(() => {
    const trimmedQuery = query.trim();
    return trimmedQuery ? fuse.search(trimmedQuery).map((r) => r.item) : tagFilteredExamples;
  }, [query, fuse, tagFilteredExamples]);

  const sortedExamples = useMemo(
    () =>
      [...filteredExamples].toSorted((a, b) => {
        const coolDiff = b.metadata.coolFactor - a.metadata.coolFactor;
        if (coolDiff !== 0) {
          return coolDiff;
        }
        return a.metadata.title.localeCompare(b.metadata.title);
      }),
    [filteredExamples],
  );

  const examplesByCategories = useMemo(
    () =>
      sortedExamples.reduce(
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
    [sortedExamples],
  );

  const categoriesToShow = useMemo(
    () =>
      exampleCategories
        .filter((category) => examplesByCategories[category.key]?.length > 0)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [examplesByCategories],
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const filterContainerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!filterOpen) {
      return;
    }
    const listener = (e: MouseEvent) => {
      if (filterContainerRef.current && !filterContainerRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [filterOpen]);

  return (
    <div className="flex w-full flex-col">
      <div
        className="sticky top-0 z-20 w-full bg-white pb-4"
        style={{
          background: 'linear-gradient(to bottom, white 60%, transparent 100%)',
        }}
      >
        <div className="relative" ref={filterContainerRef}>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search examples..."
              value={query}
              onChange={(e) => {
                if (scrollContainerRef?.current) {
                  scrollContainerRef.current.scrollTop = 0;
                }
                setQuery(e.target.value);
              }}
              className="box-border min-w-0 flex-1 rounded-full border border-purple-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-inset"
            />
            {(availableTags.length > 0 || availableApis.length > 0) && (
              <button
                type="button"
                onClick={() => setFilterOpen((prev) => !prev)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition ${
                  filterOpen || selectedTags.length > 0 || selectedApis.length > 0
                    ? 'border-purple-300 bg-purple-50 text-purple-700'
                    : 'border-purple-200 text-gray-500 hover:bg-purple-50 hover:text-purple-700'
                }`}
              >
                <span>Filter</span>
                {(selectedTags.length > 0 || selectedApis.length > 0) && (
                  <span className="rounded-full bg-gradient-to-r from-gradient-purple-dark to-gradient-blue-dark px-1.5 py-px text-white text-[10px] leading-none">
                    {selectedTags.length + selectedApis.length}
                  </span>
                )}
                <svg
                  className={`h-3 w-3 transition-transform duration-150 ${filterOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 4l4 4 4-4" />
                </svg>
              </button>
            )}
          </div>
          {(availableTags.length > 0 || availableApis.length > 0) && filterOpen && (
            <div
              className="absolute left-0 right-0 top-full z-30 mt-1 overflow-y-auto rounded-2xl border border-purple-100 bg-white p-3 shadow-lg"
              style={{ maxHeight: '60vh' }}
            >
              {availableTags.length > 0 && (
                <>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-tameplum-400">
                      Tags
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTags([]);
                        setSelectedApis([]);
                      }}
                      disabled={selectedTags.length === 0 && selectedApis.length === 0}
                      className={`flex items-center gap-1 rounded-full border border-tameplum-200 px-2 py-0.5 text-[10px] text-tameplum-600 transition-colors hover:border-tameplum-300 hover:bg-tameplum-50 ${selectedTags.length === 0 && selectedApis.length === 0 ? 'invisible' : ''}`}
                    >
                      <svg
                        className="h-2.5 w-2.5"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <path d="M2 2l8 8M10 2l-8 8" />
                      </svg>
                      Clear all
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-x-1.5 gap-y-1.5">
                    {availableTags.map((tag) => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            if (scrollContainerRef?.current) {
                              scrollContainerRef.current.scrollTop = 0;
                            }
                            setSelectedTags((prev) =>
                              prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                            );
                          }}
                          className={
                            isSelected
                              ? 'rounded-full bg-gradient-to-r from-gradient-purple-dark to-gradient-blue-dark px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-white transition-opacity hover:opacity-90'
                              : 'rounded-full bg-tameplum-50 px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-tameplum-700 transition-colors hover:bg-tameplum-100'
                          }
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {availableApis.length > 0 && (
                <>
                  <p
                    className={`mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-tameplum-400 ${availableTags.length > 0 ? 'mt-3' : ''}`}
                  >
                    APIs
                  </p>
                  <div className="flex flex-wrap gap-x-1.5 gap-y-1.5">
                    {availableApis.map((api) => {
                      const isSelected = selectedApis.includes(api);
                      return (
                        <button
                          key={api}
                          type="button"
                          onClick={() => {
                            if (scrollContainerRef?.current) {
                              scrollContainerRef.current.scrollTop = 0;
                            }
                            setSelectedApis((prev) =>
                              prev.includes(api) ? prev.filter((a) => a !== api) : [...prev, api],
                            );
                          }}
                          className={
                            isSelected
                              ? 'rounded-full bg-gradient-to-r from-gradient-purple-dark to-gradient-blue-dark px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-white transition-opacity hover:opacity-90'
                              : 'rounded-full bg-tameplum-50 px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-tameplum-700 transition-colors hover:bg-tameplum-100'
                          }
                        >
                          {api}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
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
        ) : groupByCategory ? (
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
        ) : (
          <div className="flex flex-col gap-5">
            <ExamplesGrid examples={sortedExamples} />
          </div>
        )}
      </div>
    </div>
  );
}
