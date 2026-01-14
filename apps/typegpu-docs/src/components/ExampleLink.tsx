import cs from 'classnames';
import { useAtom, useSetAtom } from 'jotai';
import { RESET } from 'jotai/utils';
import type { MouseEvent, ReactNode } from 'react';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom.ts';
import { menuShownAtom } from '../utils/examples/exampleViewStateAtoms.ts';
import useEvent from '../utils/useEvent.ts';
import { useHydrated } from '../utils/useHydrated.ts';

type Props = {
  exampleKey: string | undefined;
  children?: ReactNode;
};

export function ExampleLink(props: Props) {
  const { exampleKey, children } = props;

  const hydrated = useHydrated();
  const [currentExample, setCurrentExample] = useAtom(currentExampleAtom);
  const setMenuShown = useSetAtom(menuShownAtom);

  const handleClick = useEvent((e: MouseEvent) => {
    e.preventDefault();
    setCurrentExample(exampleKey ?? RESET);
    if (window.matchMedia('(max-width: 767px)').matches) {
      setMenuShown(false);
    }
  });

  const isCurrentExample = hydrated && currentExample === exampleKey;

  return (
    <a
      // Even though we prevent the default behavior of this link
      // it is good to have this set semantically.
      href={`#example=${exampleKey}`}
      onClick={handleClick}
      className={cs(
        'block overflow-hidden rounded-lg border border-gray-200 bg-white no-underline transition-shadow',
        isCurrentExample
          ? 'shadow-lg ring-3 ring-purple-500'
          : 'hover:shadow-lg',
      )}
    >
      {children}
    </a>
  );
}
