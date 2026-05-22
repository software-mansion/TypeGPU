import path from 'node:path';
import * as p from '@clack/prompts';

import { pmFromUserAgent, pmInstall, pmRun } from './utils/pm.ts';
import { cancelExit, confirmStep, rgbText } from './utils/prompts.ts';
import { copyTemplate, prepareDirectory } from './utils/files.ts';
import { getPackageName, getProjectDirectory } from './utils/inputs.ts';
import { detect, resolveCommand } from 'package-manager-detector';

const DEFAULT_PROJECT_DIR = 'tgpu-project';

const PROJECT_TEMPLATES = [
  {
    value: 'vite-simple',
    label: rgbText('Vite (Simple)', 175, 105, 245),
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

  p.log.success(`Scaffolded project at ${projectDir}.`);

  const detected = await detect({ cwd });
  const pm = detected?.agent ?? pmFromUserAgent(process.env.npm_config_user_agent);
  const installAndRun = await confirmStep(`Install with ${pm} and start now?`, true);

  if (installAndRun) {
    process.chdir(root);
    pmInstall(pm);
    pmRun(pm, ['dev']);
    return;
  }

  let msg = 'Done!\n';
  const cdPath = path.relative(cwd, root);
  const installCmd = resolveCommand(pm, 'install', []);
  const runCmd = resolveCommand(pm, 'run', ['dev']);

  if (installCmd && runCmd) {
    msg += `   To have a shaderful experience run:\n\n`;
    msg += `   cd ${cdPath}\n`;
    msg += `   ${installCmd.command} ${installCmd.args.join(' ')}\n`;
    msg += `   ${runCmd.command} ${runCmd.args.join(' ')}`;
  }

  p.outro(msg);
}
