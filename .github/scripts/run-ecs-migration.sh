#!/usr/bin/env bash
# Run `prisma migrate deploy` as a one-off ECS Fargate task inside the VPC,
# using the same secrets, subnets, security group and assignPublicIp as the
# production API service. Fails the script when the task does not exit 0.
#
# Usage: run-ecs-migration.sh <cluster> <api-task-family> <migrate-image>
#
# The migrate image is the API builder stage (contains the Prisma CLI, schema
# and migrations). The task never updates the running API service.
set -Eeuo pipefail

cluster="$1"
api_family="$2"
migrate_image="$3"

if [[ -z "$cluster" || -z "$api_family" || -z "$migrate_image" ]]; then
  echo "usage: run-ecs-migration.sh <cluster> <api-task-family> <migrate-image>" >&2
  exit 2
fi

# Network configuration of the running API service.
net="$(aws ecs describe-services --cluster "$cluster" --services "$api_family" --query 'services[0].networkConfiguration.awsvpcConfiguration' --output json)"
subnets="$(printf '%s' "$net" | jq -r '.subnets | join(",")')"
sgs="$(printf '%s' "$net" | jq -r '.securityGroups | join(",")')"
assign_pub="$(printf '%s' "$net" | jq -r '.assignPublicIp')"

# Clone the API task definition, swap in the migration image and override the
# command to run the migration. Keeps all secrets/roles/env/network intact.
task_json="$(aws ecs describe-task-definition --task-definition "$api_family" --query 'taskDefinition' --output json)"
migration_td="$(
  printf '%s' "$task_json" | jq --arg img "$migrate_image" '
    del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)
    | .family = "interscale-travel-crm-prod-migrate"
    | .containerDefinitions = (
        .containerDefinitions | map(
          .image = $img
          | .name = "migrate"
          | .command = ["node", "apps/api/docker-entrypoint.mjs", "npx", "prisma", "migrate", "deploy", "--schema", "apps/api/prisma/schema.prisma"]
        )
      )
  '
)"
migration_def_arn="$(printf '%s' "$migration_td" | aws ecs register-task-definition --cli-input-json /dev/stdin --query 'taskDefinition.taskDefinitionArn' --output text)"

echo "registered migration task definition: ${migration_def_arn}"

task_arn="$(aws ecs run-task \
  --cluster "$cluster" \
  --task-definition "$migration_def_arn" \
  --launch-type FARGATE \
  --count 1 \
  --network-configuration "awsvpcConfiguration={subnets=[${subnets}],securityGroups=[${sgs}],assignPublicIp=${assign_pub}}" \
  --query 'tasks[0].taskArn' --output text)"

echo "migration task started: ${task_arn}"

# Wait for the task to stop.
for _ in $(seq 1 90); do
  status="$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task_arn" --query 'tasks[0].lastStatus' --output text)"
  if [[ "$status" == "STOPPED" ]]; then
    break
  fi
  sleep 10
done

if [[ "$status" != "STOPPED" ]]; then
  echo "migration task did not stop within the timeout: ${task_arn}" >&2
  exit 1
fi

exit_code="$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task_arn" --query 'tasks[0].containers[0].exitCode' --output text)"

if [[ "$exit_code" != "0" ]]; then
  echo "migration FAILED (exit ${exit_code}). Task ARN: ${task_arn}" >&2
  # Sanitized tail of the migration logs (never prints DATABASE_URL/secrets).
  log_group="/ecs/interscale-travel-crm-prod/migrations"
  stream="$(aws logs describe-log-streams --log-group-name "$log_group" --order-by LastEventTime --descending --max-items 1 --query 'logStreams[0].logStreamName' --output text)"
  if [[ -n "$stream" && "$stream" != "None" ]]; then
    aws logs get-log-events --log-group-name "$log_group" --log-stream-name "$stream" \
      --query 'events[].message' --output text \
      | grep -iE 'error|failed|migration' \
      | tail -20 \
      || true
  fi
  exit 1
fi

echo "migration succeeded (exit 0). Task ARN: ${task_arn}"
