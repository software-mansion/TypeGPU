import StackBlitzSDK from '@stackblitz/sdk';
import { parse } from 'yaml';
import { type } from 'arktype';
import typegpuColorPackageJson from '@typegpu/color/package.json' with { type: 'json' };
import typegpuNoisePackageJson from '@typegpu/noise/package.json' with { type: 'json' };
import typegpuSdfPackageJson from '@typegpu/sdf/package.json' with { type: 'json' };
import typegpuThreePackageJson from '@typegpu/three/package.json' with { type: 'json' };
import typegpuPackageJson from 'typegpu/package.json' with { type: 'json' };
import unpluginPackageJson from 'unplugin-typegpu/package.json' with { type: 'json' };
import pnpmWorkspace from '../../../../../pnpm-workspace.yaml?raw';
import typegpuDocsPackageJson from '../../../package.json' with { type: 'json' };
import type { Example, ExampleCommonFile } from '../../utils/examples/types.ts';
// oxlint-disable-next-line import/default
import index from './stackBlitzIndex.ts?raw';

const pnpmWorkspaceYaml = type({
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

if (pnpmWorkspaceYaml instanceof type.errors) {
  throw new Error(pnpmWorkspaceYaml.summary);
}

export const openInStackBlitz = (example: Example, common: ExampleCommonFile[]) => {
  const tsFiles: Record<string, string> = {};

  for (const file of example.tsFiles) {
    tsFiles[`src/${file.path}`] = file.tsnotoverContent ?? file.content;
  }
  for (const file of common) {
    tsFiles[`src/common/${file.path}`] = file.tsnotoverContent ?? file.content;
  }

  for (const key of Object.keys(tsFiles)) {
    const content = tsFiles[key];
    tsFiles[key] = content
      .replaceAll('/TypeGPU', 'https://docs.swmansion.com/TypeGPU')
      .replaceAll('../../common', './common');
  }

  StackBlitzSDK.openProject(
    {
      template: 'node',
      title: example.metadata.title,
      files: {
        'index.ts': index.replaceAll(/\/\/\s*@ts-ignore\s*\n/g, ''),
        ...tsFiles,
        'index.html': `\
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${example.metadata.title}</title>
</head>
<body>
${example.htmlFile.content}
<script type="module" src="/index.ts"></script>
</body>
</html>`,
        'tsconfig.json': `{
    "compilerOptions": {
        "target": "ES2020",
        "useDefineForClassFields": true,
        "module": "ESNext",
        "lib": ["ES2020", "DOM", "DOM.Iterable"],
        "skipLibCheck": true,
        "types": ["@webgpu/types"],
        "moduleResolution": "node",
        "allowImportingTsExtensions": true,
        "isolatedModules": true,
        "moduleDetection": "force",
        "noEmit": true,
        "strict": true,
        "noUnusedLocals": true,
        "noUnusedParameters": true
    },
    "include": ["src", "index.ts"]
}`,
        'package.json': `{
    "name": "typegpu-example-sandbox",
    "private": true,
    "version": "0.0.0",
    "type": "module",
    "scripts": {
      "dev": "vite",
      "build": "tsc && vite build",
      "preview": "vite preview"
    },
    "devDependencies": {
      "typescript": "${pnpmWorkspaceYaml.catalogs.types.typescript}",
      "vite": "^6.1.1",
      "@webgpu/types": "${pnpmWorkspaceYaml.catalogs.types['@webgpu/types']}",
      "@types/three": "${pnpmWorkspaceYaml.catalogs.types['@types/three']}"
    },
    "dependencies": {
      "typegpu": "^${typegpuPackageJson.version}",
      "unplugin-typegpu": "^${unpluginPackageJson.version}",
      "wgpu-matrix": "${pnpmWorkspaceYaml.catalogs.example['wgpu-matrix']}",
      "@loaders.gl/core": "${typegpuDocsPackageJson.dependencies['@loaders.gl/core']}",
      "@loaders.gl/obj": "${typegpuDocsPackageJson.dependencies['@loaders.gl/obj']}",
      "three": "${pnpmWorkspaceYaml.catalogs.example.three}",
      "@typegpu/noise": "${typegpuNoisePackageJson.version}",
      "@typegpu/color": "${typegpuColorPackageJson.version}",
      "@typegpu/sdf": "${typegpuSdfPackageJson.version}",
      "@typegpu/three": "${typegpuThreePackageJson.version}"
    }
}`,
        'vite.config.js': `\
import { defineConfig } from 'vite';
import typegpuPlugin from 'unplugin-typegpu/vite';

export default defineConfig({
  plugins: [typegpuPlugin()],
});
`,
      },
    },
    {
      openFile: 'src/index.ts',
      newWindow: true,
      theme: 'light',
    },
  );
};
