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
- Use `<Route path="/:rest*">` as the last catch-all in a Switch (matches "/" and any sub-path)
- `/login`, `/invite/:token` etc. listed *before* the catch-all still take precedence
- Inner `<Switch>` inside the catch-all uses normal exact paths (/dashboard, /categories, etc.)

```tsx
<Switch>
  <Route path="/login" component={LoginPage} />
  <Route path="/invite/:token" component={InvitePage} />
  <Route path="/:rest*">          {/* ← catch-all, not "/" */}
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
