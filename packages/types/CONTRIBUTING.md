# Contributing to the API

This file explains how to contribute to the API.

## Adding, removing or changing the API's types

If your contribution requires adding, removing or changing types in the API package, you **must** discuss it beforehand and open an issue on the repo.
This is to ensure that existing use cases can be documented clearly, and the necessary version number can be bumped.

## Changing the API functionality

Whether or not you need to change an API's functionality depends on how large of an impact it has:

- Bug patching: You can usually open a PR. Be sure to detail what the patch does.
- Behaviour change: Open an issue or discuss on Discord first.

**Important**: If the API types require changing, you must still follow the above section.

## Updating tests

Generally, you can simply just open pull requests for tests without the need to open issues beforehand.
You must be descriptive but concise enough for each suite and test name, so that it can be understood what the test does at a glance.

## Running tests

If you have the VS Code Test Explorer extension installed, you can choose to run specifically test suites relating to the API.
Currently, you must recompile the test each change, as the tests are not automatically rebuilt.
