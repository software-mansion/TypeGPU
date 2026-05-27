import path from 'node:path';
import * as p from '@clack/prompts';

import { pmFromUserAgent, pmInstall } from './utils/pm.ts';
import { cancelExit, confirmStep, rgbText } from './utils/prompts.ts';
import { scaffoldProject, prepareDirectory } from './utils/files.ts';
import { getProjectName, isValidPackageName, getPackageName } from './utils/inputs.ts';
import { detect, resolveCommand } from 'package-manager-detector';
import { askForAgentSkills } from './steps/skills.ts';

const DEFAULT_PROJECT_DIR = 'tgpu-project';

const PROJECT_TEMPLATES = [
  {
    value: 'vite-simple',
    label: rgbText('Vite (Simple)', 175, 105, 245),
  },
  {
    value: 'vite-complex',
    label: rgbText('Vite (Complex)', 169, 161, 244),
  },
];

export async function createProject(cwd: string) {
  p.intro('Creating a new TypeGPU project.');

  const projectName = await getProjectName(DEFAULT_PROJECT_DIR); // also directory name

  const root = await prepareDirectory(cwd, projectName);

  const packageName = isValidPackageName(projectName) ? projectName : await getPackageName();

  const projectTemplate = await p.select({
    message: 'Select a template:',
    options: PROJECT_TEMPLATES,
  });
  if (p.isCancel(projectTemplate)) {
    cancelExit();
  }

  p.log.step(`Scaffolding project in ${projectName}...`);

  const templateDir = path.resolve(
    import.meta.dirname,
    '../templates',
    `template-${projectTemplate}`,
  );
  await scaffoldProject(templateDir, root, packageName);

  p.log.success(`Scaffolded project at ${projectName}.`);

  const detected = await detect({ cwd });
  const pm = detected?.agent ?? pmFromUserAgent(process.env.npm_config_user_agent);
  const shouldInstall = await confirmStep(`Install dependencies with ${pm}?`, true);
  process.chdir(root);

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
    msg += `\n\n`;
    msg += `\
   Note: If you are using VS Code or Cursor, you may need to run
   “TypeScript: Select TypeScript Version” and choose
   “Use Workspace Version” to enable tsover.`;
  }

  p.outro(msg);
}
