# AWS Infrastructure (Reference Architecture)

A concrete, recommended AWS topology for Interscale Travel CRM. It is a
**reference, not a requirement** — the app is cloud-neutral and runs equally on
GCP, Azure, Fly, Render, or a VPS with a reverse proxy. Map each component to
your platform's managed equivalent.

## Topology

```
                        Route 53 (DNS)
                             │
              ┌──────────────┴───────────────┐
        app.example.com                 api.example.com
              │                               │
        CloudFront (CDN)                Application Load Balancer (ACM TLS)
              │                               │
        S3 static bucket                 ECS Fargate service: API
        (apps/web/dist)                  (apps/api/dist/server.js, :4000)
                                              │
                          ┌───────────────────┼───────────────────┐
                          │                   │                   │
                   RDS PostgreSQL 16     S3 (private docs)     SES (SMTP)
                   (private subnet)      + SSE + versioning
                                              │
                          EventBridge Scheduler → ECS RunTask
                          (apps/api/dist/process-reminders.js)

     Secrets Manager / SSM  →  injected as env into API + worker tasks
     CloudWatch Logs/Alarms →  logs, 5xx alarms, DB + health alarms
```

## Components

- **RDS PostgreSQL 16** — Multi-AZ for production; private subnets; security
  group allows only the API/worker tasks. Automated backups + PITR. Optionally
  RDS Proxy for pooling. Storage encrypted (KMS).
- **S3 (documents)** — private bucket, Block Public Access ON, default SSE
  (SSE-S3 or SSE-KMS), versioning ON, lifecycle for noncurrent versions.
- **S3 + CloudFront (web)** — static SPA bucket behind CloudFront; SPA fallback
  (403/404 → `/index.html`); long-lived immutable cache for `/assets/*`,
  no-cache for `index.html`; ACM certificate.
- **ECS Fargate (API)** — runs the API image; task role grants S3 access (no
  static keys). ALB health check on `/api/health`; optional deep check on
  `/api/health/db`. Autoscale on CPU/requests (single task is fine at launch).
- **EventBridge Scheduler (worker)** — every few minutes, `RunTask` the same
  image with command `node apps/api/dist/process-reminders.js`. The advisory
  lock makes overlaps safe.
- **SES** — verified domain, SPF/DKIM/DMARC, out of sandbox; used via SMTP.
- **Secrets Manager / SSM** — `SESSION_SECRET`, `TOKEN_PEPPER`,
  `DATA_ENCRYPTION_KEY`, DB and SMTP credentials; injected into tasks.
- **ACM + Route 53** — TLS certificates and DNS for `app.` and `api.` on one
  registrable domain (keeps `SameSite=Lax` cookies working).
- **CloudWatch** — container logs, metric filters, and alarms (see
  MONITORING.md).

## IAM (least privilege, sketch)

API/worker task role — scoped to the documents bucket ARN:

```
s3:GetObject, s3:PutObject, s3:DeleteObject, s3:HeadObject  on
  arn:aws:s3:::interscale-prod/*
```

No `s3:*`, no other buckets. Prefer the task role over static access keys; when
a role is present, leave `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` unset.

## Notes

- Migrations run as a **separate** ECS RunTask (API `builder` stage or a
  one-off) before rolling the API — never on container start.
- Keep this reference in sync with the actual account; record real ARNs and IDs
  in your infrastructure-as-code, not here.
