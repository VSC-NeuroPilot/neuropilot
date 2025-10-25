# Copilot Instructions for NeuroPilot

## Project Purpose

- **NeuroPilot** is a Visual Studio Code extension that enables Neuro-sama (or compatible AI) to act as a coding copilot or take full control of the editor, with fine-grained, user-configurable permissions.
- The extension is designed for both collaborative (Copilot) and autonomous (Autopilot) AI coding, with a strong emphasis on security, user control, and transparency.
- All permissions are off by default except for cookie requests. Security is paramount: dotfiles and files outside the workspace are inaccessible unless explicitly allowed.

## Coding Style

- **Language:** TypeScript (with some JS interop), targeting VS Code APIs.
- **Formatting:**
  - 4-space indentation
  - Always use semicolons
  - Single quotes for strings (except when escaping is clearer with double quotes)
  - Trailing commas in multiline arrays/objects
  - Always end files with a newline
- **Linting:**
  - ESLint with stylistic and unicorn plugins, and TypeScript ESLint rules
  - Warn for unused variables (except those prefixed with `_`)
  - Prefer `const` where possible
- **Naming:**
  - camelCase for variables and functions
  - PascalCase for types, classes, and interfaces
  - snake_case for action IDs
- **Documentation:**
  - Use JSDoc comments for all exported/public functions, types, and interfaces
  - Document parameters, return values, and side effects
- **Error Handling:**
  - Use `assert` for invariants
  - Log errors and important events with the custom `logOutput` function
- **Security:**
  - Never access files/folders starting with a dot unless explicitly allowed
  - Never access files outside the workspace unless explicitly allowed
  - Always validate file paths and permissions before performing actions
- **Commit Messages:**
  - Summarize only the final code diffs, not intermediate steps

## General Practices

- Use TypeScript types and interfaces for safety and clarity
- Separate desktop and web extension logic
- All user-facing strings and prompts should be clear, friendly, and sometimes humorous
- All actions and permissions must be validated before execution
- Never access or modify global git config, only local repository config
- Dangerous actions are disabled in virtual/untrusted workspaces
- Code should be modular, with clear separation of concerns
- Always normalize line endings in text read from the document using `filterFileContents`
- Avoid using `TextDocument.positionAt` and `TextDocument.offsetAt`, use the functions `indexFromPosition` and `positionFromIndex` with normalized document text instead

## When in Doubt

- Prefer explicitness and safety over cleverness
- Ask for user approval for any potentially destructive or security-sensitive action
- Follow the principle of least privilege: only enable what is necessary
- Reference the [docs site](https://vsc-neuropilot.github.io/docs) for further details

---

**By following these instructions, Copilot and other AI/code assistants will produce code and suggestions that are consistent with the NeuroPilot project's standards and philosophy.**
