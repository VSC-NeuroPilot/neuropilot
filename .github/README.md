# <img src="../assets/heart-xaendril.png" width="32" style="vertical-align:middle;horizontal-align:middle;"> NeuroPilot

This is the main GitHub repository for the NeuroPilot VS Code extension.

## Repository structure

### Branches

The main two branches are `master` and `dev`. `master` contains the code used currently to release to the marketplaces, and `dev` contains all changes before the next release.

When making a PR, you need to target the `dev` branch, NOT the `master` branch. Consequently, all branches that are created should be based off `dev`, not `master`.

Builds are published directly from the `master` branch via an Actions workflow.

## Contributing

Please see [the CONTRIBUTING.md file](/CONTRIBUTING.md).
