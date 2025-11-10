import { consola } from 'consola';
import { execa } from 'execa';

type ProjectType = 'Vite' | 'React Native';

consola.box('Creating TypeGPU project...');
const projectType = await consola.prompt('Project type:', {
  type: 'select',
  options: ['Vite', 'React Native'],
}) as ProjectType;

const ProjectSetups = {
  'Vite': async () => {
    await execa({ stdio: 'inherit' })`npm create vite`;
  },
  'React Native': async () => {
    console.error('React Native setup not implemented yet');
    process.exit(1);
  },
};

// Bootstrapping the project
await ProjectSetups[projectType]();

// Installing TypeGPU dependencies
await execa({ stdio: 'inherit' })`npm install typegpu`;
