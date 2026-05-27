import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';

import { cancelExit, failAndExit } from './prompts.ts';
import { type } from 'arktype';
import { PackageJsonSchema } from './types.ts';
import { multiselectPkgs } from './inputs.ts';

const renameFiles = {
  _gitignore: '.gitignore',
  _zed: '.zed',
  _vscode: '.vscode',
  _nvmrc: '.nvmrc',
  '_oxfmtrc.json': '.oxfmtrc.json',
  /* '_package.json': 'package.json' - explicitly renamed */
} as Record<string, string>;

function isEmptyDir(dir: string) {
  const entries = fs.readdirSync(dir);
  return entries.length === 0 || (entries.length === 1 && entries[0] === '.git');
}

function emptyDir(dir: string) {
  for (const entry of fs.readdirSync(dir)) {
    if (entry === '.git') continue;
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

export async function prepareDirectory(cwd: string, projectDir: string) {
  const dir = path.join(cwd, projectDir);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  } else if (!isEmptyDir(dir)) {
    const overwrite = await p.select({
      message: `Directory ${dir} is not empty.`,
      options: [
        { value: 'no', label: 'Cancel operation' },
        { value: 'yes', label: 'Remove existing files and continue' },
      ],
    });
    if (p.isCancel(overwrite) || overwrite === 'no') {
      cancelExit();
    }
    emptyDir(dir);
  }

  return dir;
}

export async function scaffoldProject(
  templateDir: string,
  projectDir: string,
  packageName: string,
) {
  const entries = fs.readdirSync(templateDir);
  for (const entry of entries.filter((f) => f !== '_package.json' && f !== 'index.html')) {
    const src = path.join(templateDir, entry);
    const dest = path.join(projectDir, renameFiles[entry] ?? entry);
    fs.cpSync(src, dest, { recursive: true });
  }

  const srcIndex = path.join(templateDir, 'index.html');
  const destIndex = path.join(projectDir, 'index.html');
  if (fs.existsSync(srcIndex)) {
    const srcContent = fs.readFileSync(srcIndex, 'utf-8');
    const updatedContent = srcContent.replace(
      /<title>.*?<\/title>/,
      `<title>${packageName}</title>`,
    );
    fs.writeFileSync(destIndex, updatedContent);
  }

  const srcPackage = path.join(templateDir, '_package.json');
  const destPackage = path.join(projectDir, 'package.json');
  const pkg = PackageJsonSchema(JSON.parse(fs.readFileSync(srcPackage, 'utf-8')));
  if (pkg instanceof type.errors) {
    failAndExit(`[INTERNAL] Invalid package.json in template ${templateDir}`, pkg.summary);
  }
  pkg.name = packageName;
  const pkgs = await multiselectPkgs(pkg);
  if (pkgs) {
    pkg.dependencies ??= {};
    for (const { pkg: dep, ver } of pkgs) {
      pkg.dependencies[dep] = ver;
    }
  }

  fs.writeFileSync(destPackage, JSON.stringify(pkg, null, 2) + '\n' /* to make oxfmt happy */);
}
