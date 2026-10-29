# Releases and how to go back

| Release | What it is | Where |
|---|---|---|
| **v1.0.0** | The app as it stood before the new design: phone and Google sign-in, voice/chat/video companion, journal, calm, outside, safety pipeline, admin portal | git tag `v1.0.0`; `main` points here until v2 is merged |
| **v2** (in progress) | The new design (garden home, five tabs, onboarding and tour, journal timeline and progress, quiet games) connected to the same backend | its own branch, merged to `main` only when you say so |

## Going back to v1

Any one of these works. Pick whichever is nearest.

1. **Render dashboard**: `saathi-api` > Settings > Branch: set it to `main` (while `main` is v1), then Manual Deploy. The API serves the app and the admin portal, so both go back together.
2. **Git**: `git checkout v1.0.0` for a look, or `git revert -m 1 <merge commit>` on `main` to take v2 out after it has been merged.
3. **Netlify** (only if you use those optional sites): drag the zip built from the `v1.0.0` tag onto the site.

## Why going back is safe for your data

Database changes are **forward-only and additive** (new tables and new columns, nothing renamed or dropped in the same release). v1 code ignores columns and tables it does not know, so v1 runs against a v2 database. v2 never deletes what v1 wrote. If a change ever has to remove something, it is done in a later release, after v1 is no longer the fallback.

## Cutting a release

```
npm run verify          # typecheck, all tests, production build
git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z
```
