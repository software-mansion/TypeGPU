import z from 'zod';

export type ExampleMetadata = z.infer<typeof ExampleMetadata>;
export const ExampleMetadata = z.object({
  title: z.string(),
  category: z.string(),
  tags: z.array(z.string()).optional(),
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
  tsCode: string;
  htmlCode: string;
  metadata: ExampleMetadata;
  execTsCode: string;
};
