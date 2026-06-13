---
name: update-docs
description: Keep the Kiro Chat project documentation (CLAUDE.md + docs/) in sync after implementing a change. Use after editing code that affects architecture, the Rust↔TS IPC contract, a module's responsibilities, build/release, or conventions — and before committing.
---

# Update Docs

The documentation in `CLAUDE.md` and `docs/` is written **for AI agents to
consume before coding**. If it drifts from the code, it actively misleads the
next agent. This skill keeps it accurate as part of finishing an implementation.

## When to use

Use after you've implemented a change and **before you commit**, whenever the
change touched anything the docs describe. Skip it for pure refactors that change
nothing a doc states (e.g. renaming a local variable, reformatting).

Trigger on any of:
- Added / removed / renamed a **Tauri command or event**, or changed its args,
  return type, or payload → `docs/ipc-contract.md`.
- Added / removed a **Rust module** or changed a module's responsibility →
  `docs/backend.md` (+ `docs/architecture.md` diagram/text if structural).
- Added / removed a **frontend file** or changed its role, the tab/session model,
  or the boot flow → `docs/frontend.md` and/or `docs/architecture.md`.
- Changed **build, CI, release, bundling, versioning, icons, or capabilities** →
  `docs/build-and-release.md`.
- Introduced a new **convention** or changed an existing one → `CLAUDE.md`.
- Changed the **spawn modes**, **config schema** (`AppConfig`), or any shared type
  → `docs/ipc-contract.md` (shared types) + the relevant module doc.

## The docs and what each covers

| File | Scope |
|------|-------|
| `CLAUDE.md` | Entry point: overview, commands, doc map, conventions |
| `docs/architecture.md` | How pieces fit, boot/setup flow, PTY/session model, concurrency invariants |
| `docs/ipc-contract.md` | Commands table, events table, shared types, change checklist |
| `docs/backend.md` | Per-module Rust responsibilities, cross-platform rules |
| `docs/frontend.md` | Per-file TS responsibilities, frontend conventions |
| `docs/build-and-release.md` | Toolchain, commands, Tauri config, CI, release, versioning |

## How to update

1. **Diff first.** Look at what you actually changed (`git diff`, changed files).
   Map each change to the doc(s) above. Don't rewrite docs you didn't affect.
2. **Edit precisely.** Update the specific table row, list item, or sentence that
   is now wrong. Match the existing tone: terse, declarative, *why over what*.
   These docs describe intent and constraints, not line-by-line behavior.
3. **Keep the tables exact.** The command/event tables in `ipc-contract.md` and
   the module lists in `backend.md`/`frontend.md` are load-bearing — names, args,
   return types, and payload shapes must match the code verbatim (remember serde
   `camelCase` for fields crossing IPC).
4. **Preserve invariants.** If you changed PTY concurrency, the generation model,
   the boot flow, or a cross-platform `#[cfg]` rule, update the corresponding
   "invariants"/"rules" sections — these exist to stop the next agent breaking them.
5. **Check the doc map.** If you added or removed a doc file, update the table in
   `CLAUDE.md` and any cross-links between docs.

## Validation before committing

- [ ] Every code change that affects a documented surface has a matching doc edit.
- [ ] Command/event tables match the registered commands in `main.rs` and the
      wrappers in `src/ipc.ts`.
- [ ] No doc references a file, command, event, or module that no longer exists.
- [ ] New conventions are reflected in `CLAUDE.md`.
- [ ] Tone matches: concise, intent-focused, no narration of obvious code.

Then commit (use the `qac-commits` skill for the trailers). Doc updates can ride
in the same commit as the code change they describe.
