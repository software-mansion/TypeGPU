import { useAtomValue } from 'jotai';
import { menuShownAtom } from '../utils/examples/menuShownAtom';
import ExampleList from './ExampleList';
import ExamplePage from './ExamplePage';

export function ExampleLayout() {
  const menuShown = useAtomValue(menuShownAtom);

  return (
    <div className="flex h-screen p-4 gap-4 bg-grayscale-20">
      {menuShown ? (
        <aside className="flex flex-col bg-grayscale-0 rounded-2xl w-[18.75rem] p-5 gap-5">
          <header className="grid gap-5">
            <div className="grid place-items-center">
              <a href="/" className="block cursor-pointer">
                <img
                  className="my-7"
                  src="/typegpu-logo-light.svg"
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
                href="/guides/getting-started"
                className="underline text-sm bg-gradient-to-r from-gradient-purple-dark to-gradient-blue-dark bg-clip-text text-transparent"
              >
                Learn more about TypeGPU here
              </a>
            </div>
          </header>

          <hr />

          <ExampleList />

          <div className="flex justify-between text-grayscale-60 text-xs">
            <div>&copy; 2024 Software Mansion S.A.</div>
            <a href="https://github.com/software-mansion/TypeGPU">
              <img src="/assets/github-icon.svg" alt="github logo" />
            </a>
          </div>
        </aside>
      ) : null}

      <ExamplePage />
    </div>
  );
}
