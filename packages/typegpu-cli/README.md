# @typegpu/cli
Create a new TypeGPU project or enhance an existing one.

## Creating
To run interactive project scaffolding:

```sh
pnpm dlx typegpu@latest
# or
npx typegpu@latest
# or
yarn dlx typegpu@latest
# or
bunx typegpu@latest
```

To scaffold with defaults without prompts:

```sh
npx typegpu@latest my-app --yes
```

You can also choose a template and ecosystem packages explicitly:

```sh
npx typegpu@latest my-app --yes --template vite-react --packages @typegpu/sdf --packages @typegpu/noise
```

## Enhancing
Run inside the root of an existing project:

```sh
pnpm dlx typegpu@latest -e
# or
npx typegpu@latest -e
# or
yarn dlx typegpu@latest -e
# or
bunx typegpu@latest -e
```

To run the recommended enhance flow without prompts:

```sh
npx typegpu@latest --enhance --yes --recommended
```

To include the TypeGPU agent skill while creating a project:

```sh
npx typegpu@latest my-app --yes --agent-skills
```

For an existing project, run:

```sh
npx typegpu@latest --enhance --yes --agent-skills
```

If the CLI cannot detect a package manager, pass `--package-manager npm`, `pnpm`, `yarn`, or `bun`.

> [!CAUTION]
> **Back up your project before running the enhance flow.** The changes the script makes are not reversible by it.
