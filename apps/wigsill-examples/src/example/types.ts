import z from 'zod';

export type ExampleMetadata = z.infer<typeof ExampleMetadata>;
export const ExampleMetadata = z.object({
  title: z.string(),
  category: z.string(),
});

export const exampleCategories = [
  { key: 'simple', label: 'Simple' },
  { key: 'image-processing', label: 'Image processing' },
  { key: 'simulation', label: 'Simulation' },
  { key: 'algorithms', label: 'Algorithms' },
];

export type Example = {
  key: string;
  code: string;
  metadata: ExampleMetadata;
};
