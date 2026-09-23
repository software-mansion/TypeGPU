import Fuse from 'fuse.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { examples } from '../examples/exampleContent.ts';
import type { Example } from '../utils/examples/types.ts';
import { ExampleCard } from './ExampleCard.tsx';

function ExamplesGrid({ examples }: { examples: Example[] }) {
  return (
    <div className="grid grid-cols-1 gap-1">
      {examples.map((ex) => (
        <ExampleCard example={ex} key={ex.key} />
      ))}
    </div>
  );
}

const DEV = process.env.NODE_ENV === 'development';
const TEST = process.env.NODE_ENV === 'test';

export function SearchableExampleList({
  scrollContainerRef,
}: {
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedApis, setSelectedApis] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [isScrolledFromTop, setIsScrolledFromTop] = useState(false);

  const allExamples = useMemo(
    () => Object.values(examples).filter((ex) => DEV || TEST || !ex.metadata.dev),
    [],
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
      Array.from(new Set(allExamples.flatMap((ex) => ex.usedApis))).sort((a, b) =>
        a.localeCompare(b),
      ),
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

  useEffect(() => {
    const scrollContainer = scrollContainerRef?.current;
    if (!scrollContainer) {
      return;
    }

    const updateFade = () => setIsScrolledFromTop(scrollContainer.scrollTop > 1);
    updateFade();
    scrollContainer.addEventListener('scroll', updateFade, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', updateFade);
  }, [scrollContainerRef]);

  return (
    <div className="flex w-full flex-col">
      <div className="sticky top-0 z-20 w-full bg-white pb-4 dark:bg-[#232736]">
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
              aria-label="Search examples"
              className="border-tameplum-100 bg-tameplum-20 text-navy-100 placeholder:text-tameplum-600 focus:border-accent-600 dark:border-white/10 dark:bg-[#1b1f2c] dark:text-almost-white dark:placeholder:text-gray-400 box-border min-w-0 flex-1 rounded-none border px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-accent-600/20"
            />
            {(availableTags.length > 0 || availableApis.length > 0) && (
              <button
                type="button"
                onClick={() => setFilterOpen((prev) => !prev)}
                className={`flex shrink-0 items-center gap-1.5 rounded-none border px-3 py-2 text-xs font-medium transition ${
                  filterOpen || selectedTags.length > 0 || selectedApis.length > 0
                    ? 'border-accent-600 bg-accent-600/10 text-accent-600 dark:border-accent-200 dark:text-accent-200'
                    : 'border-tameplum-100 bg-tameplum-50 text-tameplum-600 hover:text-navy-80 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:text-white'
                }`}
              >
                <span>Filter</span>
                {(selectedTags.length > 0 || selectedApis.length > 0) && (
                  <span className="rounded-none bg-gradient-to-r from-gradient-purple-dark to-gradient-blue-dark px-1.5 py-px text-white text-[10px] leading-none">
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
              className="border-tameplum-100 bg-white dark:border-white/10 dark:bg-[#272b3c] absolute top-full right-0 left-0 z-30 mt-2 overflow-y-auto rounded-none border p-3 shadow-xl"
              style={{ maxHeight: '60vh' }}
            >
              {availableTags.length > 0 && (
                <>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-tameplum-600 dark:text-gray-300 px-0.5 text-xs font-medium">
                      Tags
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTags([]);
                        setSelectedApis([]);
                      }}
                      disabled={selectedTags.length === 0 && selectedApis.length === 0}
                      className={`flex items-center gap-1 rounded-none border border-tameplum-100 px-2 py-0.5 text-[10px] text-tameplum-600 transition-colors hover:border-tameplum-600 hover:bg-tameplum-50 ${selectedTags.length === 0 && selectedApis.length === 0 ? 'invisible' : ''}`}
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
                              ? 'rounded-none bg-gradient-to-r from-gradient-purple-dark to-gradient-blue-dark px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-white transition-opacity hover:opacity-90'
                              : 'rounded-none bg-tameplum-50 px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-tameplum-600 transition-colors hover:bg-tameplum-100 dark:bg-white/6 dark:text-gray-300 dark:hover:bg-white/10'
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
                    className={`mb-1.5 px-0.5 text-xs font-medium text-tameplum-600 dark:text-gray-300 ${availableTags.length > 0 ? 'mt-3' : ''}`}
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
                              ? 'rounded-none bg-gradient-to-r from-gradient-purple-dark to-gradient-blue-dark px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-white transition-opacity hover:opacity-90'
                              : 'rounded-none bg-tameplum-50 px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-tameplum-600 transition-colors hover:bg-tameplum-100 dark:bg-white/6 dark:text-gray-300 dark:hover:bg-white/10'
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
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute top-full right-0 left-0 h-8 bg-gradient-to-b from-white to-transparent transition-opacity duration-150 dark:from-[#232736] ${
            isScrolledFromTop ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>
      <div className="flex flex-1 flex-col gap-10">
        {query.trim() ? (
          filteredExamples.length > 0 ? (
            <div className="flex flex-col gap-5">
              <ExamplesGrid examples={filteredExamples} />
            </div>
          ) : (
            <div className="text-tameplum-600 dark:text-gray-300 rounded-none border border-dashed border-tameplum-100 px-4 py-10 text-center text-sm dark:border-white/10">
              No examples match your search.
            </div>
          )
        ) : (
          <div className="flex flex-col gap-5">
            <ExamplesGrid examples={sortedExamples} />
          </div>
        )}
      </div>
    </div>
  );
}
