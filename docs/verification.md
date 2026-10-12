# Verification

Run before every deploy:

```bash
npm run check:deploy   # typecheck, eslint, all tests, secret scan
npm run build          # the webpack production build Netlify runs
npm audit --omit=dev
```

- Tests include PGlite (in-memory PostgreSQL) checks of every database migration that carries access rules: organization isolation, Owner-only actions, Finance, integration credentials and the `time_tasks` read policy.
- Never judge the production build from `next build` alone; Netlify runs `npm run build`, which uses webpack and rejects server-only imports (for example `node:crypto`) in browser code.
- A migration is checked against the real database before it is applied by running it inside a transaction that ends in `ROLLBACK`, then comparing what each user can read before and after.

## Manual checks

- Mobile (375 px) and tablet (768 px): no page-wide horizontal scroll on any menu.
- Light and dark theme on Overview, Work, Sales and Calendar.
- Settings → Integrations: each integration shows Active, Not set up or Needs attention correctly; Remove only appears for saved credentials.
- Jira: create, reschedule, reassign and change status from the CRM and confirm each in Jira; delete a task in Jira and confirm it leaves the CRM after a sync.
