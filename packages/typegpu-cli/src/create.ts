import path from 'node:path';
import * as p from '@clack/prompts';

import { pmFromUserAgent, pmInstall } from './utils/pm.ts';
import { cancelExit, confirmStep, rgbText } from './utils/prompts.ts';
import { copyTemplate, prepareDirectory } from './utils/files.ts';
import { getPackageName, getProjectDirectory } from './utils/inputs.ts';
import { detect, resolveCommand } from 'package-manager-detector';
import { askForAgentSkills } from './steps/skills.ts';

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

  process.chdir(root);
  const detected = await detect({ cwd });
  const pm = detected?.agent ?? pmFromUserAgent(process.env.npm_config_user_agent);
  const shouldInstall = await confirmStep(`Install dependencies with ${pm}?`, true);

  if (shouldInstall) {
    pmInstall(pm);
  }

  await askForAgentSkills(pm);

  const cdPath = path.relative(cwd, root);
  const installCmd = resolveCommand(pm, 'install', []);
  const runCmd = resolveCommand(pm, 'run', ['dev']);

  const steps: string[] = [];
  const shouldCd = (!shouldInstall && !!installCmd) || !!runCmd || !!cdPath;
  if (shouldCd && cdPath) {
    steps.push(`   cd ${cdPath}`);
  }
  if (!shouldInstall && installCmd) {
    steps.push(`   ${installCmd.command} ${installCmd.args.join(' ')}`);
  }
  if (runCmd) {
    steps.push(`   ${runCmd.command} ${runCmd.args.join(' ')}`);
  }

  let msg = 'Done!\n';
  if (steps.length > 0) {
    msg += `   To get started run:\n\n`;
    msg += steps.join('\n');
  }

  p.outro(msg);
}
