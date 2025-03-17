import StackBlitzSDK from '@stackblitz/sdk';
import { parse } from '@std/yaml';
import { type } from 'arktype';
import typegpuPackageJson from '../../../../../packages/typegpu/package.json';
import unpluginPackageJson from '../../../../../packages/unplugin-typegpu/package.json';
import pnpmWorkspace from '../../../../../pnpm-workspace.yaml?raw';
import typegpuDocsPackageJson from '../../../package.json';
import type { Example } from '../../utils/examples/types';
import index from './stackBlitzIndex.ts?raw';

const pnpmWorkspaceYaml = type({
  catalog: { typescript: 'string', '@webgpu/types': 'string' },
})(parse(pnpmWorkspace));

if (pnpmWorkspaceYaml instanceof type.errors) {
  throw new Error(pnpmWorkspaceYaml.message);
}

export const openInStackBlitz = (example: Example) => {
  const tsFiles = Object.entries(example.tsCodes).reduce(
    (acc, [fileName, code]) => {
      acc[`src/${fileName}`] = code.replaceAll(
        '/TypeGPU',
        'https://docs.swmansion.com/TypeGPU',
      );
      return acc;
    },
    {} as Record<string, string>,
  );

  StackBlitzSDK.openProject(
    {
      template: 'node',
      title: example.metadata.title,
      files: {
        'index.ts': index.slice('// @ts-ignore\n'.length),
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
${example.htmlCode}
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
        "typeRoots": ["./node_modules/@webgpu/types", "./node_modules/@types"],
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
      "typescript": "${pnpmWorkspaceYaml.catalog.typescript}",
      "vite": "^6.1.1",
      "@webgpu/types": "${pnpmWorkspaceYaml.catalog['@webgpu/types']}"
    },
    "dependencies": {
      "typegpu": "^${typegpuPackageJson.version}",
      "unplugin-typegpu": "^${unpluginPackageJson.version}",
      "wgpu-matrix": "${typegpuDocsPackageJson.dependencies['wgpu-matrix']}",
      "@loaders.gl/core": "${typegpuDocsPackageJson.dependencies['@loaders.gl/core']}",
      "@loaders.gl/obj": "${typegpuDocsPackageJson.dependencies['@loaders.gl/obj']}"
    }
}`,
        'vite.config.js': `\
import { defineConfig } from 'vite';
import typegpuPlugin from 'unplugin-typegpu/rollup';

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
