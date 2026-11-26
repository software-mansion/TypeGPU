# Contributing

## Reporting Issues and Suggesting Features

If you encounter what you believe is a bug, please
[report an issue](https://github.com/software-mansion/TypeGPU/issues/new). For
suggesting new features, you should first
[start a discussion](https://github.com/software-mansion/TypeGPU/discussions/new/choose)
if one does not already exist. Feel free to also join and comment on
[existing discussions](https://github.com/software-mansion/TypeGPU/discussions).

## Development

To contribute by resolving an open issue or developing a new feature, please
adhere to the following workflow:

1. Fork this repository.
2. Create a new feature branch from the `main` branch.
3. **(tip)** Run the `pnpm dev` to start a local dev-server for the
   docs/examples/benchmarking app
4. Stage your changes and commit them. We recommend following the
   [Conventional Commit Specification](https://www.conventionalcommits.org/en/v1.0.0/)
   for commit messages.
5. Make sure all the tests pass when running `pnpm test`.
6. Submit the PR for review.

After your pull request is submitted, we will review it at as soon as possible.
We may suggest changes or request additional improvements, so please enable
[Allow edits from maintainers](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork)
on your PR.

## Release Checklist

### Preparing the release PR

1. Update your local `main` and `release` branches (`git fetch origin main:main release:release`, or pull both).
   `nr changes` diffs the **local** branches, so stale ones give a wrong list.
2. Create a new branch from `main` and run `nr changes` (`pnpm changes`). It lists the files and packages that differ
   between `release` and `main`.
3. List everything that landed since the last release, on **both** branches. Commits pushed straight to `release`
   (usually docs fixes) belong in the release notes too:

   ```bash
   git log --oneline <last-tag>..origin/main
   git log --oneline <last-tag>..origin/release
   ```

4. Bump the **patch** version in `package.json` of every package whose shipped code or behavior changed (`src/`, or
   other published files such as `packages/typegpu/skills/`). Skip packages where only tests, docs or dev
   dependencies changed, and write down which ones you skipped and why. Then run `pnpm install`.
5. Open a draft PR titled `bump: typegpu <version> (+more)`, with the release notes as its description. Follow the
   format of the previous `bump:` PR:
   - `Released packages:` with each bumped package and its new version
   - A short section (with a code snippet when it helps) for each notable change, ending with `* #<PR> by @<author>`
   - `## 💎 Features`, `## 🗿 Fixes / Stability` and `## 📖 Docs` lists with every PR from step 3, including the
     ones that landed on `release`
6. Take the Continuous Release build and test the changes on StackBlitz (optional)
7. Merge to main

### Publishing

8. Prepare each bumped package for publishing

```bash
cd packages/typegpu
pnpm publish --dry-run # (if alpha, --tag alpha)
```

9. If everything looks okay, then `pnpm publish` (if alpha, `--tag alpha`)

> **Tip:** If you already know all prepublish checks pass (tests, types, publish tag validation), you can skip them to speed up
> publishing:
>
> ```bash
> SKIP_TESTS=true pnpm publish # (if alpha, --tag alpha)
> ```

10. Rebase _release_ branch on _main_
11. Create the GitHub release, using the notes from the release PR
12. Run `npx automd@latest`
