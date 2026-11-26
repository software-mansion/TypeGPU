/**
 * Keeps the `lastUpdated` frontmatter field of docs pages valid, and reminds to bump it.
 *
 * Usage (from the repository root):
 *   node apps/typegpu-docs/scripts/doc-dates/cli.ts check [--base <ref>] [--fix]
 *   node apps/typegpu-docs/scripts/doc-dates/cli.ts bump [--base <ref>] [<page>...]
 *   node apps/typegpu-docs/scripts/doc-dates/cli.ts populate
 *
 * `check` fails if a docs page is missing a valid `lastUpdated` date, has one in the future,
 *   or moved it back in time. Pages changed relative to the base ref (including uncommitted and
 *   untracked changes) without a bumped date only produce a warning, as cosmetic changes
 *   (typos, formatting) shouldn't mark a page as updated.
 *   With `--fix`, missing or invalid dates are set to today, and quoted dates are unquoted.
 *   The base ref defaults to whichever of `origin/main` and `origin/release` is closest to HEAD.
 *
 * `bump` sets `lastUpdated` to today for the given pages, or for every changed page whose date
 *   wasn't bumped yet if none are given.
 *
 * `populate` fills in missing `lastUpdated` dates based on the Git history of each page.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  addDays,
  isTrackedDocPage,
  readLastUpdated,
  today,
  writeLastUpdated,
  type LastUpdated,
} from './frontmatter.ts';

const docsAppRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const contentDir = join(docsAppRoot, 'src', 'content', 'docs');

/**
 * Commits that touched many pages in a purely mechanical way (renames, import style changes),
 * which should not count as the page being updated when populating dates from Git history.
 */
const MECHANICAL_COMMITS = [
  'ca9525024', // impr: Use named tgpu export (#2610)
  'bbbb5184e', // docs: Use `{ tgpu }` import in documentation and examples (#2791)
  '53f4ff83a', // fix: More tree-shakeable and convenient exports (#2068)
  '54556957f', // chore: rename react-native-wgpu to react-native-webgpu (#2619)
];

/**
 * When populating dates from Git history, commits that changed fewer lines than this in a page
 * are considered cosmetic (typo fixes, banners, link updates), and don't count as an update.
 */
const MIN_CHANGED_LINES = 10;

class UsageError extends Error {}

