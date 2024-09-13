import { useAtomValue } from 'jotai';
import DiscordIconSvg from '../assets/discord-icon.svg';
import GithubIconSvg from '../assets/github-icon.svg';
import { menuShownAtom } from '../utils/examples/menuShownAtom';
import ExampleList from './ExampleList';
import ExamplePage from './ExamplePage';

const isDev = import.meta.env.DEV;

export function ExampleLayout() {
  const menuShown = useAtomValue(menuShownAtom);

  return (
    <div className="flex h-screen p-4 gap-4 bg-tameplum-50">
      {menuShown ? <SideMenu /> : null}
      <ExamplePage />
    </div>
  );
}

function SideMenu() {
  return (
    <aside className="flex flex-col bg-white rounded-2xl w-[18.75rem] p-5 gap-5">
      <header className="grid gap-5">
        <div className="grid place-items-center">
          <a href="/TypeGPU" className="block cursor-pointer">
            <img
              className="my-4 w-40"
              src="/TypeGPU/typegpu-logo-light.svg"
              alt="TypeGPU Logo"
            />
          </a>
        </div>

        <hr />

        <div className="grid gap-6">
          <h1 className="font-medium text-xl">Welcome to examples page</h1>
          <p className="text-sm">
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

      <hr />

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
