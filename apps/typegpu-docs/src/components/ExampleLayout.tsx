import cs from 'classnames';
import { useAtom, useAtomValue } from 'jotai';
import DiscordIconSvg from '../assets/discord-icon.svg';
import GithubIconSvg from '../assets/github-icon.svg';
import HamburgerSvg from '../assets/hamburger.svg';
import { codeEditorShownMobileAtom } from '../utils/examples/codeEditorShownAtom';
import {
  menuShownAtom,
  menuShownMobileAtom,
} from '../utils/examples/menuShownAtom';
import ExampleList from './ExampleList';
import ExamplePage from './ExamplePage';
import { Button } from './design/Button';

const isDev = import.meta.env.DEV;

export function ExampleLayout() {
  const menuShown = useAtomValue(menuShownAtom);
  const [menuShownMobile, setMenuShownMobile] = useAtom(menuShownMobileAtom);
  const [codeShownMobile, setCodeShownMobile] = useAtom(
    codeEditorShownMobileAtom,
  );

  return (
    <>
      <div className="md:hidden flex absolute top-4 left-4 z-50 gap-4 text-sm">
        {menuShownMobile ? null : (
          <Button onClick={() => setMenuShownMobile(true)}>
            <img src={HamburgerSvg.src} alt="menu" className="h-6 w-6" />
          </Button>
        )}

        <Button
          onClick={() =>
            setCodeShownMobile((codeShownMobile) => !codeShownMobile)
          }
        >
          {codeShownMobile ? 'Preview' : 'Code'}
        </Button>
      </div>

      <div className="box-border flex h-[100dvh] p-4 gap-4 bg-tameplum-50">
        {menuShown || menuShownMobile ? <SideMenu /> : null}
        <ExamplePage />
      </div>
    </>
  );
}

function SideMenu() {
  const menuShown = useAtomValue(menuShownAtom);
  const menuShownMobile = useAtomValue(menuShownMobileAtom);

  return (
    <aside
      className={cs(
        menuShown ? '' : 'md:hidden',
        menuShownMobile
          ? 'absolute inset-0 z-50 w-full md:static'
          : 'hidden md:flex',
        'box-border flex flex-col bg-white md:rounded-2xl md:w-[18.75rem] p-5 gap-5',
      )}
    >
      <header className="grid gap-5">
        <div className="grid place-items-center">
          <a href="/TypeGPU" className="block box-border py-4 cursor-pointer">
            <img
              className="w-40"
              src="/TypeGPU/typegpu-logo-light.svg"
              alt="TypeGPU Logo"
            />
          </a>
        </div>

        <hr className="my-0 box-border w-full border-t border-tameplum-100" />

        <div className="grid gap-6">
          <h1 className="m-0 font-medium text-xl">Welcome to examples page</h1>
          <p className="m-0 text-sm">
            Test out the power of our TypeScript library and get to know
            TypeGPU.
          </p>
          <a
            href="/TypeGPU/guides/getting-started"
            className="underline text-sm bg-gradient-to-r from-gradient-purple-dark to-gradient-blue-dark bg-clip-text text-transparent"
          >
            Learn more about TypeGPU here
          </a>
        </div>
      </header>

      <hr className="my-0 box-border w-full border-t border-tameplum-100" />

      <ExampleList excludeTags={isDev ? [] : ['experimental']} />

      <div className="flex justify-between text-tameplum-800 text-xs">
        <div>&copy; 2024 Software Mansion S.A.</div>
        <div className="flex gap-3 items-center">
          <a
            href="https://discord.gg/8jpfgDqPcM"
            target="_blank"
            rel="noreferrer"
          >
            <img
              src={DiscordIconSvg.src}
              className="opacity-75"
              alt="github logo"
            />
          </a>
          <a
            href="https://github.com/software-mansion/TypeGPU"
            target="_blank"
            rel="noreferrer"
          >
            <img
              src={GithubIconSvg.src}
              className="opacity-75"
              alt="discord logo"
            />
          </a>
        </div>
      </div>
    </aside>
  );
}