function git(...args: string[]): string {
  return execFileSync('git', args, {
    cwd: docsAppRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function tryGit(...args: string[]): string | undefined {
  try {
    return git(...args);
  } catch {
    return undefined;
  }
}

const repoRoot = git('rev-parse', '--show-toplevel');
const contentDirFromRepo = relative(repoRoot, contentDir).replaceAll('\\', '/');

function lines(output: string): string[] {
  return output.split('\n').filter((line) => line.length > 0);
}

function isDocPage(repoPath: string): boolean {
  return (
    repoPath.startsWith(`${contentDirFromRepo}/`) &&
    isTrackedDocPage(repoPath.slice(contentDirFromRepo.length + 1))
  );
}

/** Repository-relative paths of docs pages that are tracked or untracked (but not ignored). */
function listDocPages(): string[] {
  const files = lines(
    git('ls-files', '--cached', '--others', '--exclude-standard', '--full-name', '--', contentDir),
  );
  return [...new Set(files)]
    .filter(isDocPage)
    .filter((file) => existsSync(join(repoRoot, file))) // Skipping pages deleted in the working tree
    .toSorted();
}

function readPage(repoPath: string): string {
  return readFileSync(join(repoRoot, repoPath), 'utf8');
}

function writePage(repoPath: string, date: string) {
  try {
    writeFileSync(join(repoRoot, repoPath), writeLastUpdated(readPage(repoPath), date));
  } catch (error) {
    throw new UsageError(`Could not update ${repoPath}: ${(error as Error).message}`);
  }
}

function resolveBase(explicitBase: string | undefined): string | undefined {
  if (explicitBase) {
    const mergeBase = tryGit('merge-base', explicitBase, 'HEAD');
    if (!mergeBase) {
      throw new UsageError(
        `Could not find a merge base between "${explicitBase}" and HEAD. Is the ref fetched (and the clone not shallow)?`,
      );
    }
    return mergeBase;
  }

  // Picking the closest merge base, as docs changes can target either `main` or `release`.
  const candidates = ['origin/main', 'origin/release']
    .map((ref) => tryGit('merge-base', ref, 'HEAD'))
    .filter((sha): sha is string => !!sha);

  return candidates.find((candidate) =>
    candidates.every(
      (other) =>
        other === candidate ||
        tryGit('merge-base', '--is-ancestor', other, candidate) !== undefined,
    ),
  );
}

interface ChangedPage {
  path: string;
  /** The `lastUpdated` date at the base, if the page existed there (possibly under another path). */
  previous: LastUpdated | undefined;
}

/** Docs pages changed relative to `mergeBase`, including uncommitted and untracked changes. */
function listChangedPages(mergeBase: string): ChangedPage[] {
  const changed: ChangedPage[] = [];

  for (const line of lines(git('diff', '--name-status', '-M', mergeBase, '--', contentDir))) {
    const [status = '', ...paths] = line.split('\t');
    const path = paths.at(-1) ?? '';
    const basePath = status.startsWith('R') ? paths[0] : status === 'M' ? path : undefined;
    if (!isDocPage(path) || status.startsWith('D')) {
      continue;
    }
    const baseSource = basePath ? tryGit('show', `${mergeBase}:${basePath}`) : undefined;
    changed.push({
      path,
      previous: baseSource !== undefined ? readLastUpdated(baseSource) : undefined,
    });
  }

  for (const path of lines(
    git('ls-files', '--others', '--exclude-standard', '--full-name', '--', contentDir),
  )) {
    if (isDocPage(path)) {
      changed.push({ path, previous: undefined });
    }
  }

  return changed;
}

function dateOf(value: LastUpdated | undefined): string | undefined {
  return value?.kind === 'valid' || value?.kind === 'quoted' ? value.date : undefined;
}

/** Changed pages that existed at the base and still have the same date. */
function listNotBumped(mergeBase: string): string[] {
  return listChangedPages(mergeBase)
    .filter(({ path, previous }) => {
      const before = dateOf(previous);
      return before !== undefined && dateOf(readLastUpdated(readPage(path))) === before;
    })
    .map(({ path }) => path);
}

function check({ base, fix }: { base: string | undefined; fix: boolean }) {
  const date = today();
  const pages = listDocPages();
  const mergeBase = resolveBase(base);
  const changed = mergeBase ? listChangedPages(mergeBase) : [];
  const previousByPath = new Map(changed.map((page) => [page.path, page.previous]));

  const errors: string[] = [];
  const fixed: string[] = [];

  for (const page of pages) {
    const current = readLastUpdated(readPage(page));
    const previousDate = dateOf(previousByPath.get(page));
    let problem: string | undefined;
    let fixedDate = date;

    if (current.kind === 'missing') {
      problem = 'is missing a `lastUpdated` date';
    } else if (current.kind === 'invalid') {
      problem = `has an invalid \`lastUpdated\` date: ${current.raw} (expected YYYY-MM-DD)`;
    } else if (current.kind === 'quoted') {
      problem = `has a quoted \`lastUpdated\` date, which YAML reads as a string: remove the quotes`;
      fixedDate = current.date;
    } else if (current.date > addDays(date, 1)) {
      problem = `has a \`lastUpdated\` date in the future: ${current.date}`;
    } else if (previousDate !== undefined && current.date < previousDate) {
      problem = `has its \`lastUpdated\` date moved back in time: ${previousDate} -> ${current.date}`;
      fixedDate = previousDate;
    }

    if (!problem) {
      continue;
    }
    if (!fix) {
      errors.push(`${page} ${problem}`);
      continue;
    }
    try {
      writeFileSync(join(repoRoot, page), writeLastUpdated(readPage(page), fixedDate));
      fixed.push(`${page} (${fixedDate})`);
    } catch (error) {
      errors.push(`${page} ${problem}, and could not be fixed: ${(error as Error).message}`);
    }
  }

  if (fixed.length > 0) {
    console.log(`Fixed \`lastUpdated\` in:\n${fixed.map((p) => `  - ${p}`).join('\n')}\n`);
  }

  if (!mergeBase) {
    console.warn(
      'Could not find `origin/main` or `origin/release` to compare against, skipping the check for changed pages. Pass a base with `--base <ref>`.\n',
    );
  } else {
    const notBumped = listNotBumped(mergeBase);
    if (notBumped.length > 0) {
      const hint =
        'Changed, but `lastUpdated` was not bumped. If this was a meaningful update (not just a typo fix or formatting), set it to today.';
      if (process.env.GITHUB_ACTIONS) {
        for (const page of notBumped) {
          console.log(`::warning file=${page},title=lastUpdated not bumped::${hint}`);
        }
      }
      console.warn(
        [
          `These docs pages changed (compared against ${git('rev-parse', '--short', mergeBase)}), but their \`lastUpdated\` date stayed the same:`,
          ...notBumped.map((p) => `  - ${p}`),
          '',
          'If any of them were meaningfully updated (not just a typo fix or formatting), bump their date',
          'by hand, or with `pnpm bump:doc-dates` (all of them) / `pnpm bump:doc-dates <page>...`.',
          '',
        ].join('\n'),
      );
    }
  }

  if (errors.length > 0) {
    console.error(
      [
        'Found docs pages with invalid `lastUpdated` dates:',
        ...errors.map((p) => `  - ${p}`),
        '',
        'Run `pnpm fix:doc-dates` to fix them.',
      ].join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  console.log(`All ${pages.length} docs pages have valid \`lastUpdated\` dates.`);
}

function bump({ base, pages }: { base: string | undefined; pages: string[] }) {
  let targets: string[];
  if (pages.length > 0) {
    targets = pages.map((page) => relative(repoRoot, resolve(page)).replaceAll('\\', '/'));
    const invalid = targets.filter((page) => !isDocPage(page) || !existsSync(join(repoRoot, page)));
    if (invalid.length > 0) {
      throw new UsageError(`Not docs pages: ${invalid.join(', ')}`);
    }
  } else {
    const mergeBase = resolveBase(base);
    if (!mergeBase) {
      throw new UsageError(
        'Could not determine the base to compare against. Pass one with `--base <ref>`, or list the pages to bump.',
      );
    }
    targets = listNotBumped(mergeBase);
  }

  const date = today();
  for (const page of targets) {
    writePage(page, date);
    console.log(`${date} ${page}`);
  }
  if (targets.length === 0) {
    console.log('Nothing to bump.');
  }
}

/** The date of the last commit that meaningfully changed the page, based on Git history. */
function lastMeaningfulChange(page: string): string | undefined {
  // Each commit prints a header line, followed by a numstat line for the (followed) page
  const output = lines(
    git('log', '--follow', '--format=@@ %H %as', '--numstat', '--', join(repoRoot, page)),
  );

  const commits: { sha: string; date: string; changedLines: number }[] = [];
  for (const line of output) {
    if (line.startsWith('@@ ')) {
      const [, sha = '', date = ''] = line.split(' ');
      commits.push({ sha, date, changedLines: 0 });
    } else {
      const [added = '0', deleted = '0'] = line.split('\t');
      const last = commits.at(-1);
      if (last) {
        last.changedLines += (Number(added) || 0) + (Number(deleted) || 0);
      }
    }
  }

  const meaningful = commits.find(
    ({ sha, changedLines }) =>
      changedLines >= MIN_CHANGED_LINES &&
      !MECHANICAL_COMMITS.some((prefix) => sha.startsWith(prefix)),
  );
  // Falling back to the commit that created the page
  return (meaningful ?? commits.at(-1))?.date;
}

function populate() {
  if (tryGit('rev-parse', '--is-shallow-repository') === 'true') {
    throw new UsageError(
      'Populating dates requires the full Git history, but the clone is shallow.',
    );
  }

  for (const page of listDocPages()) {
    const current = readLastUpdated(readPage(page));
    if (current.kind === 'valid') {
      continue;
    }
    const date = lastMeaningfulChange(page) ?? today();
    writePage(page, date);
    console.log(`${date} ${page}`);
  }
}

const USAGE =
  'Usage: cli.ts <check [--base <ref>] [--fix] | bump [--base <ref>] [<page>...] | populate>';

try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      base: { type: 'string' },
      fix: { type: 'boolean', default: false },
    },
  });

  const [command, ...rest] = positionals;
  switch (command) {
    case 'check':
      check({ base: values.base, fix: values.fix });
      break;
    case 'bump':
      bump({ base: values.base, pages: rest });
      break;
    case 'populate':
      populate();
      break;
    default:
      throw new UsageError(USAGE);
  }
} catch (error) {
  if (
    error instanceof UsageError ||
    (error as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')
  ) {
    console.error((error as Error).message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
