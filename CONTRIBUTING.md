# Contributing

## Reporting Issues and Suggesting Features
If you encounter what you believe is a bug, please [report an issue](https://github.com/software-mansion/TypeGPU/issues/new). For suggesting new features, you should first [start a discussion](https://github.com/software-mansion/TypeGPU/discussions/new/choose) if one does not already exist. Feel free to also join and comment on [existing discussions](https://github.com/software-mansion/TypeGPU/discussions).


## Development

To contribute by resolving an open issue or developing a new feature, please adhere to the following workflow:

1. Fork this repository.
2. Create a new feature branch from the `main` branch.
3. **(tip)** Run the `pnpm dev` to start a local dev-server for the docs/examples/benchmarking app
4. Stage your changes and commit them. We recommend following the [Conventional Commit Specification](https://www.conventionalcommits.org/en/v1.0.0/) for commit messages.
5. Make sure all the tests pass when running `pnpm test`.
6. Submit the PR for review.

After your pull request is submitted, we will review it at as soon as possible. We may suggest changes or request additional improvements, so please enable [Allow edits from maintainers](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork) on your PR.


## Release Checklist

1. Create new branch, update version string in package.json, run `pnpm install`
2. Take the Continuous Release build and test the changes on StackBlitz (optional)
3. Merge to main
4. Prepare the package for publishing
```bash
cd packages/typegpu
pnpm publish --dry-run # (if alpha, --tag alpha)
```
5. If everything looks okay, then `pnpm publish` (if alpha, `--tag alpha`)
6. Rebase *release* branch on *main*
7. Generate and edit release notes on GitHub
