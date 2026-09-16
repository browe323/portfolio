# Deployment Pipeline Scaffold Skill

Use this skill when scaffolding CI/CD and deployment infrastructure for a fresh app in the `/opt` suite.

## Key requirement

**This app will run in a Docker container on the shared VM.** Local development: run your app code natively (no container), and use either a local Postgres container or native Postgres (both connect to localhost:5432). Docker Compose is only for test and production deployment on the server.

## Context

The app suite uses:
- **Three environments**: local (developer machine), test (shared VM), production (shared VM)
- **GitHub Actions** for CI and deployment automation
- **Shared infrastructure** at `/opt/infra`: Traefik, shared Docker network (`shared_net`), and two Postgres instances
- **Independent app deployment**: each app deploys on its own schedule via GitHub workflows

The developer should never manually SSH into the server to deploy — GitHub Actions handles all deployment.

## Deployment architecture for this app

```
Developer's machine
  ↓ git push
GitHub
  ↓ run CI (lint, test, build)
  ↓ merge to main
  ↓ run deploy-test workflow
Shared VM test environment
  ↓ (manually tag version)
  ↓ run deploy-prod workflow
Shared VM production environment
```

## Required files to create

1. `.github/workflows/ci.yml` — runs on pull requests and commits
2. `.github/workflows/deploy-test.yml` — runs on merge to main
3. `.github/workflows/deploy-prod.yml` — runs on version tags
4. `docker-compose.test.yml` — test environment container config
5. `docker-compose.prod.yml` — production environment container config
6. `.env.example` — safe defaults for local development
7. `.github/copilot-instructions.md` — app-level deployment guidance (use template from `/opt/templates/copilot-instructions.template.md`)

## GitHub Actions workflow structure

### CI Workflow (`ci.yml`)

Trigger: on every pull request and push to any branch.

Purpose: validate that the app can lint, test, and build.

Template:

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up [language/runtime]
        # Language-specific setup (Node, Python, Go, etc.)
      - name: Install dependencies
        run: |
          # app-specific install command
      - name: Lint
        run: |
          # app-specific lint command
      - name: Test
        run: |
          # app-specific test command
      - name: Build
        run: |
          # app-specific build command
```

Replace the bracketed sections with the app's actual language and commands.

### Deploy Test Workflow (`deploy-test.yml`)

Trigger: on merge to `main` branch.

Purpose: build the Docker image, push to a registry, and deploy to test environment.

Template:

```yaml
name: Deploy to Test

on:
  push:
    branches:
      - main

jobs:
  deploy-test:
    runs-on: ubuntu-latest
    environment: test
    steps:
      - uses: actions/checkout@v4
      - name: Log in to Docker
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ secrets.DOCKER_REGISTRY }}/<app>-test:latest
      - name: Deploy to test
        uses: actions/ssh-deploy@v1
        with:
          host: ${{ secrets.SSH_HOST }}
          username: vm-user
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /opt/apps/<app>
            git pull origin main
            docker compose -f docker-compose.test.yml up -d --pull always
```

The `test` GitHub Environment should contain:
- `SSH_HOST` — the shared VM hostname
- `SSH_KEY` — SSH private key for `vm-user`
- `DOCKER_USERNAME`, `DOCKER_PASSWORD` — Docker registry credentials
- `DOCKER_REGISTRY` — Docker registry URL (e.g., `ghcr.io/yourorg`)
- Any app-specific secrets (DB passwords, API keys, etc.)

### Deploy Production Workflow (`deploy-prod.yml`)

Trigger: on version tags (e.g., `v1.0.0`).

Purpose: build a production image, push it, and deploy to production.

Template:

```yaml
name: Deploy to Production

on:
  push:
    tags:
      - 'v*'

jobs:
  deploy-prod:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Log in to Docker
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ secrets.DOCKER_REGISTRY }}/<app>-prod:${{ github.ref_name }}
      - name: Deploy to production
        uses: actions/ssh-deploy@v1
        with:
          host: ${{ secrets.SSH_HOST }}
          username: vm-user
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /opt/apps/<app>
            git pull origin main
            git checkout ${{ github.ref_name }}
            docker compose -f docker-compose.prod.yml up -d --pull always
```

The `production` GitHub Environment should contain the same secrets as `test`, but with production-specific values.

## Docker Compose for test

File: `docker-compose.test.yml`

Purpose: define test environment containers.

Template:

```yaml
version: '3.8'

