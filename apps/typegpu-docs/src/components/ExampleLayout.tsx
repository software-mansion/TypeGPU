import cs from 'classnames';
import { useAtom, useAtomValue } from 'jotai';
import { useId, useState } from 'react';
import DiscordIconSvg from '../assets/discord-icon.svg';
import GithubIconSvg from '../assets/github-icon.svg';
import HamburgerSvg from '../assets/hamburger.svg';
import { codeEditorShownMobileAtom } from '../utils/examples/codeEditorShownAtom.ts';
import {
  menuShownAtom,
  menuShownMobileAtom,
} from '../utils/examples/menuShownAtom.ts';
import ExampleList from './ExampleList.tsx';
import ExamplePage from './ExamplePage.tsx';
import { Button } from './design/Button.tsx';
import { Toggle } from './design/Toggle.tsx';

export function ExampleLayout() {
  const menuShown = useAtomValue(menuShownAtom);
  const [menuShownMobile, setMenuShownMobile] = useAtom(menuShownMobileAtom);
  const [codeShownMobile, setCodeShownMobile] = useAtom(
    codeEditorShownMobileAtom,
  );

  return (
    <>
      <div className='absolute top-4 left-4 z-50 flex gap-4 text-sm md:hidden'>
        {menuShownMobile
          ? null
          : (
            <Button onClick={() => setMenuShownMobile(true)}>
              <img src={HamburgerSvg.src} alt='menu' className='h-6 w-6' />
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

const experimentalShowingLSKey = 'experimental-showing';

function SideMenu() {
  const menuShown = useAtomValue(menuShownAtom);
  const menuShownMobile = useAtomValue(menuShownMobileAtom);
  const [experimentalShowing, setExperimentalShowing] = useState(
    localStorage.getItem(experimentalShowingLSKey) === 'true',
  );

  const experimentalExamplesToggleId = useId();

  return (
    <aside
      className={cs(
        menuShown ? '' : 'md:hidden',
        menuShownMobile
          ? 'absolute inset-0 z-50 w-full md:static'
          : 'hidden md:flex',
        'box-border flex flex-col gap-5 overflow-auto bg-white p-5 md:w-75 md:rounded-2xl',
      )}
    >
      <header className='grid gap-5'>
        <div className='grid place-items-center'>
          <a href='/TypeGPU' className='box-border block cursor-pointer py-4'>
            <img
              className='w-40'
              src='/TypeGPU/typegpu-logo-light.svg'
              alt='TypeGPU Logo'
            />
          </a>
        </div>

        <hr className='my-0 box-border w-full border-tameplum-100 border-t' />

        <div className='grid gap-6'>
          <h1 className='m-0 font-medium text-xl'>Welcome to examples page</h1>
          <p className='m-0 text-sm'>
            Test out the power of our TypeScript library and get to know
            TypeGPU.
          </p>
          <a
            href='/TypeGPU/why-typegpu'
            className='bg-gradient-to-r from-gradient-purple-dark to-gradient-blue-dark bg-clip-text text-sm text-transparent underline'
          >
            Learn more about TypeGPU here
          </a>
        </div>
      </header>

      <hr className='my-0 box-border w-full border-tameplum-100 border-t' />

      <ExampleList
        excludeTags={[
          experimentalShowing ? [] : ['experimental'],
          typeof MediaStreamTrackProcessor === 'undefined' ? ['camera'] : [],
        ].flat()}
      />

      <hr className='my-0 box-border w-full border-tameplum-100 border-t' />

      <label
        htmlFor={experimentalExamplesToggleId}
        className='flex cursor-pointer items-center justify-between gap-3 text-sm'
      >
        <span>Experimental examples</span>
        <Toggle
          id={experimentalExamplesToggleId}
          checked={experimentalShowing}
          onChange={(e) => {
            const checked = e.target.checked;
            localStorage.setItem(
              experimentalShowingLSKey,
              checked ? 'true' : 'false',
            );
            setExperimentalShowing(checked);
          }}
        />
      </label>

      <div className='flex justify-between text-tameplum-800 text-xs'>
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
