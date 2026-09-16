# App integration instructions

This application is part of a larger suite of independently managed apps under /opt.

## App ownership

- This repository owns only this app's code, configuration, Docker setup,
  CI/CD, and documentation.
- Shared infrastructure belongs to /opt/infra.
- This app must not modify Traefik, the shared network, or shared Postgres.

## Shared infra rules

- All app containers connect to the external Docker network `shared_net`.
- Traefik is shared and uses `exposedByDefault: false`.
- Only public services should be exposed through Traefik.
- Do not manage shared infrastructure from this repo.

## Routing

- Production: `<app>.yourdomain.com`
- Test: `test.<app>.yourdomain.com`

Replace `<app>` with the actual app name (e.g., `gig-notif`).

## Database rules

- Local development typically uses `localhost:5432`.
- Test uses `postgres-test:5432`.
- Production uses `postgres-prod:5432`.
- Use least-privilege database credentials per environment.
- Never use the Postgres superuser in application code.

Database naming for this app:

- Test: `<app>_test` and `<app>_test_user`
- Production: `<app>_prod` and `<app>_prod_user`

## Secrets

- Never commit real credentials.
- Keep local config in `.env.local` or an equivalent ignored file.
- Store deployment secrets in GitHub Environment secrets for `test` and
  `production`.
- Validate required config at startup.

## Deployment contract

- This app must deploy independently from other apps.
- CI must validate lint, tests, and build.
- Test deploys follow merges to `main`.
- Production deploys occur only on a version tag or GitHub Release.
- Deployment must not disrupt shared infrastructure.

## Local developer workflow

- Install dependencies locally on your machine.
- Configure local database and env values.
- Run the app via the repo's documented local command.
- Use `localhost` locally instead of shared VM hostnames unless explicitly debugging infrastructure.
- Keep all app-specific work inside this repo.

## Working guidance for Copilot and AI tools

When working in this app repository:

- Respect this repo as an independent application.
- Avoid assuming other apps in the suite use the same stack.
- Keep app-specific work within this repo.
- Treat infrastructure (in /opt/infra) as shared and owned by that repo.
- Avoid changing Traefik, Postgres, or shared networking from this app repo.
- Prefer local-first development and GitHub-based deployment.
- Keep the app self-contained, simple, and independently deployable.

## See also

- `/opt/README.md` — the suite-level architecture and onboarding guide
- `/opt/infra/README.md` — shared infrastructure documentation
