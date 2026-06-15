import { type } from 'arktype';
import { parse } from 'yaml';
import pnpmWorkspace from '../../../../../pnpm-workspace.yaml?raw';

const pnpmWorkspaceYamlResult = type({
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
})(parse(pnpmWorkspace));

if (pnpmWorkspaceYamlResult instanceof type.errors) {
  throw new Error(pnpmWorkspaceYamlResult.summary);
}

export const pnpmWorkspaceYaml = pnpmWorkspaceYamlResult;
