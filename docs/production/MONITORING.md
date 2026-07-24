# Monitoring & Alerting

This phase adds **documentation hooks**, not a paid vendor dependency. Wire
these to your platform's native tools (CloudWatch, GCP Ops, Grafana, etc.) or a
provider of your choice. Keep it lightweight for the first single-instance
deployment.

## What already exists

- **Structured logs** — Pino JSON logs on stdout with sensitive fields redacted
  (`apps/api/src/config/logger.ts`): authorization/cookie/set-cookie, passwords,
  OTPs and tokens never reach a log sink. Public-quotation tokens are stripped
  from request URLs.
- **Request correlation** — every request carries an `X-Request-Id`.
- **Health endpoints** — `/api/health` (liveness) and `/api/health/db`
  (readiness, `503` when the DB is down).

## Recommended alerts (configure outside the app)

| Signal                    | Source                                  | Suggested alert                          |
| ------------------------- | --------------------------------------- | ---------------------------------------- |
| API 5xx rate              | LB / log metric filter on status ≥ 500  | > N 5xx in 5 min                         |
| Health-check failures     | LB target health / `/api/health`        | Any unhealthy target                     |
| Database readiness        | Probe `/api/health/db`                  | `503` sustained > 1 min                  |
| Database connections/CPU  | Managed DB metrics                      | Connections near pool limit; high CPU    |
| Reminder job failures     | Worker exit code ≠ 0 / log `fatal`      | Any failed run; or no successful run/day |
| SMTP delivery failures    | Log line "Email delivery failed"        | Spikes in send failures                  |
| Disk / storage            | DB storage %, S3 request errors         | DB free space low; S3 4xx/5xx spikes     |

Log strings to key metric filters on:

- `Reminder processing failed` (worker fatal)
- `Email delivery failed` (best-effort mail send failed)
- `Database health check failed` (readiness probe failure)

## Central log aggregation

Ship stdout to a central store (CloudWatch Logs, Loki, ELK, a SaaS). Since logs
are JSON, index on `level`, `req.id`, `res.statusCode` for fast triage.

## Error monitoring (optional, deferred)

No error-monitoring vendor is integrated in this phase (deliberate: avoid a
vendor dependency now). If added later, prefer a small adapter behind an
interface so the choice stays swappable; capture unhandled rejections/exceptions
(already logged at `fatal` in `apps/api/src/server.ts`) and 5xx responses.

## Rate-limit scaling note

The rate limiter is **in-memory and per-instance** and resets on restart. It is
sufficient for the first single-instance deployment. Before running more than
one API instance, move to a shared store (e.g. Redis) so limits are global —
until then, horizontal scaling weakens rate limiting and account-lockout
counting. Redis is intentionally **not** added in this phase.
