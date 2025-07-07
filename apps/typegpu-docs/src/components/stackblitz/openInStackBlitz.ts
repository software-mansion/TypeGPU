import StackBlitzSDK from '@stackblitz/sdk';
import { parse } from 'yaml';
import { type } from 'arktype';
import typegpuColorPackageJson from '@typegpu/color/package.json' with {
  type: 'json',
};
import typegpuNoisePackageJson from '@typegpu/noise/package.json' with {
  type: 'json',
};
import typegpuPackageJson from 'typegpu/package.json' with { type: 'json' };
import unpluginPackageJson from 'unplugin-typegpu/package.json' with {
  type: 'json',
};
import pnpmWorkspace from '../../../../../pnpm-workspace.yaml?raw';
import typegpuDocsPackageJson from '../../../package.json' with {
  type: 'json',
};
import type { Example } from '../../utils/examples/types.ts';
import index from './stackBlitzIndex.ts?raw';

const pnpmWorkspaceYaml = type({
  catalogs: {
    types: {
      typescript: 'string',
      '@webgpu/types': 'string',
    },
  },
})(parse(pnpmWorkspace));

if (pnpmWorkspaceYaml instanceof type.errors) {
  throw new Error(pnpmWorkspaceYaml.summary);
}

export const openInStackBlitz = (example: Example) => {
  const tsFiles = example.tsFiles.reduce(
    (acc, file) => {
      acc[`src/${file.path}`] = file.content.replaceAll(
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
      "@webgpu/types": "${pnpmWorkspaceYaml.catalogs.types['@webgpu/types']}"
    },
    "dependencies": {
      "typegpu": "^${typegpuPackageJson.version}",
      "unplugin-typegpu": "^${unpluginPackageJson.version}",
      "wgpu-matrix": "${typegpuDocsPackageJson.dependencies['wgpu-matrix']}",
      "@loaders.gl/core": "${
          typegpuDocsPackageJson.dependencies['@loaders.gl/core']
        }",
      "@loaders.gl/obj": "${
          typegpuDocsPackageJson.dependencies['@loaders.gl/obj']
        }",
      "@typegpu/noise": "${typegpuNoisePackageJson.version}",
      "@typegpu/color": "${typegpuColorPackageJson.version}"
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
