import type { ChangeEventHandler } from 'react';

type Props = {
  checked: boolean;
  id?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
};

export function Toggle(props: Props) {
  return (
    <>
      <input type='checkbox' className='sr-only peer' {...props} />
      <div className="box-border relative w-11 h-6 bg-tameplum-50 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gradient-blue rounded-full peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:box-border after:bg-tameplum-600 peer-checked:after:bg-grayscale-0 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-linear-to-br peer-checked:from-gradient-purple peer-checked:to-gradient-blue" />
    </>
  );
}
