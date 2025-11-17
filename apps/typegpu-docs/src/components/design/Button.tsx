import cs from 'classnames';
import { forwardRef, type ReactNode } from 'react';

type Props = {
  accent?: boolean;
  className?: string;
  onClick?: () => void;
  children?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, Props>((props, ref) => {
  const { onClick, accent, className, children } = props;

  return (
    <button
      className={cs(
        'box-border inline-flex cursor-pointer items-center justify-center gap-2 px-5 py-2.5 text-sm outline-none transition-[background-color,border-color,color,box-shadow] duration-150 ease-out hover:shadow-sm active:shadow-none focus-visible:ring-2 focus-visible:ring-accent-600',
        accent
          ? 'bg-gradient-to-br from-gradient-purple to-gradient-blue text-white hover:from-gradient-purple-dark hover:to-gradient-blue-dark'
          : 'border border-tameplum-100 bg-white text-navy-80 hover:border-accent-600 hover:bg-white hover:text-navy-100 dark:border-white/10 dark:bg-[#34394d] dark:text-navy-0 dark:hover:border-accent-200 dark:hover:bg-[#3d435a] dark:hover:text-white',
        className,
      )}
      type="button"
      ref={ref}
      onClick={onClick}
    >
      {children}
    </button>
  );
});
