import { useAtom } from 'jotai';
import { readyAtom, statusAtom, statusColorAtom } from '../store/store.ts';

export function Header() {
  const [status] = useAtom(statusAtom);
  const [statusColor] = useAtom(statusColorAtom);
  const [ready] = useAtom(readyAtom);

  return (
    <header className='mb-6 text-center'>
      <h1 className='font-bold text-3xl text-gray-900 dark:text-white'>
        WGSL Shader Translator
      </h1>
      <p className='text-gray-600 dark:text-gray-400'>
        Convert WGSL shaders to other formats
      </p>
      <p className='mt-2 text-gray-500 text-xs dark:text-gray-500'>
        Press Ctrl+Enter (Cmd+Enter) to compile
      </p>
      <div className='mt-4 text-center'>
        <span className={`font-medium text-sm ${statusColor}`}>
          {status}
          {!ready && !/fail/i.test(status) && (
            <span className='ml-2 inline-block animate-spin'>⟳</span>
          )}
        </span>
      </div>
    </header>
  );
}
