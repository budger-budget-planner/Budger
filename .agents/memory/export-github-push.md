---
name: Export GitHub push workflow
description: Production fixes live under export/ and may need rebasing before pushing.
---

Production-bound fixes are committed and pushed from the repository's authenticated `origin` remote; the GitHub helper may lack source-control credentials, and remote `main` may advance independently, so fetch/rebase before retrying a rejected push.

**Why:** Vercel and Render deploy from GitHub, while the local artifact folders are not the shipping source.

**How to apply:** For support fixes, edit only `export/frontend/` or `export/backend/`, verify the production build, check `git status`, then push a rebased commit to `origin/main`.