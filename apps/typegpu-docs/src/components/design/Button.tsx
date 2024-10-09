import cs from 'classnames';
import { type ReactNode, forwardRef } from 'react';

type Props = {
  accent?: boolean;
  onClick?: () => void;
  children?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, Props>((props, ref) => {
  const { onClick, accent, children } = props;

  return (
    <button
      className={cs(
        'inline-flex justify-center items-center font-sans box-border focus:ring-2 focus:ring-gradient-blue rounded-[6.25rem] text-sm px-5 py-2.5',
        accent
          ? 'bg-gradient-to-br from-gradient-purple to-gradient-blue text-white hover:from-gradient-purple-dark hover:to-gradient-blue-dark'
          : 'bg-white border-tameplum-100 border-2 hover:bg-tameplum-20',
      )}
      type="button"
      ref={ref}
      onClick={onClick}
    >
      {children}
    </button>
  );
});
