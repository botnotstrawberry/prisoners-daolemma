# Vercel Preview Checklist — Prisoners DAOlemma

## Security posture

**Do not host the public app on the OpenClaw droplet for live traffic.**

Use the split below:
- **Public web preview / public site:** Vercel
- **Private ops (deploy/auth/export):** local operator machine or a tightly controlled private box
- **Never put deployer / verifier private keys in Vercel**

For temporary testing, a droplet-hosted app is acceptable only if:
- traffic is expected to be tiny,
- no sensitive signing keys are present,
- and the host is treated as disposable.

That is **not** the recommended live posture.

## Recommended preview deployment shape

### Hosting
- Platform: **Vercel**
- Project root: `packages/nextjs`
- Source repo: `botnotstrawberry/prisoners-daolemma`
- Branch for preview: current working branch / latest main branch with the Sepolia rehearsal and `/games` UX

### Current network posture
- **Launch target:** Base mainnet
- **Current public proof / preview data:** Base Sepolia

For the preview site, the frontend should still point to the **current live proof network** while we are testing the Sepolia flow.

## Vercel settings

### Root directory
`packages/nextjs`

### Install command
Already defined in `packages/nextjs/vercel.json`:
- `yarn install`

### Build command
Use the package build script:
- `yarn build`

This now automatically runs the games publisher first, because `packages/nextjs/package.json` was wired to:
- publish game artifacts
- then run the actual Next.js build

### Output
Standard Next.js output.

## Public environment variables

Set only public, non-secret browser-safe values in Vercel.

### Required for preview
- `NEXT_PUBLIC_TARGET_NETWORK=baseSepolia`
- `NEXT_PUBLIC_ALCHEMY_API_KEY=<public client key>` or equivalent provider key
- `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=<walletconnect project id>`

### Optional later
- `NEXT_PUBLIC_GAMES_DATA_BASE_URL=<external base URL>`
  - only needed if game artifacts move out of `public/` and into object storage

## Secrets that must NOT go into Vercel

Do **not** put any of these in Vercel:
- deployer private keys
- verifier private keys
- keystore passwords
- treasury operational secrets
- owner operator secrets
- privileged auth service credentials

Those belong only in the private ops environment.

## Expected preview URLs to test

After deploy, check these first:
- `/`
- `/judge`
- `/games`
- `/games/20260320-231851-base-sepolia-betrayal-demo-game-1`
- `/judge-index.json`
- `/games/index.json`

## What to verify in preview

### Human judge path
1. Home page explains the product clearly
2. Judge page exposes the locked two-paragraph quick read
3. `/games` makes the published cases visible
4. Latest betrayal case is clearly legible
5. Download links work

### Product integrity
- latest Sepolia addresses shown in judge-facing surfaces match the latest rehearsal
- trust/cooperation analysis card is visible on the game page
- the new betrayal case is the first/featured game in `/games`

### Wallet/network sanity
- wallet UI points to Base Sepolia for the preview phase
- no mainnet-only assumptions leak into the preview app yet

## Before switching from preview to launch

When we are ready to transition from Sepolia preview/testing toward mainnet launch:
- switch `NEXT_PUBLIC_TARGET_NETWORK` from `baseSepolia` to `base`
- regenerate and publish artifacts from mainnet games
- update judge-facing pointers from Sepolia proof to mainnet proof where appropriate
- keep Base Sepolia as historical proof/rehearsal evidence, not the primary live surface

## Recommended immediate next external action

1. Push the current clean repo state to GitHub
2. Create/import the Vercel project rooted at `packages/nextjs`
3. Set the public env vars above
4. Deploy preview
5. Review the latest Sepolia game page in-browser before any mainnet move
