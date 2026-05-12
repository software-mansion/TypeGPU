import path from 'node:path';
import * as p from '@clack/prompts';

import { pmFromUserAgent, pmInstall, pmRun } from './utils/pm.ts';
import { cancelExit, rgbText } from './utils/prompts.ts';
import { copyTemplate, prepareDirectory } from './utils/files.ts';
import { getPackageName, getProjectDirectory } from './utils/inputs.ts';

const DEFAULT_PROJECT_DIR = 'tgpu-project';

const PROJECT_TEMPLATES = [
  {
    value: 'vite',
    label: rgbText('Vite', 175, 105, 245),
  },
];

export async function createProject(cwd: string) {
  p.intro('Creating a new TypeGPU project.');

  const projectDir = await getProjectDirectory(DEFAULT_PROJECT_DIR);

  const root = await prepareDirectory(cwd, projectDir);

  const packageName = await getPackageName(projectDir);

  const projectTemplate = await p.select({
    message: 'Select a template:',
    options: PROJECT_TEMPLATES,
  });
  if (p.isCancel(projectTemplate)) {
    cancelExit();
  }

  p.log.step(`Scaffolding project in ${projectDir}...`);

  const templateDir = path.resolve(
    import.meta.dirname,
    '../templates',
    `template-${projectTemplate}`,
  );
  copyTemplate(templateDir, root, packageName);

  p.log.success(`Scaffolded project at ${projectDir}`);

  const pm = pmFromUserAgent(process.env.npm_config_user_agent);
  const installAndRun = await p.confirm({
    message: `Install with ${pm} and start now?`,
    initialValue: true,
  });
  if (p.isCancel(installAndRun)) {
    cancelExit();
  }

  if (installAndRun) {
    process.chdir(root);
    pmInstall(pm);
    pmRun(pm, ['dev']);
    // end of the scaffolding process
  } else {
    // TODO
  }

  p.outro('Done! Get ready for a shaderful experience.');
}
