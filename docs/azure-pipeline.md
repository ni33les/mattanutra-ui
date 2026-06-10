# Azure Pipeline

The repository ships an Azure DevOps pipeline at `/azure-pipelines.yml`.

## What It Does

- Runs on pushes to `dev`, `uat`, and `main`.
- Runs on pull requests targeting `dev`, `uat`, and `main`.
- Installs dependencies with `npm ci`.
- Runs:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run build:dev-fast`
- On the `uat` branch, runs `npm run uat:smoke` when `UAT_DB_URL` is configured.

This pipeline validates the app and can smoke-test UAT. It does not replace the existing DigitalOcean deployment mechanism.

## One-Time Azure Setup

1. In Azure DevOps, open the target project.
2. Go to **Pipelines**.
3. Choose **New pipeline**.
4. Select **GitHub**.
5. Select `ni33les/mattanutra-ui`.
6. Choose **Existing Azure Pipelines YAML file**.
7. Select branch `dev`.
8. Select `/azure-pipelines.yml`.
9. Save and run.

After this, pushes to `dev` and `uat` should appear as Azure pipeline runs.

## Optional UAT Smoke Variables

Add these in Azure DevOps under the pipeline's **Variables** or in a linked variable group.

Required for DB-backed UAT smoke:

```txt
UAT_DB_URL
```

Optional for stronger DigitalOcean deployment checks:

```txt
DIGITALOCEAN_ACCESS_TOKEN
UAT_DIGITALOCEAN_APP_ID
UAT_DIGITALOCEAN_APP_NAME
UAT_DIGITALOCEAN_COMPONENT_NAME
UAT_DIGITALOCEAN_SERVICE_NAME
```

Optional for LINE health checks:

```txt
LINE_CHANNEL_ACCESS_TOKEN
LINE_CHANNEL_SECRET
```

Keep secret values marked as secret in Azure DevOps. The pipeline never prints these values.
