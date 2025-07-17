import cs from 'classnames';
import { useAtom, useAtomValue } from 'jotai';
import { useId, useRef } from 'react';
import CrossSvg from '../assets/cross.svg';
import DiscordIconSvg from '../assets/discord-icon.svg';
import GithubIconSvg from '../assets/github-icon.svg';
import HamburgerSvg from '../assets/hamburger.svg';
import { codeEditorShownMobileAtom } from '../utils/examples/codeEditorShownAtom.ts';
import {
  menuShownAtom,
  menuShownMobileAtom,
} from '../utils/examples/menuShownAtom.ts';
import ExamplePage from './ExamplePage.tsx';
import { SearchableExampleList } from './SearchableExampleList.tsx';
import { Button } from './design/Button.tsx';
import { Toggle } from './design/Toggle.tsx';
import { experimentalExamplesShownAtom } from '../utils/examples/showExperimentalExamplesAtom.ts';

// biome-ignore lint/suspicious/noExplicitAny: it exists, I swear
(globalThis as any).__TYPEGPU_MEASURE_PERF__ = true;

export function ExampleLayout() {
  const menuShown = useAtomValue(menuShownAtom);
  const [menuShownMobile, setMenuShownMobile] = useAtom(menuShownMobileAtom);
  const [codeShownMobile, setCodeShownMobile] = useAtom(
    codeEditorShownMobileAtom,
  );

  return (
    <>
      <div className='absolute top-4 left-4 z-50 flex gap-2 text-sm md:hidden'>
        {menuShownMobile
          ? null
          : (
            <Button onClick={() => setMenuShownMobile(true)}>
              <img src={HamburgerSvg.src} alt='menu' className='-m-2 h-6 w-6' />
            </Button>
          )}

        <Button
          onClick={() =>
            setCodeShownMobile((codeShownMobile) => !codeShownMobile)}
        >
          {codeShownMobile ? 'Preview' : 'Code'}
        </Button>
      </div>

      <div className='box-border flex h-dvh gap-4 bg-tameplum-50 p-4'>
        {menuShown || menuShownMobile ? <SideMenu /> : null}
        <ExamplePage />
      </div>
    </>
  );
}

function SideMenu() {
  const menuShown = useAtomValue(menuShownAtom);
  const [menuShownMobile, setMenuShownMobile] = useAtom(menuShownMobileAtom);
  const [experimentalShowing, setExperimentalShowing] = useAtom(
    experimentalExamplesShownAtom,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const experimentalExamplesToggleId = useId();

  return (
    <aside
      className={cs(
        menuShown ? '' : 'md:hidden',
        menuShownMobile
          ? 'absolute inset-0 z-50 w-full md:static'
          : 'hidden md:flex',
        'box-border flex flex-col bg-white md:w-75 md:rounded-2xl',
      )}
    >
      <header className='p-5'>
        <div className='grid place-items-center'>
          <a href='/TypeGPU' className='box-border block cursor-pointer py-4'>
            <img
              className='w-40'
              src='/TypeGPU/typegpu-logo-light.svg'
              alt='TypeGPU Logo'
            />
          </a>
        </div>
        <div className='absolute top-5 right-5 md:hidden'>
          {menuShownMobile && (
            <Button onClick={() => setMenuShownMobile(false)}>
              <img src={CrossSvg.src} alt='Close menu' className='h-3 w-3' />
            </Button>
          )}
        </div>
      </header>

      <div className='box-border w-full px-5'>
        <hr className='my-0 box-border w-full border-tameplum-100 border-t' />
      </div>

      <div className='my-5 min-h-0 flex-1 overflow-y-auto px-5' ref={scrollRef}>
        <section className='mb-5 space-y-2 border-tameplum-100 border-b pb-5'>
          <h1 className='font-medium text-lg'>Welcome to examples page</h1>
          <p className='text-sm'>
            Test out the power of our TypeScript library and get to know
            TypeGPU.
          </p>
          <a
            href='/TypeGPU/why-typegpu'
            className='bg-gradient-to-r from-gradient-purple-dark to-gradient-blue-dark bg-clip-text text-sm text-transparent underline'
          >
            Learn more about TypeGPU here
          </a>
        </section>

        <SearchableExampleList
          excludeTags={[
            experimentalShowing ? [] : ['experimental'],
            typeof MediaStreamTrackProcessor === 'undefined' ? ['camera'] : [],
          ].flat()}
          scrollContainerRef={scrollRef}
        />
      </div>

      <div className='box-border w-full px-5'>
        <hr className='my-0 box-border w-full border-tameplum-100 border-t' />
      </div>

      <label
        htmlFor={experimentalExamplesToggleId}
        className='flex cursor-pointer items-center justify-between gap-3 p-5 text-sm'
      >
        <span>Experimental examples</span>
        <Toggle
          id={experimentalExamplesToggleId}
          checked={experimentalShowing}
          onChange={(e) => setExperimentalShowing(e.target.checked)}
        />
      </label>

      <div className='flex justify-between px-5 pb-5 text-tameplum-800 text-xs'>
        <div>&copy; {new Date().getFullYear()} Software Mansion S.A.</div>
        <div className='flex items-center gap-3'>
          <a
            href='https://discord.gg/8jpfgDqPcM'
            target='_blank'
            rel='noreferrer'
          >
            <img
              src={DiscordIconSvg.src}
              className='opacity-75'
              alt='github logo'
            />
          </a>
          <a
            href='https://github.com/software-mansion/TypeGPU'
            target='_blank'
            rel='noreferrer'
          >
            <img
              src={GithubIconSvg.src}
              className='opacity-75'
              alt='discord logo'
            />
          </a>
        </div>
      </div>
    </aside>
  );
}
