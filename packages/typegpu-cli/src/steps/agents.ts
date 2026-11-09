import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { type Agent, resolveCommand } from 'package-manager-detector';
import type { PackageJson } from '../utils/types.ts';
import { confirmStep } from '../utils/prompts.ts';

const BEGIN = '<!-- BEGIN:typegpu-agent-rules -->';
const END = '<!-- END:typegpu-agent-rules -->';

function checkStep(pm: Agent, pkg: PackageJson) {
  const scripts = ['types', 'check'].filter((name) => pkg.scripts?.[name]);
  const commands = scripts.map((name) => resolveCommand(pm, 'run', [name]));
  if (commands.length === 0 || commands.some((cmd) => !cmd)) {
    return 'After editing, run the type check and the linter (eslint-plugin-typegpu).';
  }
  const formatted = commands.map((cmd) => `\`${cmd?.command} ${cmd?.args.join(' ')}\``);
  return `After editing, run ${formatted.join(' and ')}.`;
}

function rulesBlock(pm: Agent, pkg: PackageJson) {
  return `${BEGIN}
# TypeGPU

This project uses TypeGPU. Its API is newer than most models' training data.
Before writing or fixing TypeGPU code, read node_modules/typegpu/skills/typegpu/SKILL.md
and the references it names. They match the installed version, and the .d.ts files in
node_modules/typegpu are the exact API.

In 'use gpu' functions:
- Vectors, matrices, structs and arrays are references. Copy them (d.vec3f(v)) before
  assigning to a let, or use const.
- Write d.f32(1) where a float is needed. Scalar a / b is always f32; use std.intdiv
  for integers. Shift u32 right with >>>.
- Use std.* math, not Math.*.
- Write GPU methods as properties (step: () => { 'use gpu'; ... }), not shorthand methods.
- Values captured from the outer scope are baked in as constants. Use uniforms for
  anything that changes.

${checkStep(pm, pkg)}
${END}`;
}

function upsertBlock(file: string, block: string) {
  const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
  const start = content.indexOf(BEGIN);
  const end = content.indexOf(END);
  const next =
    start !== -1 && end > start
      ? content.slice(0, start) + block + content.slice(end + END.length)
      : content.trim()
        ? `${content.trimEnd()}\n\n${block}\n`
        : `${block}\n`;
  fs.writeFileSync(file, next);
}

export function writeAgentRules(cwd: string, pm: Agent, pkg: PackageJson) {
  const block = rulesBlock(pm, pkg);
  upsertBlock(path.join(cwd, 'AGENTS.md'), block);

  // Claude Code reads AGENTS.md only when there is no CLAUDE.md
  const claudeMd = path.join(cwd, 'CLAUDE.md');
  if (!fs.existsSync(claudeMd)) {
    fs.writeFileSync(claudeMd, '@AGENTS.md\n');
  } else if (!fs.readFileSync(claudeMd, 'utf-8').includes('@AGENTS.md')) {
    upsertBlock(claudeMd, block);
  }

  p.log.success('Added TypeGPU instructions for coding agents to AGENTS.md and CLAUDE.md.');
}

export async function askForAgentRules(cwd: string, pm: Agent, pkg: PackageJson) {
  const shouldWrite = await confirmStep(
    'Add TypeGPU instructions for coding agents to AGENTS.md and CLAUDE.md?',
    true,
  );
  if (shouldWrite) {
    writeAgentRules(cwd, pm, pkg);
  }
}
