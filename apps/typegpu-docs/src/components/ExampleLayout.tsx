import { useSetAtom } from 'jotai';
import type { ReactNode } from 'react';
import { useId, useRef } from 'react';
import CrossSvg from '../assets/cross.svg';
import HamburgerSvg from '../assets/hamburger.svg';
import {
  codeEditorShownAtom,
  experimentalExamplesShownAtom,
  groupExamplesByCategoryAtom,
  menuShownAtom,
} from '../utils/examples/exampleViewStateAtoms.ts';
import { SearchableExampleList } from './SearchableExampleList.tsx';
import { Button } from './design/Button.tsx';
import { Toggle } from './design/Toggle.tsx';
import { useHydratedAtom } from '../utils/useHydrated.ts';

interface ExampleLayoutProps {
  children?: ReactNode | undefined;
}

export function ExampleLayout(props: ExampleLayoutProps) {
  const [menuShown, setMenuShown] = useHydratedAtom(menuShownAtom, false);
  const [codeShown, setCodeShown] = useHydratedAtom(codeEditorShownAtom, false);

  return (
    <>
      <div className="absolute top-4 left-4 z-50 flex gap-2 text-sm md:hidden">
        {!menuShown && (
          <Button onClick={() => setMenuShown(true)}>
            <img src={HamburgerSvg.src} alt="menu" className="-m-2 h-6 w-6" />
          </Button>
        )}

        <Button onClick={() => setCodeShown((prev) => !prev)}>
          {/* Applying the actual label only after the component has been hydrated */}
          {codeShown ? 'Preview' : 'Code'}
        </Button>
      </div>

      <div className="box-border flex h-dvh gap-4 bg-tameplum-50 p-4">
        {menuShown && <SideMenu />}
        {props.children}
      </div>
    </>
  );
}

function SideMenu() {
  const setMenuShown = useSetAtom(menuShownAtom);
  const [experimentalShowing, setExperimentalShowing] = useHydratedAtom(
    experimentalExamplesShownAtom,
    true,
  );
  const [groupByCategory, setGroupByCategory] = useHydratedAtom(groupExamplesByCategoryAtom, false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const experimentalExamplesToggleId = useId();
  const groupByCategoryToggleId = useId();

  return (
    <aside className="absolute inset-0 z-50 box-border flex w-full flex-col bg-white md:static md:w-75 md:rounded-2xl">
      <header className="px-5 py-3">
        <div className="grid place-items-center">
          <a href="/TypeGPU" className="box-border grid h-12 cursor-pointer place-content-center">
            <img className="w-40" src="/TypeGPU/typegpu-logo-light.svg" alt="TypeGPU Logo" />
          </a>
        </div>
        <div className="absolute top-5 right-5 md:hidden">
          <Button onClick={() => setMenuShown(false)}>
            <img src={CrossSvg.src} alt="Close menu" className="h-3 w-3" />
          </Button>
        </div>
      </header>

      <div className="box-border w-full px-5">
        <hr className="my-0 box-border w-full border-tameplum-100 border-t" />
      </div>

      <div className="my-3 min-h-0 flex-1 overflow-y-auto px-5" ref={scrollRef}>
        <SearchableExampleList
          excludeApis={experimentalShowing ? [] : ['~unstable']}
          scrollContainerRef={scrollRef}
        />
      </div>

      <div className="box-border w-full px-5">
        <hr className="my-0 box-border w-full border-tameplum-100 border-t" />
      </div>

      <div className="flex items-center gap-2 px-5 py-3 text-xs text-gray-600">
        <label
          htmlFor={experimentalExamplesToggleId}
          className="flex flex-1 cursor-pointer items-center justify-between gap-2"
        >
          <span className="whitespace-nowrap">Experimental</span>
          <Toggle
            id={experimentalExamplesToggleId}
            checked={experimentalShowing}
            onChange={(e) => setExperimentalShowing(e.target.checked)}
          />
        </label>
        <div className="h-4 w-px shrink-0 bg-tameplum-100" />
        <label
          htmlFor={groupByCategoryToggleId}
          className="flex flex-1 cursor-pointer items-center justify-between gap-2"
        >
          <span className="whitespace-nowrap">Grouped</span>
          <Toggle
            id={groupByCategoryToggleId}
            checked={groupByCategory}
            onChange={(e) => setGroupByCategory(e.target.checked)}
          />
        </label>
      </div>
    </aside>
  );
}
