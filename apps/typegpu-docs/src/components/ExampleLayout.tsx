import type { ReactNode } from 'react';
import { useAtom } from 'jotai';
import { useEffect, useRef } from 'react';
import CrossSvg from '../assets/cross.svg';
import { exampleFullscreenAtom, menuShownAtom } from '../utils/examples/exampleViewStateAtoms.ts';
import { useHydrated, useHydratedAtom } from '../utils/useHydrated.ts';
import { SearchableExampleList } from './SearchableExampleList.tsx';

interface ExampleLayoutProps {
  children?: ReactNode;
}

export function ExampleLayout({ children }: ExampleLayoutProps) {
  const hydrated = useHydrated();
  const [menuShown, setMenuShown] = useAtom(menuShownAtom);
  const [fullscreen] = useHydratedAtom(exampleFullscreenAtom, false);

  useEffect(() => {
    document.documentElement.toggleAttribute('data-examples-fullscreen', fullscreen);
    return () => document.documentElement.removeAttribute('data-examples-fullscreen');
  }, [fullscreen]);

  useEffect(() => {
    setMenuShown(window.innerWidth >= 1025);
  }, [setMenuShown]);

  return (
    <div
      className={
        fullscreen
          ? 'h-dvh w-full bg-tameplum-50 dark:bg-[#171a25]'
          : 'relative isolate min-h-[calc(100dvh-6rem)] overflow-clip bg-[#f8f9ff] text-navy-100 dark:bg-[#1b1f2c] dark:text-almost-white'
      }
    >
      <div
        className={
          fullscreen
            ? 'flex h-full w-full'
            : 'box-border flex w-full gap-5 px-4 py-5 sm:px-6 md:px-8 md:py-8'
        }
      >
        {!fullscreen && (!hydrated || menuShown) && (
          <SideMenu hiddenUntilDesktop={!hydrated} onClose={() => setMenuShown(false)} />
        )}

        <main className={fullscreen ? 'h-full min-w-0 w-full flex-1' : 'min-w-0 flex-1'}>
          {children}
        </main>
      </div>

      {!fullscreen && (
        <footer className="text-tameplum-600 dark:text-gray-300 box-border flex w-full items-center justify-center px-6 pb-6 text-xs md:px-8">
          &copy; Software Mansion {new Date().getFullYear()}. All trademarks and copyrights belong
          to their respective owners.
        </footer>
      )}
    </div>
  );
}

function SideMenu({
  hiddenUntilDesktop,
  onClose,
}: {
  hiddenUntilDesktop: boolean;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <aside
      className={`border-tameplum-100 dark:border-white/10 dark:bg-[#232736] fixed inset-x-0 top-20 bottom-0 z-50 box-border w-full flex-col bg-white md:sticky md:top-28 md:bottom-auto md:z-10 md:max-h-[calc(100dvh-9rem)] md:w-84 md:shrink-0 md:overflow-hidden md:rounded-none md:border ${
        hiddenUntilDesktop ? 'hidden min-[1025px]:flex' : 'flex'
      }`}
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
        <div>
          <h2 className="text-navy-100 dark:text-almost-white mt-1 text-xl font-semibold">
            Explore examples
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-9 shrink-0 place-items-center rounded-none bg-transparent"
          aria-label="Close examples menu"
        >
          <img src={CrossSvg.src} alt="" className="size-3 dark:invert" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3" ref={scrollRef}>
        <SearchableExampleList scrollContainerRef={scrollRef} />
      </div>
    </aside>
  );
}
