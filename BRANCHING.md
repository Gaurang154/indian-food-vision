# Branching & Version Control Strategy

A lightweight Git Flow to keep code streams separated, enable parallel work,
and make onboarding new contributors straightforward.

## Long-lived branches

| Branch    | Purpose                                                        |
| --------- | -------------------------------------------------------------- |
| `main`    | Stable, deployable code. Only updated via reviewed merges.     |
| `develop` | Integration branch. Feature branches merge here first.         |

## Working branches

Branch off `develop` using a type prefix and a short, hyphenated description:

| Prefix      | Use for                        | Example                          |
| ----------- | ------------------------------ | -------------------------------- |
| `feature/`  | New functionality              | `feature/tts-streaming`          |
| `fix/`      | Bug fixes                      | `fix/sarvam-timeout`             |
| `chore/`    | Tooling, deps, config          | `chore/bump-dependencies`        |
| `docs/`     | Documentation only             | `docs/api-reference`             |

## Workflow

```bash
# start new work
git checkout develop
git pull origin develop
git checkout -b feature/my-change

# ... commit work using Conventional Commits (feat:, fix:, chore:, docs:) ...

git push -u origin feature/my-change
# open a Pull Request into develop
```

- Open a **Pull Request into `develop`** (not `main`) for review.
- Keep PRs small and focused for easier review.
- `develop` is merged into `main` when a set of changes is validated and ready
  to deploy.

## Release / deploy

1. Ensure `develop` is green (tests pass, endpoints validated).
2. Merge `develop` into `main` via PR.
3. Tag the release on `main` (e.g. `git tag v1.1.0 && git push --tags`).
