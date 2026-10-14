# Releasing (maintainers)

Published packages must come from GitHub Actions with npm provenance (n8n requirement for verified
community nodes). Nothing is published from a laptop.

## One-time setup

1. GitHub: repository `dakoty/dakoty-n8n-nodes` (public, MIT), default branch `main`.
2. Add the workflows from `docs/workflows-proposed/` as `.github/workflows/ci.yml` and `publish.yml`.
3. npm: company account with 2FA. First release: add the Actions secret `NPM_TOKEN` (granular token,
   publish rights, scoped to `n8n-nodes-dakoty`). After the first release configure a Trusted Publisher
   (npmjs.com → package → Settings → Trusted Publisher → GitHub Actions, owner `dakoty`, repository
   `dakoty-n8n-nodes`, workflow `publish.yml`) and delete the token.

## Release

```
npm run release   # lint, build, version bump, changelog, tag x.y.z, push -> publish.yml publishes with provenance
```

Check afterwards: `npm view n8n-nodes-dakoty` (version, license MIT, `repository.url`, empty `dependencies`,
"Provenance" badge on npmjs.com) and `npx @n8n/scan-community-package n8n-nodes-dakoty`.

## Verification in n8n (Creator Portal)

Submit at https://creators.n8n.io/nodes using `docs/verification.md`. Never put a real API key into the form;
give a test key only when n8n asks for one.

## Updating from the API

```
npm run spec:sync && npm run generate && npm run lint && npm test && npm run build
```

Commit the changed `spec/` and `nodes/Dakoty/descriptions/`. New operations are added in
`scripts/operations.ts`.
