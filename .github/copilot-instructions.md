# App deployment guidance

This repository owns its own application deployment and must not modify shared infrastructure managed under /opt/infra.

## Rules

- Keep this app self-contained and independently deployable.
- Do not change Traefik, shared networking, or shared Postgres.
- Use GitHub Environment secrets for test and production configuration.
- Production deploys trigger only on version tags or GitHub Releases.
- Test deploys trigger after merge to main.
- Validate required config at startup.
- Docker Compose is for test and production deployment only; local development stays native.
