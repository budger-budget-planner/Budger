---
name: GitHub push authentication
description: The workspace GitHub token may require Basic auth with x-access-token rather than a Bearer extra header.
---

When pushing to the production GitHub remote over HTTPS, use the GitHub token as the password in Basic authentication with the username `x-access-token`; a Bearer extra header may be rejected even when the secret is present and valid.

**Why:** The workspace token authenticated successfully with the standard Basic form after the Bearer form returned invalid credentials.

**How to apply:** Keep the token in the workspace secret environment and construct the Basic header or askpass value at command runtime without printing it. Never place the token in a remote URL, commit, or chat message.