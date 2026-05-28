import path from 'node:path';
import * as p from '@clack/prompts';

import { pmFromUserAgent, pmInstall } from './utils/pm.ts';
import { cancelExit, confirmStep, rgbText } from './utils/prompts.ts';
import { scaffoldProject, prepareDirectory } from './utils/files.ts';
import { getProjectName, isValidPackageName, getPackageName } from './utils/inputs.ts';
import { detect, resolveCommand } from 'package-manager-detector';
import { askForAgentSkills } from './steps/skills.ts';

const DEFAULT_PROJECT_DIR = 'tgpu-project';

const GRADIENT_START = [0.831, 0.553, 1.0] as const;
const GRADIENT_END = [0.32, 0.4, 0.95] as const;

const PROJECT_TEMPLATES = [
  {
    value: 'vite-simple',
    label: 'Vite (Bare)',
  },
  {
    value: 'vite-complex',
    label: 'Vite (Complex - Domain Warping)',
  },
  {
    value: 'vite-react',
    label: 'Vite + React (Bare)',
  },
  {
    value: 'expo-simple',
    label: 'Expo RN (Bare)',
  },
] as const;

const coloredLabelsTemplates = PROJECT_TEMPLATES.map((template, i) => {
  const t = i / (PROJECT_TEMPLATES.length - 1);
  const [r, g, b] = Array.from({ length: 3 }, (_, j) =>
    Math.round(((GRADIENT_START[j] as number) * (1 - t) + (GRADIENT_END[j] as number) * t) * 255),
  ) as [number, number, number];
  return {
    value: template.value,
    label: rgbText(template.label, r, g, b),
  };
});

export async function createProject(cwd: string) {
  p.intro('Creating a new TypeGPU project.');

  const projectName = await getProjectName(DEFAULT_PROJECT_DIR); // also directory name

  const root = await prepareDirectory(cwd, projectName);

  const packageName = isValidPackageName(projectName) ? projectName : await getPackageName();

  const projectTemplate = await p.select({
    message: 'Select a template:',
    options: coloredLabelsTemplates,
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

  const detected = await detect({ cwd: root });
  const pm = detected?.agent ?? pmFromUserAgent(process.env.npm_config_user_agent);
  const shouldInstall = await confirmStep(`Install dependencies with ${pm}?`, true);
  process.chdir(root);

  if (shouldInstall) {
    pmInstall(pm);
  }

  await askForAgentSkills(pm);

  const cdPath = path.relative(cwd, root);
  const installCmd = resolveCommand(pm, 'install', []);
  const runCmd = projectTemplate.includes('expo')
    ? resolveCommand(pm, 'run', ['start'])
    : resolveCommand(pm, 'run', ['dev']);

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
