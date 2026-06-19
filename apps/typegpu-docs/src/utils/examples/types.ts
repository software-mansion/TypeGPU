import { type } from 'arktype';
import type { Atom } from 'jotai';

export type ExampleMetadata = typeof ExampleMetadata.infer;
export const ExampleMetadata = type({
  title: 'string',
  category: 'string',
  'tags?': 'string[]',
  coolFactor: 'number',
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

export interface PendingExampleSrcFile {
  exampleKey: string;
  /**
   * The relative path, for example 'index.ts'
   */
  path: string;
  getContent: () => Promise<string>;
  /**
   * Stripped down version of the content, without
   * overloaded operators (if they were used)
   */
  getTsnotoverContent?: (() => Promise<string>) | undefined;
}

export interface ExampleSrcFile {
  exampleKey: string;
  /**
   * The relative path, for example 'index.ts'
   */
  path: string;
  content: string;
  /**
   * Stripped down version of the content, without
   * overloaded operators (if they were used)
   */
  tsnotoverContent?: string | undefined;
}

export type ExampleCommonFile = {
  common: true;
  /**
   * The relative path, for example 'helper.ts'
   */
  path: string;
  content: string;
  /**
   * Stripped down version of the content, without
   * overloaded operators (if they were used)
   */
  tsnotoverContent?: string | undefined;
};

export interface ThumbnailPair {
  small: string;
  large: string;
}

export interface ExampleSource {
  tsFiles: ExampleSrcFile[];
  htmlFile: ExampleSrcFile;
}

export type Example = {
  key: string;
  tsImport: () => Promise<unknown>;
  metadata: ExampleMetadata;
  thumbnails?: ThumbnailPair;
  usedApis: string[];
  sourceAtom: Atom<Promise<ExampleSource>>;
};
