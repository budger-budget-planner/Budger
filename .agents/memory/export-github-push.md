---
name: Export GitHub push workflow
description: Production fixes live under export/ and may need rebasing before pushing.
---

Production-bound fixes are committed and pushed from the repository's authenticated `origin` remote; the GitHub helper may lack source-control credentials, and remote `main` may advance independently, so fetch/rebase before retrying a rejected push. The intended deployment nudge is one blank-line change in `export/README.md`; GitHub Actions then copies it into both package READMEs.

**Why:** Vercel and Render deploy from GitHub, while the local artifact folders are not the shipping source.

**How to apply:** For support fixes, edit only `export/frontend/` or `export/backend/`, touch `export/README.md` in the same commit, verify the production build, check `git status`, then push a rebased commit to `origin/main`. The workflow syncs the child READMEs automatically; do not edit them manually unless debugging the automation.