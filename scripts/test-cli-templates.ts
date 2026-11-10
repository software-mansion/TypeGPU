#!/usr/bin/env node
// Scaffolds one `@typegpu/cli` template in a temp folder and checks that it works:
// install -> check (lint/format) -> build -> types -> serve the production build AND the dev server, and load each in
// headless Chrome. The browser pass fails on: console errors, uncaught page errors, failed same-origin requests,
// WebGPU validation errors (`uncapturederror` on any device) and WebGPU-looking console warnings, a lost device,
// no canvas, no WebGPU adapter.
//
//   node scripts/test-cli-templates.ts --template vite-bare --cli <path to cli .tgz | @typegpu/cli@latest>
//        [--tarballs <dir with packed workspace packages>]   # use the packages built from this checkout, not npm's
//        [--serve production,dev] [--settle-ms 10000] [--known-issue <regex>]...
//        [--pm npm] [--work <dir>] [--browser-tools <dir with playwright>] [--chrome /usr/bin/google-chrome]
//        [--require-browser] [--no-browser] [--check-render] [--real-canvas]
//        [--inject console-error|throw-after-init|invalid-wgsl|late-throw]   # self-test: plant a bug, the run must FAIL
//
// Exit code 0 = every step passed. A JSON summary is written to <work>/<template>.summary.json.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

declare global {
  interface Window {
    __gpuProblems: string[];
    __gpuDevices: GPUDevice[];
  }
}

