import { type } from 'arktype';

export const PackageJsonWithDepsSchema = type({
  'dependencies?': 'Record<string, string>',
  'devDependencies?': 'Record<string, string>',
  'peerDependencies?': 'Record<string, string>',
});
export type PackageJsonWithDeps = typeof PackageJsonWithDepsSchema.infer;

export const PackageJsonWithNameSchema = type({
  name: 'string',
});
export type PackageJsonWithName = typeof PackageJsonWithNameSchema.infer;

export const TsConfigSchema = type({
  'compilerOptions?': {
    'types?': 'string[]',
  },
});
export type TsConfig = typeof TsConfigSchema.infer;
