import type { Example } from '../utils/examples/types.ts';
import { ExampleLink } from './ExampleLink.tsx';

export function ExampleCard({ example }: { example: Example }) {
  return (
    <ExampleLink exampleKey={example.key} key={example.key}>
      <div className='h-36 bg-gray-100 flex items-center justify-center overflow-hidden'>
        {example.thumbnails
          ? (
            <picture>
              <source
                media='(min-width: 1026px)'
                srcSet={example.thumbnails.small}
              />
              <source
                media='(max-width: 1025px)'
                srcSet={example.thumbnails.large}
              />
              <img
                src={example.thumbnails.large}
                alt={example.metadata.title}
                className='object-cover w-full h-full'
              />
            </picture>
          )
          : (
            <span className='text-gray-400 text-lg font-semibold'>
              No thumbnail
            </span>
          )}
      </div>
      <div className='p-3'>
        <h3 className='text-lg font-semibold mb-2 text-black'>
          {example.metadata.title}
        </h3>
        {example.metadata.tags && example.metadata.tags.length > 0 && (
          <div className='flex flex-wrap gap-1'>
            {example.metadata.tags.map((tag: string) => (
              <span
                key={tag}
                className='text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full'
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </ExampleLink>
  );
}