services:
  backend:
    build: .
    container_name: <app>-test-backend
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://<app>_test_user:${DB_PASSWORD_TEST}@postgres-test:5432/<app>_test
      NODE_ENV: test
    networks:
      - shared_net
    labels:
      - traefik.enable=true
      - traefik.http.routers.<app>-test.rule=Host(`test.<app>.yourdomain.com`)
      - traefik.http.routers.<app>-test.entrypoints=web,websecure
      - traefik.http.services.<app>-test.loadbalancer.server.port=3000

networks:
  shared_net:
    external: true
```

Adjust:
- `container_name` to `<app>-test-backend` (or frontend if applicable)
- `DATABASE_URL` to the correct DB connection string
- Port number to the app's actual port
- Environment variables based on the app's requirements
- Traefik labels for routing

## Docker Compose for production

File: `docker-compose.prod.yml`

Purpose: define production environment containers.

Template:

```yaml
version: '3.8'

services:
  backend:
    image: ${{ secrets.DOCKER_REGISTRY }}/<app>-prod:${VERSION}
    container_name: <app>-prod-backend
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://<app>_prod_user:${DB_PASSWORD_PROD}@postgres-prod:5432/<app>_prod
      NODE_ENV: production
    networks:
      - shared_net
    labels:
      - traefik.enable=true
      - traefik.http.routers.<app>-prod.rule=Host(`<app>.yourdomain.com`)
      - traefik.http.routers.<app>-prod.entrypoints=web,websecure
      - traefik.http.services.<app>-prod.loadbalancer.server.port=3000

networks:
  shared_net:
    external: true
```

Same structure as test, but:
- Uses `image:` instead of `build:` (points to production image)
- Routes to `<app>.yourdomain.com` (production domain)
- Connects to `postgres-prod` instead of `postgres-test`
- Uses production environment variables

## Environment variables

### Local development (`.env.local`, gitignored)

```
DATABASE_URL=postgresql://localhost/myapp_dev
NODE_ENV=development
API_KEY=dev-key
```

### Test environment (GitHub Environment `test`)

Store in GitHub:
- `DB_PASSWORD_TEST` — password for `<app>_test_user` in `postgres-test`
- `DOCKER_USERNAME`, `DOCKER_PASSWORD`, `DOCKER_REGISTRY` — Docker registry access
- `SSH_HOST`, `SSH_KEY` — SSH deploy credentials
- Any other app-specific secrets

### Production environment (GitHub Environment `production`)

Store in GitHub:
- `DB_PASSWORD_PROD` — password for `<app>_prod_user` in `postgres-prod`
- `DOCKER_USERNAME`, `DOCKER_PASSWORD`, `DOCKER_REGISTRY` — Docker registry access
- `SSH_HOST`, `SSH_KEY` — SSH deploy credentials (same as test)
- Any other app-specific production secrets

### `.env.example` (committed)

```
# Local development example
DATABASE_URL=postgresql://localhost/<app>_dev
NODE_ENV=development
API_KEY=change-me
```

## Database setup

Before the first deployment to test or production:

1. Create the test database and user on `postgres-test`:
   ```bash
   docker exec -it postgres-test psql -U postgres -c "CREATE DATABASE <app>_test;"
   docker exec -it postgres-test psql -U postgres -c "CREATE USER <app>_test_user WITH PASSWORD '...';"
   docker exec -it postgres-test psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE <app>_test TO <app>_test_user;"
   ```

2. Repeat for production on `postgres-prod` with `<app>_prod` and `<app>_prod_user`.

3. Store the generated passwords as secrets in GitHub Environments.

## Deployment flow

1. Developer works locally with `.env.local`.
2. Commits and pushes to a feature branch.
3. CI runs (lint, test, build).
4. Open a pull request; CI is required.
5. Merge to `main`.
6. Deploy test workflow runs automatically, builds image, and deploys to test environment.
7. Validate behavior in test at `test.<app>.yourdomain.com`.
8. When ready to release, tag the commit: `git tag v1.0.0 && git push origin v1.0.0`.
9. Deploy prod workflow runs, builds versioned image, and deploys to production.
10. Verify production at `<app>.yourdomain.com`.

## Key constraints

- Never use the Postgres root user in app code.
- Use least-privilege database users per environment.
- Store all secrets in GitHub Environments, never in the repo.
- The app must join the shared Docker network `shared_net` as external.
- Do not manage Traefik or PostgreSQL from this app's compose files.
- Each app deploys independently; do not combine multiple apps in one workflow.

## Troubleshooting

- **SSH deploy fails**: Check SSH key and host in GitHub Environments.
- **Docker image push fails**: Verify Docker registry credentials.
- **App can't reach Postgres**: Ensure the container is on `shared_net` and the DB credentials are correct.
- **Traefik not routing**: Check labels are correct and `exposedByDefault` is `false` in Traefik config.
