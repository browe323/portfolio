# Deployment Pattern: test-app approach

This document explains the deployment pattern used by `test-app` at `/opt/apps/test-app/`, which is a simpler and more practical alternative to the comprehensive SKILL-deployment-pipeline.md.

## Why this pattern

The test-app pattern is:
- **Simpler** — focuses on deployment, not local build infrastructure
- **Immutable** — uses pre-built images pushed to a registry
- **Practical** — mirrors how real apps are deployed in production

## How it works

### 1. Local development (no Docker)

Developer works on their machine with native language tooling:

```bash
# Example Node app
npm install
npm run dev
# or
npm start
```

Database connection: `localhost:5432` (via `.env.local`)

### 2. CI builds the Docker image

GitHub Actions runs CI on every commit and builds a Docker image if tests pass.

The image is tagged and pushed to a registry (e.g., `ghcr.io/your-org/app:commit-sha`).

### 3. Deploy via pre-built image

Both test and production environments use the same pre-built image; only the env file changes.

The deploy workflow:
1. SSH into the shared VM
2. Pull the latest repo code
3. Set `IMAGE_REF` to the Docker image reference
4. Run `docker compose up -d` with that image

## File structure

Required files in the app repo:

```
app-repo/
  docker-compose.test.yml     # test environment config
  docker-compose.prod.yml     # production environment config
  .env.example                # safe defaults, committed
  .env.test                   # test secrets (gitignored, on VM only)
  .env.prod                   # prod secrets (gitignored, on VM only)
  Dockerfile                  # app image definition
  .github/
    workflows/
      ci.yml                  # builds image and runs tests
      deploy-test.yml         # deploys test image
      deploy-prod.yml         # deploys prod image
```

## docker-compose.test.yml

```yaml
name: <app>-test

services:
  web:
    image: ${IMAGE_REF:?IMAGE_REF must be set to an immutable image reference}
    env_file:
      - .env.test
    networks:
      - shared_net
    labels:
      traefik.enable: "true"
      traefik.http.routers.<app>-test.rule: "Host(`test-<app>.yourdomain.com`)"
      traefik.http.routers.<app>-test.entrypoints: "web"
      traefik.http.services.<app>-test.loadbalancer.server.port: "5000"
    restart: unless-stopped

networks:
  shared_net:
    external: true
```

Replace:
- `<app>` with the app name (e.g., `myapp`)
- `5000` with the app's actual port
- `.env.test` with the test environment file name

## docker-compose.prod.yml

Identical to test, but:

```yaml
name: <app>-prod

services:
  web:
    image: ${IMAGE_REF:?IMAGE_REF must be set to an immutable image reference}
    env_file:
      - .env.prod
    networks:
      - shared_net
    labels:
      traefik.enable: "true"
      traefik.http.routers.<app>-prod.rule: "Host(`<app>.yourdomain.com`)"
      traefik.http.routers.<app>-prod.entrypoints: "web"
      traefik.http.services.<app>-prod.loadbalancer.server.port: "5000"
    restart: unless-stopped

networks:
  shared_net:
    external: true
```

Changes from test:
- `name: <app>-prod` (not `-test`)
- `traefik.http.routers.<app>-prod.rule: "Host(`<app>.yourdomain.com`)"` (prod domain, not test subdomain)
- `env_file: .env.prod` (prod secrets)

## Environment files

### .env.test (gitignored, stored on VM)

```
DATABASE_URL=postgresql://<app>_test_user:password@postgres-test:5432/<app>_test
API_KEY=test-key
DEBUG=false
```

### .env.prod (gitignored, stored on VM)

```
DATABASE_URL=postgresql://<app>_prod_user:password@postgres-prod:5432/<app>_prod
API_KEY=prod-key
DEBUG=false
```

### .env.example (committed to repo)

```
DATABASE_URL=postgresql://localhost/<app>_dev
API_KEY=change-me
DEBUG=true
```

## Dockerfile

Define how to build the image:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
```

Adjust for your language/framework.

## CI Workflow (ci.yml)

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
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Lint
        run: npm run lint
      - name: Test
        run: npm run test
      - name: Build
        run: npm run build
      - name: Build Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          tags: ghcr.io/your-org/<app>:${{ github.sha }}
          push: false
```

This builds the image but doesn't push it. Add `push: true` and Docker login once you have registry credentials.

## Deploy Test Workflow (deploy-test.yml)

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
      - name: Log in to Docker registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/your-org/<app>:latest,ghcr.io/your-org/<app>:${{ github.sha }}
      - name: Deploy to test
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.SSH_HOST }}
          username: vm-user
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /opt/apps/<app>
            git pull origin main
            IMAGE_REF=ghcr.io/your-org/<app>:${{ github.sha }} docker compose -f docker-compose.test.yml up -d
```

## Deploy Production Workflow (deploy-prod.yml)

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
      - name: Log in to Docker registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/your-org/<app>:${{ github.ref_name }}
      - name: Deploy to production
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.SSH_HOST }}
          username: vm-user
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /opt/apps/<app>
            git pull origin main
            git checkout ${{ github.ref_name }}
            IMAGE_REF=ghcr.io/your-org/<app>:${{ github.ref_name }} docker compose -f docker-compose.prod.yml up -d
```

## GitHub Environment secrets

Required in GitHub for both `test` and `production` environments:

- `SSH_HOST` — the VM hostname
- `SSH_KEY` — SSH private key for `vm-user`
- Any app-specific secrets (API keys, DB passwords, etc.)

Optional (if using different Docker registry):
- `DOCKER_USERNAME`, `DOCKER_PASSWORD`, `DOCKER_REGISTRY`

## Deployment flow

1. Developer works locally with native tooling and `.env.local`
2. Commits and pushes to a feature branch
3. CI runs (lint, test, build image)
4. Merge to `main`
5. Deploy test workflow runs, pushes image to registry, SSHes into VM, pulls latest code, deploys with that image
6. Validate at `test-<app>.yourdomain.com`
7. Tag a commit: `git tag v1.0.0 && git push origin v1.0.0`
8. Deploy prod workflow runs, builds/pushes versioned image, deploys to production
9. Verify at `<app>.yourdomain.com`

## Key differences from the skill file

| Aspect | Skill file | test-app pattern |
|--------|-----------|------------------|
| Build | `docker compose build` with `build: .` | CI builds image, pushes to registry |
| Deploy | `docker compose build && up` | `docker compose up` with pre-built image |
| Simplicity | Comprehensive templates | Minimal, focused |
| Image source | Built on VM | Built in CI, pulled from registry |
| Config | Inline environment vars | `.env` files |

The test-app pattern is **recommended** for new apps because it mirrors production practices and keeps the VM simple (only pulls and runs images, never builds).
