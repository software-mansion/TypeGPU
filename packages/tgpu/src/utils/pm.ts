import spawn from 'cross-spawn';
import * as p from '@clack/prompts';
import { resolveCommand } from '@antfu/ni';
import type { Agent } from 'package-manager-detector';
import { failAndExit } from './prompts.ts';

function runCommand(command: string, args: string[], interactive?: boolean) {
  const { status, error } = spawn.sync(command, args, {
    stdio: interactive ? 'inherit' : ['inherit', 'ignore', 'inherit'],
  });

  const label = `${command}${args.length ? ` ${args.join(' ')}` : ''}`;

  if (status != null && status > 0) {
    failAndExit(`${label} failed with status ${status}`);
  }

  if (error) {
    failAndExit(`${label} failed`, error.message);
  }
}

export function pmAdd(pm: Agent, pkgs: string[], dev: boolean) {
  const args = dev ? ['-D', ...pkgs] : pkgs;
  const cmd = resolveCommand(pm, 'add', args);
  if (!cmd) {
    failAndExit(`Cannot resolve add command for ${pm}`);
  }

  // we can assume that pkgs.length > 0
  const label = pkgs.join(', ');
  const s = p.spinner();
  s.start(`Installing ${label}`);
  runCommand(cmd.command, cmd.args);
  s.stop(`Installed ${label}`);
}

export function pmInstall(pm: Agent) {
  const cmd = resolveCommand(pm, 'install', []);
  if (!cmd) {
    failAndExit(`Cannot resolve install command for ${pm}`);
  }

  const s = p.spinner();
  s.start('Installing dependencies');
  runCommand(cmd.command, cmd.args);
  s.stop('Installed dependencies');
}

// this function exits the current process
export function pmRun(pm: Agent, args: string[] = []) {
  const cmd = resolveCommand(pm, 'run', [...args]);
  if (!cmd) {
    failAndExit(`Cannot resolve run command for ${pm}.`);
  }

  runCommand(cmd.command, cmd.args, true);
  process.exit(0);
}

export async function pmExec(pm: Agent, bin: string, args: string[] = [], interactive: boolean) {
  const cmd = resolveCommand(pm, 'execute-local', [bin, ...args]);
  if (!cmd) {
    failAndExit(`Cannot resolve exec command for ${pm}.`);
  }

  const label = `${cmd.command}${cmd.args.length ? ` ${cmd.args.join(' ')}` : ''}`;
  if (interactive) {
    runCommand(cmd.command, cmd.args, true);
    return;
  }

  const s = p.spinner();
  s.start(`Running \`${label}\`.`);
  runCommand(cmd.command, cmd.args);
  s.stop(`\`${label}\` done.`);
}
