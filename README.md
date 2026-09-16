# portfolio

A containerized React landing page app intended to be independently deployable from the shared system infrastructure.

## Local development

```bash
npm install
npm run dev
```

## CI/CD

- CI runs on push and pull requests
- test deploys run after merges to `main`
- production deploys run only from version tags or GitHub Releases
- app configuration and secrets live in GitHub Environment secrets for test and production

## Docker

```bash
docker build -t portfolio:local .
docker run --rm -p 8080:80 portfolio:local
```

## Deployment pattern

This app follows the shared-VM test-app pattern:

- local development stays native on the developer machine
- CI builds and pushes a Docker image
- the VM pulls the image and runs `docker compose up -d`
- test and production use separate compose files and env files
- shared infrastructure remains outside this repo
- images are published to `ghcr.io/<owner>/portfolio:<commit-sha>`
- production deploys promote the SHA for the tagged commit without rebuilding

## Required deployment files on the VM

- `/opt/apps/portfolio/docker-compose.test.yml`
- `/opt/apps/portfolio/docker-compose.prod.yml`
- `/opt/apps/portfolio/.env.test`
- `/opt/apps/portfolio/.env.prod`

The repository contains the compose files and example env files. The actual env files are managed on the shared VM and gitignored.

Create the VM env files with the runtime settings required by the deployment, and
protect them with mode `0600`. This static site does not use a database or application
secret, so the files only need a non-secret environment marker, for example:

```dotenv
APP_ENV=production
```

The GitHub Environments named `test` and `production` must each contain:

```text
TS_OAUTH_CLIENT_ID
TS_OAUTH_CLIENT_SECRET
DEPLOY_HOST
DEPLOY_USER
DEPLOY_SSH_PRIVATE_KEY
DEPLOY_SSH_KNOWN_HOSTS
```

The deployment VM must already have `/opt/apps/portfolio`, Docker Compose, access to the
external `shared_net` network, and read-only GHCR access for this package. The VM does
not need a checkout of this repository. Test traffic is routed through
`portfolio.test.pencilcaselamp.net.im`; production traffic is routed through
`portfolio.pencilcaselamp.net.im`.

## Deployment notes

- This app owns its own container, config, and deployment workflow.
- It does not modify shared infrastructure or shared Postgres.
- Docker Compose is reserved for test and production deployment only.
