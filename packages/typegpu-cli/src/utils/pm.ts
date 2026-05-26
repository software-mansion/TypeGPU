import spawn from 'cross-spawn';
import * as p from '@clack/prompts';
import { type Agent, resolveCommand } from 'package-manager-detector';
import { failAndExit } from './prompts.ts';

function parseUserAgent(userAgent: string | undefined) {
  if (!userAgent) return undefined;
  const pkgSpec = userAgent.split(' ')[0];
  if (!pkgSpec) return undefined;
  const pkgSpecArr = pkgSpec.split('/');
  if (!pkgSpecArr[0] || !pkgSpecArr[1]) return undefined;

  return pkgSpecArr[0];
}

export function pmFromUserAgent(userAgent: string | undefined) {
  const pm = parseUserAgent(userAgent);
  if (pm === undefined) {
    failAndExit(`Cannot determine package manager from user agent env.`);
  }
  return pm as unknown as Agent;
}

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

  const label = `${cmd.command}${cmd.args.length ? ` ${cmd.args.join(' ')}` : ''}`;
  p.log.step(`Running ${label}...`);
  runCommand(cmd.command, cmd.args, true);
  p.log.success('Installed dependencies.');
}

export function pmRun(pm: Agent, args: string[]) {
  const cmd = resolveCommand(pm, 'run', [...args]);
  if (!cmd) {
    failAndExit(`Cannot resolve run command for ${pm}.`);
  }

  runCommand(cmd.command, cmd.args, true);
}

export function pmExec(pm: Agent, args: string[]) {
  const cmd = resolveCommand(pm, 'execute', [...args]);
  if (!cmd) {
    failAndExit(`Cannot resolve run command for ${pm}.`);
  }

  runCommand(cmd.command, cmd.args, true);
}
