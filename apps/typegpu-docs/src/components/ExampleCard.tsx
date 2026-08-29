import cs from 'classnames';
import { useAtom, useSetAtom } from 'jotai';
import { RESET } from 'jotai/utils';
import type { MouseEvent } from 'react';
import type { Example } from '../utils/examples/types.ts';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom.ts';
import { menuShownAtom } from '../utils/examples/exampleViewStateAtoms.ts';
import useEvent from '../utils/useEvent.ts';
import { useHydrated } from '../utils/useHydrated.ts';

type Props = {
  example: Example;
};

export function ExampleCard({ example }: Props) {
  const isDev = example.metadata.dev;

  const hydrated = useHydrated();
  const [currentExample, setCurrentExample] = useAtom(currentExampleAtom);
  const setMenuShown = useSetAtom(menuShownAtom);

  const handleClick = useEvent((e: MouseEvent) => {
    e.preventDefault();
    setCurrentExample(example.key ?? RESET);
    if (window.matchMedia('(max-width: 767px)').matches) {
      setMenuShown(false);
    }
  });

  const isCurrentExample = hydrated && currentExample === example.key;

  return (
    <a
      key={example.key}
      // Even though we prevent the default behavior of this link
      // it is good to have this set semantically.
      href={`#example=${example.key}`}
      onClick={handleClick}
      aria-current={isCurrentExample ? 'page' : undefined}
      className={cs(
        'block rounded-none p-1 no-underline transition-colors',
        isCurrentExample
          ? 'bg-tameplum-100 dark:bg-white/10'
          : 'hover:bg-tameplum-50 dark:hover:bg-white/5',
      )}
    >
      <div className="flex items-center gap-2">
        <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden border border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-[#171a25]">
          {example.thumbnails ? (
            <picture className="block size-full">
              <source media="(min-width: 1026px)" srcSet={example.thumbnails.small} />
              <source media="(max-width: 1025px)" srcSet={example.thumbnails.large} />
              <img
                src={example.thumbnails.large}
                alt={example.metadata.title}
                className="size-full object-cover"
                loading="lazy"
              />
            </picture>
          ) : (
            <span className="text-tameplum-600 dark:text-gray-400 px-1 text-center text-[8px] leading-tight font-medium">
              Preview unavailable
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
          <h3 className="text-navy-100 dark:text-almost-white min-w-0 flex-1 line-clamp-2 text-sm font-medium">
            {example.metadata.title}
          </h3>
          {isDev && (
            <span className="shrink-0 rounded-none bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">
              Dev
            </span>
          )}
        </div>
      </div>
    </a>
  );
}
