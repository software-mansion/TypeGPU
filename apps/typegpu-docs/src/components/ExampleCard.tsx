import type { Example } from '../utils/examples/types.ts';
import { ExampleLink } from './ExampleLink.tsx';

export function ExampleCard({ example }: { example: Example }) {
  return (
    <ExampleLink exampleKey={example.key} key={example.key}>
      <div className="flex h-36 items-center justify-center overflow-hidden bg-gray-100">
        {example.thumbnails ? (
          <picture>
            <source media="(min-width: 1026px)" srcSet={example.thumbnails.small} />
            <source media="(max-width: 1025px)" srcSet={example.thumbnails.large} />
            <img
              src={example.thumbnails.large}
              alt={example.metadata.title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </picture>
        ) : (
          <span className="font-semibold text-gray-400 text-lg">No thumbnail</span>
        )}
      </div>
      <div className="p-3">
        <h3 className="mb-2 font-semibold text-black text-lg">{example.metadata.title}</h3>
        {example.metadata.tags && example.metadata.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {example.metadata.dev && (
              <span className="rounded-full bg-rose-700 px-2 py-1 text-white text-xs">DEV</span>
            )}
            {example.metadata.tags.map((tag: string) => (
              <span
                key={tag}
                className="rounded-full bg-indigo-100 px-2 py-1 text-indigo-800 text-xs"
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
