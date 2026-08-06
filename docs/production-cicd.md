# Production CI/CD

Automatic production deployment for Interscale Travel CRM via GitHub Actions and
GitHub Actions OIDC. No permanent AWS keys are stored in GitHub.

## Architecture

- Frontend: Nginx container in ECS Fargate (`interscale-travel-crm-prod-frontend`)
- API: Node/Express container in ECS Fargate (`interscale-travel-crm-prod-api`)
- Marketing website: Nginx static container in ECS Fargate (`interscale-travel-crm-prod-marketing`)
- Public domain: `https://app.travelagencycrm.in` (ALB, no CloudFront)
- Public marketing site: `https://travelagencycrm.in` (ALB, separate service)
- Public API base: `https://app.travelagencycrm.in/api`

## 1. Automatic deployment behavior

Pushing to `main` triggers `.github/workflows/deploy-production.yml`. The
workflow compares the pushed commit against the previous commit, decides which
services changed, builds and pushes immutable images to ECR, registers new ECS
task-definition revisions, runs Prisma migrations when required, updates the
affected ECS service(s), waits for ECS/ALB health, and verifies the public
production URLs.

Only one production deployment runs at a time (`concurrency` group
`production-deployment`). A newer push never cancels an active deployment; it
waits for the current run to finish.

## 2. Paths that trigger frontend

- `apps/web/**`

## 3. Paths that trigger API

- `apps/api/**`

## 4. Paths that trigger both

- `packages/shared/**`
- `package.json`, `package-lock.json`
- `tsconfig.base.json`
- `.dockerignore`

Documentation and reference files (`docs/**`, `*.md`, `references/**`,
images) do not deploy anything. Infrastructure (`infra/**`, `.github/**`)
does not auto-deploy: it prints a notice to run the manual infrastructure
deployment process.

## 4a. Marketing website deployment

The public marketing website (`apps/marketing`) is a separate application and
ECS service. It deploys through its own workflow,
`.github/workflows/deploy-marketing.yml`, which triggers on pushes to `main`
affecting `apps/marketing/**` (plus the shared root build manifests the
marketing app depends on). It builds the static site, pushes an immutable
`<full-git-sha>` image to the `interscale-travel-crm-prod-marketing` ECR
repository, registers a new revision of the
`interscale-travel-crm-prod-marketing` task family, updates the ECS service,
waits for target health, verifies the public marketing URLs and the untouched
CRM/API endpoints, and rolls back to the previous task definition on failure.

Marketing-only changes never trigger the CRM frontend/API deployment workflow.

## 5. Migrations

- A migration run is required when `apps/api/prisma/migrations/**` changes or
  when the manual `run_migrations=yes` input is used.
- Migrations run as a one-off ECS Fargate task inside the VPC using the API
  builder image (`prisma migrate deploy`) — never from the runner directly
  against RDS. RDS stays private.
- The API ECS service is **not** updated until the migration task exits 0.
- If `apps/api/prisma/schema.prisma` changes without a committed migration,
  the API job fails before deployment with:
  > "Prisma schema changed but no production migration was committed. Generate
  > and review a migration locally before deploying."

## 6. Manual deployment

Use the GitHub Actions UI or CLI:

```bash
gh workflow run deploy-production.yml --ref main \
  -f deploy_scope=auto -f run_migrations=auto
```

## 7. Force frontend-only deployment

```bash
gh workflow run deploy-production.yml --ref main \
  -f deploy_scope=frontend -f run_migrations=no
```

## 8. Force API-only deployment

```bash
gh workflow run deploy-production.yml --ref main \
  -f deploy_scope=api -f run_migrations=auto
```

`deploy_scope` accepts `auto | frontend | api | both`.
`run_migrations` accepts `auto | yes | no`.

## 9. Rollback

- ECS services use deployment circuit breakers. If a deployment fails health,
  the workflow restores the previous task-definition revision automatically
  (`rollback-ecs-service.sh`).
- Database migrations are forward-only; migration rollback is never attempted.
- To manually redeploy a previous image/task revision:

```bash
aws ecs update-service \
  --cluster interscale-travel-crm-prod \
  --service interscale-travel-crm-prod-frontend \
  --task-definition <previous-task-definition-arn>
```

## 10. Where GitHub Actions logs appear

GitHub → Actions → "Deploy Production" → a run → job steps. Deployment
summaries are written to the run summary tab.

## 11. Where ECS logs appear

CloudWatch Log Groups:

- `/ecs/interscale-travel-crm-prod/api`
- `/ecs/interscale-travel-crm-prod/frontend`
- `/ecs/interscale-travel-crm-prod/migrations`

## 12. OIDC authentication design

The workflow assumes an AWS IAM role
(`interscale-travel-crm-github-production`) via
`aws-actions/configure-aws-credentials` with `id-token: write`. The role's
trust policy restricts `sub` to the exact repository
(`vikas-cse123/travel-crm`) and to the `production` environment / `main`
branch. The audience is `sts.amazonaws.com`.

## 13. No permanent AWS keys in GitHub

Only the OIDC role is used. No `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
exist in GitHub secrets.

## 14. Updating the GitHub OIDC role safely

The role is managed by CDK in `InterscaleCicdStack`
(`infra/aws/lib/cicd-stack.ts`). Deploy it with:

```bash
cd infra/aws
npx cdk deploy InterscaleCicdStack
```

Only the CICD stack is touched by this workflow process; application
infrastructure deploys are separate and manual.

## 15. Infrastructure changes remain manual

Changes under `infra/**` never auto-deploy. Run `cdk diff` then
`cdk deploy <stack>` manually after review.

## 16. Troubleshooting

- **OIDC / role assumption failure**: confirm the workflow job uses
  `environment: production` and the role trust policy matches the repository.
- **"Prisma schema changed but no migration"**: add and review a migration
  locally, commit it, then push.
- **Migration task fails**: inspect the migration CloudWatch log group and the
  failed GitHub run step; the API service is left on its previous task
  definition.
- **Frontend/API target not healthy**: check `aws ecs wait services-stable`
  output and CloudWatch ECS logs; the workflow rolls back automatically.

## 17. Redeploy a previous image/task revision

See section 9. Each deployment uses an immutable image tag equal to the Git
commit SHA, so any prior commit's image remains available in ECR.

## 18. Disabling the workflow in an emergency

- GitHub → Actions → "Deploy Production" → `…` → "Disable workflow", or
- rename/remove `.github/workflows/deploy-production.yml`.
