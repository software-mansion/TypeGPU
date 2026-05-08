import spawn from 'cross-spawn';
import * as p from '@clack/prompts';
import { resolveCommand } from '@antfu/ni';
import type { Agent } from 'package-manager-detector';
import { failAndExit } from './prompts.ts';

async function runCommand(command: string, args: string[]) {
  const child = spawn(command, args, { stdio: ['inherit', 'ignore', 'inherit'] });

  return await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

export async function pmAdd(pm: Agent, pkgs: string[], dev: boolean) {
  const args = dev ? ['-D', ...pkgs] : pkgs;
  const cmd = resolveCommand(pm, 'add', args);
  if (!cmd) {
    failAndExit(`Cannot resolve add command for ${pm}.`);
  }

  const label = pkgs.join(', ');
  const s = p.spinner();
  s.start(`Installing ${label}`);
  const status = await runCommand(cmd.command, cmd.args);
  if (status !== 0) {
    s.stop(`Failed to install ${label}.`, 1);
    failAndExit('Package installation failed.');
  }
  s.stop(`Installed ${label}`);
}

export async function pmInstall(pm: Agent) {
  const cmd = resolveCommand(pm, 'install', []);
  if (!cmd) {
    failAndExit(`Cannot resolve install command for ${pm}.`);
  }

  const s = p.spinner();
  s.start('Installing dependencies');
  const status = await runCommand(cmd.command, cmd.args);
  if (status !== 0) {
    s.stop('Failed to install dependencies.', 1);
    failAndExit('Dependency installation failed.');
  }
  s.stop('Installed dependencies');
}
