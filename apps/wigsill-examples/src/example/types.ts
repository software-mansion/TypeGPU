import z from 'zod';

export type ExampleMetadata = z.infer<typeof ExampleMetadata>;
export const ExampleMetadata = z.object({
  title: z.string(),
});

export type Example = {
  code: string;
  metadata: ExampleMetadata;
};
