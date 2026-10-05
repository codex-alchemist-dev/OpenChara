# Contributing to OpenChara

Thanks for taking a look. OpenChara is the *engine* - systems and
templates that any project's `PATCHES/` folder builds against. Game
content (specific characters, classes, abilities, art) belongs in a
project repo, not here - if a change only makes sense for one specific
character or game concept, it probably belongs in `PATCHES/`, not
`engine/`.

## Ground rules

- **No runtime dependencies.** Plain Node, `require()`/`import`-based.
  Keep it that way unless there's a very strong reason not to.
- **Purely additive and gated where it matters.** OpenChara is used by
  live, deployed projects - a change to `engine/` must not silently break
  a project that hasn't opted into the new behavior. New engine
  capabilities should have a sane default that preserves today's behavior.
- **Validate before you ship.** `node ../OpenRock/bin/openrock.js check <projectDir>`
  runs the exact same JSON/JS/import validation a real build does, without
  writing anything - run it against a real test project before opening a
  PR. `node --check` every `.js` file you touched.
- **Test in-game when the change is behavioral**, not just syntactic - a
  passing `check` only proves the build doesn't crash, not that the
  feature works. Say in your PR description what you tested and how.
- **Small, focused PRs** - one logical change per PR.

## Pull request process

1. Fork the repo and create a branch off `main`.
2. Make your change, following the ground rules above.
3. Run `openrock check` against a real test project, and
   test in-game if the change is behavioral.
4. Open a PR against `main` and fill out the template.
5. Address review feedback. A maintainer will merge once it looks good.

## Reporting bugs / requesting features

Open an issue. For a bug, include your `openrock.mod.json`'s relevant fields
(namespace, engine version), what you expected, what happened, and
anything from `openrock log --all` that looks relevant.
For a feature request, a short explanation of the use case helps more
than a fully-specced design.

## Code of conduct

Be respectful, assume good faith, keep disagreements about the code, not
the person.