// Minimal shape of the Playwright API used here. Playwright is installed next to the runner's Chrome
// (`--browser-tools`), not as a dependency of this repository.
interface ConsoleMessage {
  type(): string;
  text(): string;
}
interface Response {
  url(): string;
  status(): number;
}
interface Page {
  addInitScript<A>(fn: (arg: A) => void, arg: A): Promise<void>;
  on(event: 'console', fn: (m: ConsoleMessage) => void): void;
  on(event: 'pageerror', fn: (e: Error) => void): void;
  on(event: 'response', fn: (r: Response) => void): void;
  goto(url: string, options: { waitUntil: 'load'; timeout: number }): Promise<unknown>;
  waitForSelector(selector: string, options: { timeout: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
  locator(selector: string): {
    first(): { screenshot(options: { timeout: number }): Promise<Buffer> };
  };
  close(): Promise<void>;
}
interface Browser {
  newPage(): Promise<Page>;
  close(): Promise<void>;
}
interface Playwright {
  chromium: {
    launch(options: {
      headless: boolean;
      executablePath?: string;
      args: string[];
    }): Promise<Browser>;
  };
}

interface Step {
  name: string;
  ok: boolean;
  seconds: number;
  skipped?: boolean;
  exit?: number | null;
  signal?: string | null;
  detail?: unknown;
}

const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};
const optAll = (name: string) =>
  argv.flatMap((a, i) => (a === `--${name}` ? [argv[i + 1] ?? ''] : []));
const flag = (name: string) => argv.includes(`--${name}`);

function usage(): never {
  console.error(
    'usage: test-cli-templates.ts --template <name> --cli <tgz|spec> [--tarballs dir] [--pm npm] ...',
  );
  process.exit(2);
}
const template = opt('template') ?? usage();
const cli = opt('cli') ?? usage();
const pm = opt('pm') ?? 'npm';
const tarballsDir = opt('tarballs');
const work = path.resolve(opt('work') ?? fs.mkdtempSync(path.join(os.tmpdir(), 'tgpu-tpl-')));
const browserTools = opt('browser-tools');
const chrome = opt('chrome');
// Presenting a canvas frame does not work in headless Chrome + SwiftShader on GitHub's hosted Linux runners
// (`getCurrentTexture()` kills the page's WebGPU instance), so the real canvas and the blank-canvas check are opt-in.
const checkRender = flag('check-render');
const realCanvas = flag('real-canvas') || checkRender;
const settleMs = Number(opt('settle-ms') ?? 10_000);
const serveModes = (opt('serve') ?? 'production,dev').split(',').filter(Boolean);
const knownIssues = optAll('known-issue').map((s) => new RegExp(s));
const inject = opt('inject');
const useBrowser = !flag('no-browser');
const appName = `app-${template}`;
const appDir = path.join(work, appName);
fs.mkdirSync(work, { recursive: true });

// Chrome logs WebGPU validation errors as console warnings; these are the ones that count.
const WEBGPU_WARNING =
  /webgpu|wgsl|dawn|validation error|\[Invalid |GPU(Device|Pipeline|Shader|Buffer|Texture)/i;

const steps: Step[] = [];
let failed = false;

const seconds = (since: number) => Math.round((Date.now() - since) / 100) / 10;

function run(name: string, cmd: string, args: string[], { cwd = appDir } = {}) {
  const started = Date.now();
  const r = spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, CI: '1' },
    encoding: 'utf8',
    timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const ok = r.status === 0;
  const log = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  fs.writeFileSync(path.join(work, `${template}.${name}.log`), log);
  steps.push({ name, ok, seconds: seconds(started), exit: r.status, signal: r.signal });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${template} :: ${name} (${seconds(started)}s)`);
  if (!ok) {
    console.log(log.split('\n').slice(-25).join('\n'));
    failed = true;
  }
  return ok;
}

function fail(name: string, message: string) {
  steps.push({ name, ok: false, seconds: 0, detail: message });
  console.log(`FAIL ${template} :: ${name} (${message})`);
  failed = true;
}

function skip(name: string, reason: string) {
  steps.push({ name, ok: true, skipped: true, seconds: 0, detail: reason });
  console.log(`skip ${template} :: ${name} (${reason})`);
}

try {
  await main();
} catch (error) {
  fail('harness', `unexpected exception: ${error instanceof Error ? error.stack : String(error)}`);
}
finish();

async function main() {
  // 1. scaffold with the CLI
  fs.rmSync(appDir, { recursive: true, force: true });
  // The CLI is installed into its own prefix and run with node: `npm exec` leaks `npm_config_package` into the
  // `npx skills add` call that the CLI makes, which then fails with "skills: command not found".
  const cliPrefix = path.join(work, '_cli');
  const cliDir = path.join(cliPrefix, 'node_modules/@typegpu/cli');
  fs.rmSync(cliPrefix, { recursive: true, force: true });
  if (
    !run('install-cli', 'npm', ['install', '--prefix', cliPrefix, '--no-audit', '--no-fund', cli], {
      cwd: work,
    })
  ) {
    return;
  }
  const templateDir = path.join(cliDir, 'templates', `template-${template}`);
  if (!fs.existsSync(templateDir)) {
    // The template list comes from this checkout; a template added since the last release is not published yet.
    if (!tarballsDir) return skip('scaffold', `template-${template} is not in ${cli} yet`);
    return fail('scaffold', `template-${template} is not in the CLI package`);
  }
  if (
    !run(
      'scaffold',
      'node',
      [
        path.join(cliDir, 'dist/index.js'),
        appName,
        '--template',
        template,
        '--package-manager',
        pm,
        '-y',
      ],
      { cwd: work },
    )
  ) {
    return;
  }

  // `-y` also runs `npx skills add ...`. On a machine with no coding agent detected (a clean CI runner) that installs
  // the skill for ALL agents. `oxfmt --check` rejects the non-hidden `agent/` folder, so the KNOWN outputs of that
  // step are removed before the checks and reported. Anything else the CLI adds is left alone and reported, so it
  // can still break `check` and be noticed.
  {
    const knownSkillsOutput = new Set(['.agents', '.claude', 'agent', 'skills-lock.json']);
    const renamed: Record<string, string> = {
      _gitignore: '.gitignore',
      _zed: '.zed',
      _vscode: '.vscode',
      _nvmrc: '.nvmrc',
      '_oxfmtrc.json': '.oxfmtrc.json',
      '_package.json': 'package.json',
    };
    const expected = new Set(fs.readdirSync(templateDir).map((e) => renamed[e] ?? e));
    const extra = fs.readdirSync(appDir).filter((e) => !expected.has(e));
    const removed = extra.filter((e) => knownSkillsOutput.has(e));
    const unknown = extra.filter((e) => !knownSkillsOutput.has(e));
    for (const e of removed) fs.rmSync(path.join(appDir, e), { recursive: true, force: true });
    steps.push({ name: 'skills-leftovers', ok: true, seconds: 0, detail: { removed, unknown } });
    console.log(
      `note ${template} :: the CLI's skills step added: ${removed.join(', ') || '-'} (removed); other entries not in the template: ${unknown.join(', ') || '-'}`,
    );
  }

  // Self-test of the checker: plant a bug in the scaffolded app (templates with src/main.ts). The run must then FAIL.
  if (inject) {
    const snippets: Record<string, string> = {
      'console-error': "\nconsole.error('injected by --inject');\n",
      'throw-after-init': "\nthrow new Error('injected after init');\n",
      'invalid-wgsl': "\nroot.device.createShaderModule({ code: 'this is not wgsl' });\n",
      'late-throw': "\nsetTimeout(() => {\n  throw new Error('injected late');\n}, 6000);\n",
    };
    const snippet = snippets[inject];
    const entry = path.join(appDir, 'src/main.ts');
    if (!snippet || !fs.existsSync(entry))
      return fail('inject', `cannot inject "${inject}" into ${template}`);
    fs.appendFileSync(entry, snippet);
    steps.push({ name: 'inject', ok: true, seconds: 0, detail: inject });
  }

  // 2. use the packages built from this checkout
  const packageJsonPath = path.join(appDir, 'package.json');
  let originalPackageJson: string | undefined;
  let tarballNames = new Set<string>();
  if (tarballsDir) {
    if (pm !== 'npm') {
      return fail(
        'use-tarballs',
        `tarball mode writes npm "overrides" and supports --pm npm only (got ${pm})`,
      );
    }
    originalPackageJson = fs.readFileSync(packageJsonPath, 'utf8');
    const tarballs: Record<string, string> = {};
    for (const f of fs.readdirSync(tarballsDir).filter((f) => f.endsWith('.tgz'))) {
      const tgz = path.resolve(tarballsDir, f);
      const r = spawnSync('tar', ['-xOzf', tgz, 'package/package.json'], { encoding: 'utf8' });
      if (r.status !== 0) return fail('use-tarballs', `cannot read ${f}`);
      tarballs[(JSON.parse(r.stdout) as { name: string }).name] = tgz;
    }
    tarballNames = new Set(Object.keys(tarballs));
    for (const required of ['typegpu', 'unplugin-typegpu']) {
      if (!tarballNames.has(required))
        return fail('use-tarballs', `no tarball for ${required} in ${tarballsDir}`);
    }
    const pkg = JSON.parse(originalPackageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      overrides?: Record<string, string>;
    };
    pkg.overrides ??= {};
    for (const [name, tgz] of Object.entries(tarballs)) {
      const spec = `file:${tgz}`;
      for (const deps of [pkg.dependencies, pkg.devDependencies]) {
        if (deps?.[name]) deps[name] = spec;
      }
      pkg.overrides[name] = spec;
    }
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
    steps.push({ name: 'use-tarballs', ok: true, seconds: 0, detail: [...tarballNames] });
    console.log(`ok   ${template} :: use-tarballs (${tarballNames.size} packages)`);
  }

  // 3. install; then check, build, types
  if (!run('install', pm, ['install'])) return;
  // Put the template's own package.json back so that `check` (oxfmt) sees exactly what the CLI generated;
  // node_modules already point at the tarballs.
  if (originalPackageJson !== undefined) fs.writeFileSync(packageJsonPath, originalPackageJson);
  // Guard against a silent fallback to npm: every installed copy of a package we packed must resolve from a file.
  if (tarballsDir) {
    const lock = JSON.parse(fs.readFileSync(path.join(appDir, 'package-lock.json'), 'utf8')) as {
      packages?: Record<string, { resolved?: string }>;
    };
    const fromRegistry: string[] = [];
    let fromFile = 0;
    for (const [key, value] of Object.entries(lock.packages ?? {})) {
      const name = key.split('node_modules/').pop() ?? '';
      if (!tarballNames.has(name)) continue;
      if ((value.resolved ?? '').startsWith('file:')) fromFile++;
      else fromRegistry.push(`${key} <- ${value.resolved ?? 'unresolved'}`);
    }
    const ok = fromRegistry.length === 0 && fromFile > 0;
    steps.push({ name: 'tarballs-in-use', ok, seconds: 0, detail: { fromFile, fromRegistry } });
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${template} :: tarballs-in-use (${fromFile} packages from files; from the registry: ${fromRegistry.join(', ') || 'none'})`,
    );
    if (!ok) {
      failed = true;
      return;
    }
  }
  const scripts =
    (JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { scripts?: Record<string, string> })
      .scripts ?? {};
  // `check` runs on the freshly generated project (`next build` rewrites tsconfig.json);
  // `types` runs after `build` (Next generates next-env.d.ts during the build).
  const snapshot = () => {
    const out: Record<string, string> = {};
    for (const e of fs.readdirSync(appDir)) {
      const f = path.join(appDir, e);
      if (fs.statSync(f).isFile() && e !== 'package-lock.json') out[e] = fs.readFileSync(f, 'utf8');
    }
    return out;
  };
  const before = snapshot();
  for (const name of ['check', 'build', 'types']) {
    if (!(name in scripts)) {
      skip(name, `no "${name}" script in this template`);
      continue;
    }
    if (!run(name, pm, ['run', name])) return;
    if (name === 'build') {
      const after = snapshot();
      const changed = Object.keys(before).filter((e) => e in after && before[e] !== after[e]);
      steps.push({ name: 'build-modified-files', ok: true, seconds: 0, detail: changed });
      if (changed.length)
        console.log(`note ${template} :: \`build\` modified template files: ${changed.join(', ')}`);
    }
  }

  // 4. serve and load in headless Chrome: production build first, then the dev server.
  // Which script serves what comes from the project's package.json, not from the template's name.
  if (!useBrowser) return skip('browser', '--no-browser');
  if (!('build' in scripts))
    return skip('browser', 'no "build" script, so not a web app (e.g. Expo)');
  for (const mode of serveModes) {
    const script = mode === 'dev' ? 'dev' : ['preview', 'start'].find((s) => s in scripts);
    const command = script === undefined ? undefined : scripts[script];
    if (script === undefined || command === undefined) {
      return fail(
        `serve-${mode}`,
        `no script to serve the ${mode} build ("dev", "preview" or "start")`,
      );
    }
    await serveAndCheck(mode, script, command.trim().startsWith('vite'));
    if (failed) return;
  }
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url: string, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

