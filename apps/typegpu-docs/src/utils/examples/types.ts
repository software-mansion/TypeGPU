import { type } from 'arktype';

export type ExampleMetadata = typeof ExampleMetadata.infer;
export const ExampleMetadata = type({
  title: 'string',
  category: 'string',
  'tags?': 'string[]',
});

export const exampleCategories = [
  { key: 'simple', label: 'Simple' },
  { key: 'rendering', label: 'Rendering' },
  { key: 'image-processing', label: 'Image processing' },
  { key: 'simulation', label: 'Simulation' },
  { key: 'algorithms', label: 'Algorithms' },
];

export type Example = {
  key: string;
  tsCodes: Record<string, string>;
  tsSources: Record<string, () => Promise<unknown>>;
  htmlCode: string;
  metadata: ExampleMetadata;
};

export type Module = {
  default: string;
};
