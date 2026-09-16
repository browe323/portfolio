# Deployment Runbook

This runbook documents the deployment process already implemented for `test-app` and the
parts that must be repeated for another application. It assumes the shared `/opt`
system is already operating: Traefik, Nginx Proxy Manager, the external Docker network
`shared_net`, Tailscale, `postgres-test`, and `postgres-prod` are shared infrastructure
and are not managed by this repository.

## 1. Current deployment architecture

The application is deployed as an immutable Docker image:

```text
pull request
    -> CI tests + Docker build (no publish)
merge to main
    -> build image once
    -> push ghcr.io/<owner>/test-app:<commit-sha>
    -> deploy that SHA to test
release tag v*
    -> deploy the same commit SHA to production
```

The deployment VM does not contain the Git checkout or source code. For this app it only
contains:

```text
/opt/apps/test-app/
  docker-compose.test.yml
  docker-compose.prod.yml
  .env.test
  .env.prod
```

The deployment workflows copy the appropriate Compose file from GitHub Actions, pull the
immutable image from GHCR, and update only this app's Compose project. They do not restart
Traefik, either PostgreSQL service, or another application.

Traffic flows as follows:

```text
public HTTPS
  -> Nginx Proxy Manager (public certificates and edge routing)
  -> shared_net
  -> Traefik router for the app
  -> web container on port 5000
```

The app's deployment Compose files intentionally have no build context and publish no
host ports. They join the pre-existing external `shared_net` network and expose the
container to Traefik through labels.

## 2. What is already complete for `test-app`

Do not recreate these items for this app:

- The image-based test and production workflows in `.github/workflows/`.
- The GHCR image naming convention `ghcr.io/<owner>/test-app:<commit-sha>`.
- The test and production Compose templates, including their shared-network and Traefik
  configuration.
- The public hostnames:
  - `test-app.test.pencilcaselamp.net.im`
  - `test-app.pencilcaselamp.net.im`
- The shared VM path `/opt/apps/test-app`.
- The VM GHCR pull credential `bens-vm-ghcr-pull`. It has already been created. Do not
  generate another PAT; verify that this credential is read-only and can pull this
  repository's private package.
- The shared services and network owned by `/opt/infra`.

The remaining values are app/environment-specific: the database roles and passwords,
`SECRET_KEY`, GitHub Environment values, deployment SSH key, host, and Tailscale OAuth
credentials.

## 3. Secret and credential inventory

Keep these categories separate:

| Credential | Used by | Store it in | Generate or obtain |
| --- | --- | --- | --- |
| `SECRET_KEY` for test | Test container only | VM `/opt/apps/test-app/.env.test`, mode `0600` | `openssl rand -hex 32` |
| `SECRET_KEY` for production | Production container only | VM `/opt/apps/test-app/.env.prod`, mode `0600` | Generate a separate value with `openssl rand -hex 32` |
| Test database password | `postgres-test` and `.env.test` | Password manager plus the database and VM env file | Generate a random value; never reuse production |
| Production database password | `postgres-prod` and `.env.prod` | Password manager plus the database and VM env file | Generate a separate random value |
| `bens-vm-ghcr-pull` | Docker on the deployment VM | Existing VM Docker credential / approved password manager record | Already created; do not regenerate |
| `TS_OAUTH_CLIENT_ID` | GitHub Actions Tailscale login | GitHub Environment `test` and `production` | Tailscale admin console |
| `TS_OAUTH_CLIENT_SECRET` | GitHub Actions Tailscale login | GitHub Environment `test` and `production` | Tailscale admin console |
| `DEPLOY_SSH_PRIVATE_KEY` | GitHub Actions SSH client | GitHub Environment `test` and `production` | `ssh-keygen` on an administrator workstation |
| `DEPLOY_SSH_KNOWN_HOSTS` | GitHub Actions SSH host verification | GitHub Environment `test` and `production` | Verified `ssh-keyscan` output |
| `DEPLOY_HOST` | GitHub Actions | GitHub Environment `test` and `production` | VM MagicDNS name or tailnet IP |
| `DEPLOY_USER` | GitHub Actions | GitHub Environment `test` and `production` | Existing non-root VM account |

Never commit any of these values, put them in `.env.example`, or place them in a
Dockerfile, Compose file, workflow, issue, or chat message. GitHub Actions secrets are
used only for deployment access. Runtime application secrets stay on the VM and are not
copied through GitHub Actions.

## 4. Generate the app secrets

Run these commands on a trusted administrator machine or directly on the VM without
logging the output. The values below are examples of commands, not values to commit:

```bash
openssl rand -hex 32   # test SECRET_KEY
openssl rand -hex 32   # production SECRET_KEY
openssl rand -hex 32   # test database password
openssl rand -hex 32   # production database password
```

Use different values for every environment. A database password must be URL-encoded
when inserted into `DATABASE_URL`; hexadecimal passwords are convenient because they do
not require URL encoding.