async function serveAndCheck(mode: string, script: string, viteCli: boolean) {
  const port = await freePort();
  const origin = `http://localhost:${port}`;
  const url = `${origin}/`;
  const out = fs.openSync(path.join(work, `${template}.serve-${mode}.log`), 'w');
  // Vite moves to another port when this one is taken; `--strictPort` makes it fail instead.
  const portArgs = viteCli ? ['--port', String(port), '--strictPort'] : ['--port', String(port)];
  const server = spawn(pm, ['run', script, '--', ...portArgs], {
    cwd: appDir,
    stdio: ['ignore', out, out],
    detached: true,
  });
  const started = Date.now();
  try {
    const res = await waitForHttp(url, 60_000);
    if (!res) return fail(`serve-${mode}`, `no HTTP 200 on ${url} within 60 s`);
    const html = await res.text();
    const htmlOk = /<html/i.test(html) && /<\/html>/i.test(html);
    steps.push({
      name: `serve-${mode}`,
      ok: htmlOk,
      seconds: seconds(started),
      detail: `HTML ${html.length} bytes`,
    });
    console.log(
      `${htmlOk ? 'ok  ' : 'FAIL'} ${template} :: serve-${mode} (HTTP 200, ${html.length} bytes of HTML)`,
    );
    if (!htmlOk) {
      failed = true;
      return;
    }

    if (!browserTools) {
      if (flag('require-browser'))
        return fail(`browser-${mode}`, '--require-browser is set but --browser-tools is missing');
      return skip(`browser-${mode}`, 'no --browser-tools');
    }
    await checkInBrowser(mode, origin, browserTools);
  } finally {
    try {
      if (server.pid) process.kill(-server.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
}

async function checkInBrowser(mode: string, origin: string, tools: string) {
  const { chromium } = createRequire(path.join(path.resolve(tools), 'package.json'))(
    'playwright',
  ) as Playwright;
  const browser = await chromium.launch({
    headless: true,
    ...(chrome ? { executablePath: chrome } : {}),
    args: [
      '--no-sandbox',
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan',
      '--use-angle=swiftshader',
      '--use-webgpu-adapter=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const problems: string[] = [];
  const t0 = Date.now();
  try {
    const page = await browser.newPage();
    // Chrome reports WebGPU validation errors as console *warnings*, so listen on the device itself.
    await page.addInitScript((realCanvas: boolean) => {
      window.__gpuProblems = [];
      window.__gpuDevices = [];
      if (typeof GPUAdapter === 'undefined') return;
      // See `realCanvas` above: by default the canvas texture is replaced by an ordinary texture of the device. The
      // template's pipelines and shaders still run and are validated, but presenting a frame is not tested.
      if (!realCanvas && typeof GPUCanvasContext !== 'undefined') {
        const configs = new WeakMap<GPUCanvasContext, GPUCanvasConfiguration>();
        const textures = new WeakMap<GPUCanvasContext, GPUTexture>();
        // oxlint-disable-next-line typescript/unbound-method -- called with `.call(this, ...)` below
        const configure = GPUCanvasContext.prototype.configure;
        GPUCanvasContext.prototype.configure = function (config) {
          configs.set(this, config);
          textures.delete(this);
          return configure.call(this, config);
        };
        GPUCanvasContext.prototype.getCurrentTexture = function () {
          const config = configs.get(this);
          if (!config) throw new Error('getCurrentTexture() before configure()');
          const width = Math.max(this.canvas.width, 1);
          const height = Math.max(this.canvas.height, 1);
          const cached = textures.get(this);
          if (cached && cached.width === width && cached.height === height) return cached;
          const texture = config.device.createTexture({
            size: [width, height],
            format: config.format,
            usage:
              (config.usage ?? GPUTextureUsage.RENDER_ATTACHMENT) |
              GPUTextureUsage.TEXTURE_BINDING |
              GPUTextureUsage.COPY_SRC,
          });
          textures.set(this, texture);
          return texture;
        };

        // Presenting a frame is what normally holds back a requestAnimationFrame loop until the GPU catches up.
        // Without it, a template with a heavy shader queues hundreds of frames on the software adapter, and
        // waiting for the GPU at the end takes minutes. So the next frame waits for the last submitted work.
        let lastWork: Promise<unknown> = Promise.resolve();
        // oxlint-disable-next-line typescript/unbound-method -- called with `.call(this, ...)` below
        const submit = GPUQueue.prototype.submit;
        GPUQueue.prototype.submit = function (commandBuffers) {
          submit.call(this, commandBuffers);
          lastWork = this.onSubmittedWorkDone().catch(() => {});
        };
        const requestFrame = window.requestAnimationFrame.bind(window);
        const cancelled = new Set<number>();
        let nextId = 0;
        window.requestAnimationFrame = (callback) => {
          const id = ++nextId;
          void lastWork.then(() =>
            requestFrame((time) => {
              if (!cancelled.delete(id)) callback(time);
            }),
          );
          return id;
        };
        window.cancelAnimationFrame = (id) => {
          cancelled.add(id);
        };
      }
      // oxlint-disable-next-line typescript/unbound-method -- called with `.apply(this, ...)` below
      const requestDevice = GPUAdapter.prototype.requestDevice;
      GPUAdapter.prototype.requestDevice = async function (...args) {
        const device = await requestDevice.apply(this, args);
        window.__gpuDevices.push(device);
        device.addEventListener('uncapturederror', (e) =>
          window.__gpuProblems.push(`uncapturederror: ${e.error.message}`),
        );
        void device.lost.then((l) => {
          if (l.reason !== 'destroyed')
            window.__gpuProblems.push(`device lost (${l.reason}): ${l.message}`);
        });
        return device;
      };
    }, realCanvas);
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
      else if (m.type() === 'warning' && WEBGPU_WARNING.test(m.text())) {
        problems.push(`console.warn (WebGPU): ${m.text().slice(0, 300)}`);
      }
    });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('response', (r) => {
      if (r.url().startsWith(origin) && r.status() >= 400)
        problems.push(`HTTP ${r.status()}: ${r.url()}`);
    });
    await page.goto(`${origin}/`, { waitUntil: 'load', timeout: 60_000 });
    const canvas = await page.waitForSelector('canvas', { timeout: 30_000 }).catch(() => null);
    // `tgpu.init()` and the first frames take several seconds on a software adapter: wait at least `settleMs`.
    await page.waitForTimeout(settleMs);
    const info = await page.evaluate(async () => {
      // Validation errors reach the page asynchronously: round-trip to the GPU process before collecting them.
      await Promise.all(
        window.__gpuDevices.map((d) => d.queue.onSubmittedWorkDone().catch(() => {})),
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const a = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
      return {
        webgpu: !!navigator.gpu,
        adapter: a
          ? [a.info.vendor, a.info.architecture, a.info.description].filter(Boolean).join(' / ') ||
            'adapter'
          : null,
        gpuProblems: window.__gpuProblems,
        devices: window.__gpuDevices.length,
      };
    }, undefined);

    // A screenshot of the canvas is saved next to the logs; with --check-render it must not be blank.
    let render: { colors: number } | { error: string };
    try {
      const png = await page.locator('canvas').first().screenshot({ timeout: 15_000 });
      fs.writeFileSync(path.join(work, `${template}.${mode}.png`), png);
      const probe = await browser.newPage();
      render = await probe.evaluate(async (b64: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = Math.min(img.width, 256);
        c.height = Math.min(img.height, 256);
        const ctx = c.getContext('2d');
        if (!ctx) return { error: 'no 2d context' };
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const px = ctx.getImageData(0, 0, c.width, c.height).data;
        const seen = new Set<number>();
        for (let i = 0; i < px.length; i += 4)
          seen.add(((px[i] ?? 0) << 16) | ((px[i + 1] ?? 0) << 8) | (px[i + 2] ?? 0));
        return { colors: seen.size };
      }, png.toString('base64'));
      await probe.close();
    } catch (error) {
      render = { error: String(error).slice(0, 200) };
    }
    if (checkRender) {
      if ('error' in render) problems.push(`render check failed: ${render.error}`);
      else if (render.colors < 2)
        problems.push(`canvas looks blank (${render.colors} distinct colour)`);
    }

    problems.push(...info.gpuProblems.map((p) => `WebGPU ${p}`));
    if (!canvas) problems.push('no <canvas> appeared within 30 s');
    if (!info.adapter)
      problems.push(`no WebGPU adapter in the browser (navigator.gpu: ${info.webgpu})`);
    const known = problems.filter((p) => knownIssues.some((re) => re.test(p)));
    const real = problems.filter((p) => !known.includes(p));
    const ok = real.length === 0;
    steps.push({
      name: `browser-${mode}`,
      ok,
      seconds: seconds(t0),
      detail: { adapter: info.adapter, problems: real, knownIssues: known },
    });
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${template} :: browser-${mode} (adapter: ${info.adapter ?? 'none'}; devices: ${info.devices}; problems: ${real.length}; known issues: ${known.length})`,
    );
    for (const p of real) console.log(`     - ${p}`);
    for (const p of known) console.log(`     - (known issue, ignored) ${p.slice(0, 160)}`);
    if (!ok) failed = true;
  } finally {
    await browser.close();
  }
}

function finish() {
  fs.writeFileSync(
    path.join(work, `${template}.summary.json`),
    JSON.stringify(
      {
        template,
        cli,
        pm,
        mode: tarballsDir ? 'tarballs' : 'npm',
        inject: inject ?? null,
        ok: !failed,
        steps,
      },
      null,
      2,
    ),
  );
  console.log(`\n${failed ? 'FAILED' : 'PASSED'}: ${template} (${steps.length} steps) -> ${work}`);
  process.exit(failed ? 1 : 0);
}
