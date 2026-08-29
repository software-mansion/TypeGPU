import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useRef } from 'react';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom.ts';
import { exampleFullscreenAtom, menuShownAtom } from '../utils/examples/exampleViewStateAtoms.ts';
import { useHydrated } from '../utils/useHydrated.ts';
import { common, examples } from '../examples/exampleContent.ts';
import { BrowseExamplesButton } from './ExampleStaticButtons.tsx';
import { ExampleNotFound } from './ExampleNotFound.tsx';
import { ExamplePageSkeleton } from './ExamplePageSkeleton.tsx';
import { ExampleView } from './ExampleView.tsx';

const getRandomExampleKey = () => {
  const keys = Object.keys(examples);
  const randomIdx = Math.floor(Math.random() * keys.length);
  return keys[randomIdx];
};

/**
 * The example we want to show off first.
 */
const FLAGSHIP = 'rendering--caustics';

function RedirectToFlagship() {
  const setCurrentExample = useSetAtom(currentExampleAtom);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (redirectedRef.current) {
      return;
    }
    redirectedRef.current = true;

    setCurrentExample(FLAGSHIP in examples ? FLAGSHIP : getRandomExampleKey());
  }, [setCurrentExample]);

  return <ExamplePageSkeleton />;
}

function ExamplePage() {
  const hydrated = useHydrated();
  const currentExample = useAtomValue(currentExampleAtom);
  const fullscreen = useAtomValue(exampleFullscreenAtom);
  const menuShown = useAtomValue(menuShownAtom);
  const setMenuShown = useSetAtom(menuShownAtom);

  const content = (() => {
    if (!currentExample) {
      return <RedirectToFlagship />;
    }

    if (currentExample in examples) {
      return (
        <ExampleView key={currentExample} example={examples[currentExample]} common={common} />
      );
    }

    return <ExampleNotFound />;
  })();

  return (
    <div
      className={`mx-auto box-border flex w-full flex-col gap-4 ${
        fullscreen ? 'h-full min-h-0 max-w-none' : 'min-h-[38rem] max-w-5xl md:px-8'
      }`}
    >
      {!fullscreen && (!hydrated || !menuShown) && (
        <BrowseExamplesButton
          className={`self-start ${hydrated ? '' : 'min-[1025px]:hidden'}`}
          onClick={() => setMenuShown(true)}
        />
      )}
      {content}
    </div>
  );
}

export default ExamplePage;
