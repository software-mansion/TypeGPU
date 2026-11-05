// @ts-check

import { execa } from 'execa';

export const DEFAULT_BASE = 'origin/release';

const packageDirnameRegex = /^packages\/([@\w-]+)\//;

/**
 * @typedef {Object} ChangedFilesOptions
 * @prop {string=} base The ref of the last release. Defaults to `origin/release`.
 * @prop {string=} head The ref with the changes to release. Defaults to `HEAD`.
 * @prop {boolean=} fetch Whether to fetch remote refs (`origin/*`) before comparing. Defaults to `true`.
 */

/**
 * Fetches `origin/<branch>` refs, so that comparisons aren't made against stale local branches.
 * Failing to fetch (e.g. when offline) is not fatal, we then compare against what's available locally.
 *
 * @param {string[]} refs
 */
async function fetchRemoteRefs(refs) {
  const branches = refs
    .filter((ref) => ref.startsWith('origin/'))
    .map((ref) => ref.slice('origin/'.length));

  if (branches.length === 0) {
    return;
  }

  // Fetching one branch at a time (sequentially, since concurrent fetches compete for git's
  // lock files), so that a branch missing on the remote doesn't prevent the others from being fetched.
  for (const branch of branches) {
    // An explicit refspec, because clones made with `--single-branch` (like the ones made by
    // actions/checkout) don't update `origin/<branch>` when fetching just by branch name.
    const refspec = `+refs/heads/${branch}:refs/remotes/origin/${branch}`;
    const { exitCode } = await execa('git', ['fetch', '--no-tags', '--quiet', 'origin', refspec], {
      reject: false,
    });
    if (exitCode !== 0) {
      console.warn(`Could not fetch '${branch}' from origin, using the local 'origin/${branch}'.`);
    }
  }
}

/**
 * @param {string} base
 * @param {string} head
 */
async function hasMergeBase(base, head) {
  const { exitCode } = await execa('git', ['merge-base', base, head], { reject: false });
  return exitCode === 0;
}

async function isShallowRepository() {
  const { stdout } = await execa('git', ['rev-parse', '--is-shallow-repository']);
  return stdout.trim() === 'true';
}

/**
 * Lists files changed on `head` since it last diverged from `base` (`git diff base...head`).
 *
 * Using the merge base (instead of comparing the tips of both branches) means that
 * commits made only on the release branch (e.g. docs fixes) are not counted as changes.
 *
 * @param {ChangedFilesOptions=} options
 * @returns {Promise<string[]>}
 */
export async function getChangedFiles({ base = DEFAULT_BASE, head = 'HEAD', fetch = true } = {}) {
  if (fetch) {
    await fetchRemoteRefs([base, head]);
  }

  for (const ref of [base, head]) {
    const { exitCode } = await execa(
      'git',
      ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
      {
        reject: false,
      },
    );
    if (exitCode !== 0) {
      throw new Error(`Unknown ref '${ref}'.`);
    }
  }

  if (!(await hasMergeBase(base, head)) && (await isShallowRepository())) {
    // CI usually checks out a shallow clone, which doesn't have the history needed to
    // find the merge base. Fetching the rest of the history fixes that.
    await execa('git', ['fetch', '--no-tags', '--quiet', '--unshallow', 'origin']);
  }

  if (!(await hasMergeBase(base, head))) {
    throw new Error(`Could not find a common ancestor of '${base}' and '${head}'.`);
  }

  const { stdout } = await execa('git', ['diff', '--name-only', `${base}...${head}`]);
  return stdout.split('\n').filter(Boolean).toSorted();
}

/**
 * @param {string[]} files Paths relative to the repository root.
 * @returns {string[]} Names of the directories (inside `packages/`) of packages that contain any of the files.
 */
export function getPackageDirnames(files) {
  const dirnames = new Set();
  for (const file of files) {
    const dirname = packageDirnameRegex.exec(file)?.[1];
    if (dirname) {
      dirnames.add(dirname);
    }
  }
  return [...dirnames].toSorted();
}
