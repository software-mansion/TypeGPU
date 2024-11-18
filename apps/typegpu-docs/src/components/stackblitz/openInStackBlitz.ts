import StackBlitzSDK from '@stackblitz/sdk';
import type { Example } from '../../utils/examples/types';
import index from './stackblitzIndex.ts?raw';

export function openInStackBlitz(example: Example) {
  StackBlitzSDK.openProject(
    {
      template: 'node',
      title: example.metadata.title,
      files: {
        'index.ts': index.slice('// @ts-ignore\n'.length),
        'src/example.ts': example.tsCode.replaceAll(
          '/TypeGPU',
          'https://docs.swmansion.com/TypeGPU',
        ),
        'index.html': `
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
        "noUnusedParameters": true,
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
      "typescript": "^5.5.3",
      "vite": "^5.4.2"
    },
    "dependencies": {
      "@webgpu/types": "^0.1.44",
      "typegpu": "^0.2.0"
    }
}`,
      },
    },
    {
      openFile: 'src/example.ts',
      newWindow: true,
      theme: 'light',
    },
  );
}
