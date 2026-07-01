import path from 'node:path';
import * as p from '@clack/prompts';

import { pmFromUserAgent, pmInstall } from './utils/pm.ts';
import { cancelExit, confirmStep, failAndExit, rgbText } from './utils/prompts.ts';
import { scaffoldProject, prepareDirectory } from './utils/files.ts';
import { getProjectName, isValidPackageName, getPackageName } from './utils/inputs.ts';
import { detect, resolveCommand } from 'package-manager-detector';
import { addAgentSkills, askForAgentSkills } from './steps/skills.ts';
import {
  DEFAULT_PROJECT_TEMPLATE,
  DEFAULT_PROJECT_DIR,
  PROJECT_TEMPLATES,
  type CreateProjectOptions,
  type ProjectTemplate,
} from './options.ts';

const GRADIENT_START = [0.831, 0.553, 1.0] as const;
const GRADIENT_END = [0.0, 0.349, 0.874] as const;

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

function getDefaultPackageName(cwd: string, projectName: string) {
  const candidate = path.basename(path.resolve(cwd, projectName));
  return isValidPackageName(candidate) ? candidate : undefined;
}

async function promptProjectTemplate(): Promise<ProjectTemplate> {
  const projectTemplate = await p.select({
    message: 'Select a template:',
    options: coloredLabelsTemplates,
  });
  if (p.isCancel(projectTemplate)) {
    cancelExit();
  }

  return projectTemplate;
}

export async function createProject(cwd: string, options?: CreateProjectOptions) {
  p.intro('Creating a new TypeGPU project.');

  const nonInteractive = options?.nonInteractive ?? false;
  const projectName =
    options?.projectDir ??
    (nonInteractive ? DEFAULT_PROJECT_DIR : await getProjectName(DEFAULT_PROJECT_DIR));

  const root = await prepareDirectory(cwd, projectName, { interactive: !nonInteractive });

  const packageName =
    getDefaultPackageName(cwd, projectName) ??
    (nonInteractive ? undefined : await getPackageName());

  if (!packageName) {
    failAndExit(
      `Cannot infer a valid package name from ${projectName}. Choose a valid project directory name.`,
    );
  }

  const projectTemplate =
    options?.template ??
    (nonInteractive ? DEFAULT_PROJECT_TEMPLATE : await promptProjectTemplate());

  p.log.step(`Scaffolding project in ${projectName}...`);

  const templateDir = path.resolve(
    import.meta.dirname,
    '../templates',
    `template-${projectTemplate}`,
  );
  await scaffoldProject(
    templateDir,
    root,
    packageName,
    options?.addons.length ? options.addons : nonInteractive ? [] : undefined,
  );

  p.log.success(`Scaffolded project at ${projectName}.`);

  const userAgentPm = process.env.npm_config_user_agent
    ? pmFromUserAgent(process.env.npm_config_user_agent)
    : undefined;
  const pm = options?.packageManager ?? userAgentPm ?? (await detect({ cwd: root }))?.agent;
  if (!pm) {
    failAndExit('Could not detect package manager. Pass --package-manager <pm>.');
  }

  const shouldInstall = nonInteractive
    ? false
    : await confirmStep(`Install dependencies with ${pm}?`, true);
  process.chdir(root);

  if (shouldInstall) {
    pmInstall(pm);
  }

  if (nonInteractive) {
    addAgentSkills(pm, { nonInteractive: true });
  } else {
    await askForAgentSkills(pm);
  }

  const cdPath = path.relative(cwd, root);
  const installCmd = resolveCommand(pm, 'install', []);
  const prebuildCmd = projectTemplate.includes('expo')
    ? resolveCommand(pm, 'execute', ['expo', 'prebuild'])
    : undefined;
  const runCmd = projectTemplate.includes('expo')
    ? resolveCommand(pm, 'run', ['ios # or android'])
    : resolveCommand(pm, 'run', ['dev']);

  const steps: string[] = [];
  const shouldCd = (!shouldInstall && !!installCmd) || !!runCmd || !!cdPath;
  if (shouldCd && cdPath) {
    steps.push(`   cd ${cdPath}`);
  }
  if (!shouldInstall && installCmd) {
    steps.push(`   ${installCmd.command} ${installCmd.args.join(' ')}`);
  }
  if (prebuildCmd) {
    steps.push(`   ${prebuildCmd.command} ${prebuildCmd.args.join(' ')}`);
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
   Note: To enable Oxlint highlighting, install the OXC extension for your editor,
   or refer to the documentation:
   https://oxc.rs/docs/guide/usage/linter/editors.html

   Note: If you are using VS Code or Cursor, you may need to run
   "TypeScript: Select TypeScript Version" and choose
   "Use Workspace Version" to enable tsover.`;
  }

  p.outro(msg);
}
