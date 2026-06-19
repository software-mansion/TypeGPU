import { type } from 'arktype';
import { comptime } from 'comptime';
import { parse } from 'yaml';

export const pnpmWorkspaceYaml = comptime(async () => {
  const pnpmWorkspaceContent = (await import('../../../../../pnpm-workspace.yaml?raw')).default;

  const pnpmWorkspaceYamlType = type({
    catalogs: {
      types: {
        typescript: 'string',
        '@webgpu/types': 'string',
        '@types/three': 'string',
      },
      test: {
        vitest: 'string',
      },
      frontend: {
        'vite-imagetools': 'string',
        'fuse.js': 'string',
      },
      example: {
        'wgpu-matrix': 'string',
        three: 'string',
      },
    },
  });

  const pnpmWorkspaceYamlResult = pnpmWorkspaceYamlType(parse(pnpmWorkspaceContent));

  if (pnpmWorkspaceYamlResult instanceof type.errors) {
    throw new Error(pnpmWorkspaceYamlResult.summary);
  }

  return pnpmWorkspaceYamlResult;
});
