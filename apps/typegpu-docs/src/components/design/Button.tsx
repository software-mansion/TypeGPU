import { forwardRef } from 'react';

type Props = {
  label?: string;
  onClick?: () => void;
};

export const Button = forwardRef<HTMLButtonElement, Props>((props, ref) => {
  const { label, onClick } = props;

  return (
    <button
      className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2"
      type="button"
      ref={ref}
      onClick={onClick}
    >
      {label}
    </button>
  );
});