Create least-privilege database roles in the corresponding PostgreSQL environment.
Use the PostgreSQL administration procedure owned by `/opt/infra`; do not use the
PostgreSQL superuser in the application configuration. Conceptually, each environment
needs a separate database and role:

```text
test:       test-app_test / test-app_test_user / unique password
production: test-app_prod / test-app_prod_user / unique password
```

The exact SQL and bootstrap location belong to the shared PostgreSQL infrastructure,
not this repository. Grant only the permissions required by the app and its migrations.

## 5. Create runtime files on the VM

Log in to the deployment VM as the non-root deploy account and create the app directory:

```bash
sudo install -d -o "$USER" -g docker -m 0750 /opt/apps/test-app
cd /opt/apps/test-app
```

Create the files without committing them. Each file must contain the production app
settings for its environment:

```dotenv
APP_ENV=production
SECRET_KEY=<unique environment secret>
DATABASE_URL=postgresql://test-app_test_user:<test-password>@postgres-test:5432/test-app_test
```

Save the equivalent production values in `.env.prod`, using `test-app_prod_user`,
`postgres-prod`, and `test-app_prod`. Then lock them down:

```bash
chmod 600 /opt/apps/test-app/.env.test /opt/apps/test-app/.env.prod
```

The Flask factory rejects production startup when `SECRET_KEY` or `DATABASE_URL` is
missing. The local `.env.example` is only a development template and must not be copied
as a production runtime file.

## 6. Configure private GHCR access on the VM

The VM must be able to pull the private package before the first deployment. The pull
credential `bens-vm-ghcr-pull` already exists, so retrieve its value from the approved
password manager or existing secure provisioning record rather than creating another
PAT. It should have only the package-read permission needed for this image and should
not be used by GitHub Actions or stored in the app `.env` files.

Log Docker in as the deploy user using the existing credential. Keep the token out of
shell history and pass it through standard input:

```bash
read -r GHCR_PULL_TOKEN
printf '%s' "$GHCR_PULL_TOKEN" | docker login ghcr.io \
  --username <token-owner> \
  --password-stdin
unset GHCR_PULL_TOKEN
```

The Docker credential is stored in the deploy user's Docker config. Protect the home
directory and do not run the login as root if the workflows will run Compose as the
deploy user. Test access with the exact image reference after the first merge to
`main`:

```bash
docker pull ghcr.io/<owner>/test-app:<commit-sha>
```

## 7. Configure GitHub Environments

Create protected GitHub Environments named exactly `test` and `production`. Add the
following secrets to each environment:

```text
TS_OAUTH_CLIENT_ID
TS_OAUTH_CLIENT_SECRET
DEPLOY_HOST
DEPLOY_USER
DEPLOY_SSH_PRIVATE_KEY
DEPLOY_SSH_KNOWN_HOSTS
```

Use environment protection rules appropriate to the risk. The production environment
should require an explicit reviewer or equivalent release approval.

### Tailscale credentials

In the Tailscale admin console, create an OAuth client for GitHub Actions with the
minimum permissions needed to authenticate ephemeral nodes. Authorize the tag
`tag:github-actions`. Tailnet ACLs must allow that tag to reach only the deployment VM
on TCP port 22. Put the client ID and secret in both GitHub Environments; never put
Tailscale credentials in the VM runtime files.

### Deployment SSH key

Generate a dedicated key pair on a trusted workstation, with no passphrase prompt in
CI because the private key is supplied as a protected GitHub secret:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/test-app-deploy -C 'github-actions test-app deploy'
```

Install only the public key on the VM deploy account's `~/.ssh/authorized_keys`, with
normal SSH permissions. Do not install the private key on the VM. Restrict the account
so it can run the required Docker Compose commands and cannot administer shared
infrastructure.

Pin the VM host key out of band before storing it in GitHub. For example, from a
trusted network:

```bash
ssh-keyscan -H <vm-magicdns-name> > /tmp/test-app-known-hosts
ssh-keygen -lf /tmp/test-app-known-hosts
```

Compare the fingerprint with the VM console or an already trusted administrator record.
Only after verification should the complete known-hosts line be saved as
`DEPLOY_SSH_KNOWN_HOSTS`. Never disable host-key checking to work around a mismatch.

## 8. How the existing workflows operate

### Pull requests

`ci.yml` checks out the source, installs Python 3.11 dependencies, runs `python -m
pytest`, and builds the Docker image. It does not publish an image or deploy anything.

### Merge to `main`

`deploy-test.yml` runs in the protected `test` Environment and:

1. Checks out the commit.
2. Logs in to GHCR with the short-lived `GITHUB_TOKEN` and package-write permission.
3. Builds `Dockerfile` once and pushes the immutable SHA tag plus the convenience `test`
   tag.
4. Authenticates the ephemeral GitHub runner to Tailscale.
5. Writes the dedicated SSH key and pinned known-hosts entry into the runner.
6. Copies `docker-compose.test.yml` to `/opt/apps/test-app`.
7. Runs `docker compose pull` and `docker compose up -d --remove-orphans` with
   `.env.test` and `IMAGE_REF=ghcr.io/<owner>/test-app:<github.sha>`.

The image is then available at `https://test-app.test.pencilcaselamp.net.im`.

