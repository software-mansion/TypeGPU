import cs from 'classnames';
import { useSetAtom } from 'jotai';
import { RESET } from 'jotai/utils';
import React, { type MouseEvent, Suspense } from 'react';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom.ts';
import { menuShownMobileAtom } from '../utils/examples/menuShownAtom.ts';
import useEvent from '../utils/useEvent.ts';
import CurrentMarker from './CurrentMarker.tsx';

type Props = {
  exampleKey: string | undefined;
  children?: React.ReactNode;
};

export function ExampleLink(props: Props) {
  const { exampleKey, children } = props;

  const setCurrentExample = useSetAtom(currentExampleAtom);
  const setMenuShownMobile = useSetAtom(menuShownMobileAtom);

  const handleClick = useEvent((e: MouseEvent) => {
    e.preventDefault();
    setCurrentExample(exampleKey ?? RESET);
    setMenuShownMobile(false);
  });

  return (
    <a
      // Even though we prevent the default behavior of this link
      // it is good to have this set semantically.
      href={`#example=${exampleKey}`}
      onClick={handleClick}
      className={cs(
        'block overflow-hidden rounded-lg border border-gray-200 bg-white no-underline transition-shadow',
        'has-[[data-current-marker=true]]:shadow-lg has-[[data-current-marker=true]]:ring-3 has-[[data-current-marker=true]]:ring-purple-500 has-[[data-current-marker=false]]:hover:shadow-lg',
      )}
    >
      <CurrentMarker exampleKey={exampleKey} />
      {children}
    </a>
  );
}
