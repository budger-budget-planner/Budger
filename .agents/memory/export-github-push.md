---
name: Export GitHub push workflow
description: Production fixes live under export/ and may need rebasing before pushing.
---

Production-bound fixes are committed and pushed from the repository's authenticated `origin` remote; the GitHub helper may lack source-control credentials, and remote `main` may advance independently, so fetch/rebase before retrying a rejected push. The intended deployment nudge is one blank-line change in `export/README.md`; GitHub Actions then copies it into both package READMEs.

**Why:** Vercel and Render deploy from GitHub, while the local artifact folders are not the shipping source.

**How to apply:** For support fixes, edit only `export/frontend/` or `export/backend/`, touch `export/README.md` in the same commit, verify the production build, check `git status`, then push a rebased commit to `origin/main`. The workflow syncs the child READMEs automatically; do not edit them manually unless debugging the automation.

Some Replit shell environments globally rewrite `https://github.com/` to `github.replit.internal`. If that proxy reports that no GitHub connection is available, and the user has authorized the push with an existing GitHub secret, a one-time direct HTTPS push can bypass the rewrite by setting `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_SYSTEM=/dev/null` and using a temporary askpass script. Do not change the saved remote URL or leave credentials in files.

**Why:** The Replit proxy can reject pushes when no GitHub connection is attached, even when direct GitHub access and an authorized token are available.

**How to apply:** This project uses its saved `GITHUB_PERSONAL_ACCESS_TOKEN` as the GitHub integration; do not ask for a second OAuth connection. Use the secret through a temporary askpass script, with explicit push authorization when a push may trigger deployments. Never print or commit the credential; keep the saved remote tokenless and verify the GitHub branch points to the intended commit.