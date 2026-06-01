import { type } from 'arktype';

export const PackageJsonSchema = type({
  name: 'string',
  'dependencies?': 'Record<string, string>',
  'devDependencies?': 'Record<string, string>',
  'peerDependencies?': 'Record<string, string>',
});
export type PackageJson = typeof PackageJsonSchema.infer;

export const TsConfigSchema = type({
  'compilerOptions?': {
    'types?': 'string[]',
  },
});
export type TsConfig = typeof TsConfigSchema.infer;
