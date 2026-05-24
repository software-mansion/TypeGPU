import path from 'node:path';
import * as p from '@clack/prompts';

import { pmFromUserAgent, pmInstall } from './utils/pm.ts';
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
  const shouldInstall = await confirmStep(`Install dependencies with ${pm}?`, true);

  if (shouldInstall) {
    process.chdir(root);
    pmInstall(pm);
  }

  const cdPath = path.relative(cwd, root);
  const installCmd = resolveCommand(pm, 'install', []);
  const runCmd = resolveCommand(pm, 'run', ['dev']);

  let msg = 'Done!\n';
  msg += `   To get started run:\n\n`;
  if (!shouldInstall && installCmd) {
    msg += `   cd ${cdPath}\n`;
    msg += `   ${installCmd.command} ${installCmd.args.join(' ')}\n`;
  } else if (cdPath) {
    msg += `   cd ${cdPath}\n`;
  }
  if (runCmd) {
    msg += `   ${runCmd.command} ${runCmd.args.join(' ')}`;
  }

  p.outro(msg);
}
