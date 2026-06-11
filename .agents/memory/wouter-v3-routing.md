---
name: Wouter v3 routing catch-all pattern
description: In wouter v3, path="/" in a Switch is a strict match. Use path="/:rest*" as the catch-all wrapper for authenticated sections.
---

## Rule
Never use `<Route path="/">` as a catch-all in a wouter v3 `<Switch>`.
In wouter v3 (regexparam), `path="/"` matches **exactly** "/" only — not "/dashboard" etc.
Navigating to any sub-path renders a blank screen if "/" is the only catch-all.

**Why:** wouter v3 switched to strict-by-default path matching via regexparam.
The old wouter v2 pattern `<Route path="/">` was a prefix match; v3 is not.

**How to apply:**
- Use `<Route>` (NO path prop) as the last catch-all in a Switch — wouter v3 docs say a Route without path always matches.
- `/:rest*` looks like a catch-all but does NOT match bare `/`, causing a black screen on the root path.
- `/login`, `/invite/:token` etc. listed *before* the no-path Route still take precedence in the Switch.
- Inner `<Switch>` inside the catch-all uses normal exact paths (/dashboard, /categories, etc.).

```tsx
<Switch>
  <Route path="/login" component={LoginPage} />
  <Route path="/invite/:token" component={InvitePage} />
  <Route>                       {/* ← no path = true catch-all, matches "/" too */}
    <AuthGuard>
      <Layout>
        <Switch>
          <Route path="/"          component={Home}       />
          <Route path="/dashboard" component={Dashboard}  />
        </Switch>
      </Layout>
    </AuthGuard>
  </Route>
</Switch>
```
