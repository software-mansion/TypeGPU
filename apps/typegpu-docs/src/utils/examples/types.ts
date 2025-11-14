import { type } from 'arktype';

export type ExampleMetadata = typeof ExampleMetadata.infer;
export const ExampleMetadata = type({
  title: 'string',
  category: 'string',
  'tags?': 'string[]',
  'dev?': 'boolean',
});

export const exampleCategories = [
  { key: 'simple', label: 'Simple' },
  { key: 'rendering', label: 'Rendering' },
  { key: 'image-processing', label: 'Image processing' },
  { key: 'simulation', label: 'Simulation' },
  { key: 'algorithms', label: 'Algorithms' },
  { key: 'threejs', label: 'Three.js' },
  { key: 'geometry', label: 'Geometry' },
  { key: 'tests', label: 'Tests' },
];

export type ExampleSrcFile = {
  exampleKey: string;
  path: string;
  content: string;
};

export interface ThumbnailPair {
  small: string;
  large: string;
}

export type Example = {
  key: string;
  tsFiles: ExampleSrcFile[];
  tsImport: () => Promise<unknown>;
  htmlFile: ExampleSrcFile;
  metadata: ExampleMetadata;
  thumbnails?: ThumbnailPair;
};
