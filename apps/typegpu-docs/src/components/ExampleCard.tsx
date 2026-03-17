import type { Example } from '../utils/examples/types.ts';
import { ExampleLink } from './ExampleLink.tsx';

export function ExampleCard({ example }: { example: Example }) {
  const isDev = example.metadata.dev;

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
      <div className="flex items-center justify-center gap-2 p-3">
        <h3 className="font-semibold text-black text-lg">{example.metadata.title}</h3>
        {isDev && (
          <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
            dev
          </span>
        )}
      </div>
    </ExampleLink>
  );
}
