import spawn from 'cross-spawn';
import * as p from '@clack/prompts';
import { resolveCommand } from '@antfu/ni';
import type { Agent } from 'package-manager-detector';
import { failAndExit } from './prompts.ts';

type RunCommandOptions = {
  cwd?: string;
  interactive?: boolean;
};

async function runCommand(command: string, args: string[], options: RunCommandOptions = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    stdio: options.interactive ? 'inherit' : ['inherit', 'ignore', 'inherit'],
  });

  return await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

export function runInteractive(command: string, args: string[], cwd?: string) {
  const result = spawn.sync(command, args, { cwd, stdio: 'inherit' });
  return result.status ?? 1;
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

export async function pmExec(
  pm: Agent,
  bin: string,
  args: string[] = [],
  options: RunCommandOptions = {},
) {
  const cmd = resolveCommand(pm, 'execute-local', [bin, ...args]);
  if (!cmd) {
    failAndExit(`Cannot resolve exec command for ${pm}.`);
  }

  const label = `${cmd.command}${cmd.args.length ? ` ${cmd.args.join(' ')}` : ''}`;
  if (options.interactive) {
    const status = await runCommand(cmd.command, cmd.args, options);
    if (status !== 0) {
      failAndExit(`\`${label}\` failed.`);
    }
    return;
  }

  const s = p.spinner();
  s.start(`Running \`${label}\``);
  const status = await runCommand(cmd.command, cmd.args, options);
  if (status !== 0) {
    s.stop(`\`${label}\` failed.`, 1);
    failAndExit('Command failed.');
  }
  s.stop(`\`${label}\` done.`);
}
