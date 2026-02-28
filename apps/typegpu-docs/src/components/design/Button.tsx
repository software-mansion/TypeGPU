import cs from 'classnames';
import { forwardRef, type ReactNode } from 'react';

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
        'box-border inline-flex items-center justify-center gap-2 rounded-[6.25rem] px-5 py-2.5 text-sm focus:ring-2 focus:ring-gradient-blue',
        accent
          ? 'bg-gradient-to-br from-gradient-purple to-gradient-blue text-white hover:from-gradient-purple-dark hover:to-gradient-blue-dark'
          : 'border-2 border-tameplum-100 bg-white hover:bg-tameplum-20',
      )}
      type="button"
      ref={ref}
      onClick={onClick}
    >
      {children}
    </button>
  );
});
