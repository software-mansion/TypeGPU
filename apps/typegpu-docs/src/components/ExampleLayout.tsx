import { useSetAtom } from 'jotai';
import type { ReactNode } from 'react';
import { useId, useRef } from 'react';
import CrossSvg from '../assets/cross.svg';
import DiscordIconSvg from '../assets/discord-icon.svg';
import GithubIconSvg from '../assets/github-icon.svg';
import HamburgerSvg from '../assets/hamburger.svg';
import {
  codeEditorShownAtom,
  experimentalExamplesShownAtom,
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const experimentalExamplesToggleId = useId();

  return (
    <aside className="absolute inset-0 z-50 box-border flex w-full flex-col bg-white md:static md:w-75 md:rounded-2xl">
      <header className="p-5">
        <div className="grid place-items-center">
          <a href="/TypeGPU" className="box-border grid h-20 cursor-pointer place-content-center">
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

      <div className="my-5 min-h-0 flex-1 overflow-y-auto px-5" ref={scrollRef}>
        <section className="mb-5 space-y-2 border-tameplum-100 border-b pb-5">
          <h1 className="font-medium text-lg">Welcome to examples page</h1>
          <p className="text-sm">
            Test out the power of our TypeScript library and get to know TypeGPU.
          </p>
          <a
            href="/TypeGPU/why-typegpu"
            className="bg-gradient-to-r from-gradient-purple-dark to-gradient-blue-dark bg-clip-text text-sm text-transparent underline"
          >
            Learn more about TypeGPU here
          </a>
        </section>

        <SearchableExampleList
          excludeTags={experimentalShowing ? [] : ['experimental']}
          scrollContainerRef={scrollRef}
        />
      </div>

      <div className="box-border w-full px-5">
        <hr className="my-0 box-border w-full border-tameplum-100 border-t" />
      </div>

      <label
        htmlFor={experimentalExamplesToggleId}
        className="flex cursor-pointer items-center justify-between gap-3 p-5 text-sm"
      >
        <span>Experimental examples</span>
        <Toggle
          id={experimentalExamplesToggleId}
          checked={experimentalShowing}
          onChange={(e) => setExperimentalShowing(e.target.checked)}
        />
      </label>

      <div className="flex justify-between px-5 pb-5 text-tameplum-800 text-xs">
        <div>&copy; {new Date().getFullYear()} Software Mansion S.A.</div>
        <div className="flex items-center gap-3">
          <a href="https://discord.gg/8jpfgDqPcM" target="_blank" rel="noreferrer">
            <img src={DiscordIconSvg.src} className="opacity-75" alt="github logo" />
          </a>
          <a href="https://github.com/software-mansion/TypeGPU" target="_blank" rel="noreferrer">
            <img src={GithubIconSvg.src} className="opacity-75" alt="discord logo" />
          </a>
        </div>
      </div>
    </aside>
  );
}
