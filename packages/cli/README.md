# `@vsc-neuropilot/dev-cli`

This is the CLI designed for development of NeuroPilot companions.

## Features

- Scaffold new NeuroPilot companions using templates.
- Easily download and install pre-release NeuroPilot versions to test extensions.
- Start a window to run interactive integration tests against both your companion and NeuroPilot.

## Usage

Install globally to add the CLI to your PATH:

```bash
npm install -g @vsc-neuropilot/dev-cli
yarn add -g @vsc-neuropilot/dev-cli
pnpm add -g @vsc-neuropilot/dev-cli
# etc...

np -h # Prints help manu
```

Or install per-project as a dev dependency:

```bash
npm install -D @vsc-neuropilot/dev-cli
yarn add -D @vsc-neuropilot/dev-cli
pnpm add -D @vsc-neuropilot/dev-cli

pnpm np -h # Prints help menu
```

Alternatively (less recommended), download and execute directly from the registry:

```bash
# All prints the help menu
npx np -h
yarn dlx np -h
pnpx np -h
pnpm dlx -h
```
