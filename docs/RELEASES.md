# Releases and how to go back

| Release | What it is | Where |
|---|---|---|
| **v1.0.0** | The app as it stood before the new design: phone and Google sign-in, voice/chat/video companion, journal, calm, outside, safety pipeline, admin portal | `main` and the branch `release/v1.0.0` (commit `791e46d`) |
| **v2** (built, off by default) | The new design (garden home, five tabs, onboarding and tour, journal timeline and progress, quiet games) connected to the same backend | branch `claude/hopeful-planck-y33w4w`, behind the feature flag `ui.v2` until you switch it on; merged to `main` only when you say so. See [V2_PLAN.md](V2_PLAN.md) for status |
| **v3** (built, off by default) | The third design from the "Saathi Fresh" prototype (mood-first Home, Relax, Month as a song, letters, future you or a what-works guide) on the same backend | same branch, behind `ui.v3`; try with `?ui=3`. See [V3_PLAN.md](V3_PLAN.md) |

## Going back to v1

Any one of these works. Pick whichever is nearest.

0. **Fastest, no deploy**: in the admin portal, Feature flags, switch `ui.v2` and `ui.v3` off. Everyone sees the v1 screens again at once.

1. **Render dashboard**: `saathi-api` > Settings > Branch: set it to `release/v1.0.0` (or `main` while `main` is v1), then Manual Deploy. The API serves the app and the admin portal, so both go back together.
2. **Git**: `git checkout release/v1.0.0` for a look, or `git revert -m 1 <merge commit>` on `main` to take v2 out after it has been merged.
3. **Netlify** (only if you use those optional sites): drag the zip built from `release/v1.0.0` onto the site.

## Why going back is safe for your data

Database changes are **forward-only and additive** (new tables and new columns, nothing renamed or dropped in the same release). v1 code ignores columns and tables it does not know, so v1 runs against a v2 database. v2 never deletes what v1 wrote. If a change ever has to remove something, it is done in a later release, after v1 is no longer the fallback.

## Cutting a release

```
npm run verify          # typecheck, all tests, production build
git branch release/vX.Y.Z && git push origin release/vX.Y.Z   # a tag too, where the host allows pushing tags
```