### Production release

After test validation, tag the tested commit and push the tag:

```bash
git checkout main
git pull --ff-only origin main
git tag v<version> <tested-commit-sha>
git push origin v<version>
```

`deploy-prod.yml` runs in the protected `production` Environment. It does not rebuild
or push an image. It checks out the tag, derives the commit SHA, copies the production
Compose file, and pulls and starts that exact SHA image with `.env.prod`.

The image is then available at `https://test-app.pencilcaselamp.net.im`.

## 9. First deployment checklist

1. Confirm shared `shared_net`, Traefik, Nginx Proxy Manager, Tailscale, and both
   PostgreSQL services are healthy.
2. Confirm the app's least-privilege database roles and databases exist.
3. Confirm the VM deploy user can run Docker Compose and pull the private GHCR image.
4. Create `.env.test` and `.env.prod` on the VM with mode `0600`.
5. Confirm both GitHub Environments contain all six deployment secrets.
6. Confirm Tailscale ACLs allow `tag:github-actions` to reach only this VM on SSH.
7. Open a pull request and wait for CI.
8. Merge to `main`; verify the test URL, container health, logs, and database behavior.
9. Tag the tested commit; approve the production Environment deployment.
10. Verify the production URL and record the deployed commit SHA.

Useful VM checks:

```bash
cd /opt/apps/test-app
docker compose --env-file .env.test -f docker-compose.test.yml ps
docker compose --env-file .env.test -f docker-compose.test.yml logs --tail=100 web
```

Use the production env file and Compose file for production checks. Do not print the
contents of either env file in logs or support tickets.

## 10. Rollback

Rollback by selecting a previously deployed immutable SHA. On the VM, as the deploy
user:

```bash
cd /opt/apps/test-app
IMAGE_REF=ghcr.io/<owner>/test-app:<previous-sha> \
  docker compose --env-file .env.test -f docker-compose.test.yml up -d --remove-orphans
```

Use `.env.prod` and `docker-compose.prod.yml` for production. Confirm the image exists
in GHCR before starting it. Record the rollback reason and SHA, then create a follow-up
release or commit that addresses the cause. The command changes only this app's
Compose project.

## 11. Applying the process to another stack

Keep the deployment contract and replace the implementation details:

1. **Application contract:** expose one container port, provide a health endpoint or
   equivalent health check, read runtime configuration from environment variables, and
   fail startup when required production secrets are absent.
2. **Image build:** create a production Dockerfile or equivalent builder that runs the
   stack's tests and produces a reproducible image. Keep source builds out of the VM.
3. **Registry:** choose the image name `ghcr.io/<owner>/<app>` and publish an immutable
   commit-SHA tag. A mutable environment tag may be added for convenience, but deploy
   by SHA.
4. **Runtime template:** copy the Compose pattern into `docker-compose.test.yml` and
   `docker-compose.prod.yml`. Replace the image port, health behavior, service command,
   labels, and environment names. Keep `shared_net: external: true`; do not publish
   host ports.
5. **Routing:** reserve test and production hostnames, update the Traefik labels, and
   configure public TLS and edge routing in Nginx Proxy Manager. Do not create a second
   proxy inside the app repository.
6. **Data:** create separate app databases and least-privilege roles for test and
   production. Adapt migrations to the new stack and document whether migrations run as
   a one-off release job or during deployment.
7. **Runtime secrets:** generate separate keys and passwords for each environment and
   keep them in VM env files or a real secret manager. GitHub Actions should receive
   only deployment credentials, never database or application runtime secrets.
8. **CI:** replace the language setup, dependency install, test command, and image build
   command in `ci.yml`; retain the test gate before publishing.
9. **Test deploy:** retain the Tailscale, pinned SSH, Compose copy, image pull, and
   `up -d --remove-orphans` steps, changing only app names, paths, and filenames.
10. **Production deploy:** trigger on a version tag and deploy the tested commit SHA
    without rebuilding. Use a protected production Environment.
11. **Operations:** document health checks, logs, backup/migration procedures, rollback
    by SHA, and ownership boundaries before the first release.

For another app, repeat the app-specific setup in this section and the database/runtime
secret setup above. Reuse the shared network, edge, Tailscale policy pattern, and the
already-created `bens-vm-ghcr-pull` credential only when the package permissions and
ownership policy explicitly allow that reuse. Do not assume a different stack uses the
same port, startup command, migration tool, health endpoint, or environment variables.
