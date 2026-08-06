#!/usr/bin/env bash
# Roll back an ECS service to a previous task definition and wait for it to
# return to a stable, healthy state.
#
# Usage: rollback-ecs-service.sh <cluster> <service> <previous-task-definition>
set -Eeuo pipefail

cluster="$1"
service="$2"
previous_td="$3"

if [[ -z "$cluster" || -z "$service" || -z "$previous_td" ]]; then
  echo "usage: rollback-ecs-service.sh <cluster> <service> <previous-task-definition>" >&2
  exit 2
fi

echo "rolling back service $service to $previous_td"

aws ecs update-service \
  --cluster "$cluster" \
  --service "$service" \
  --task-definition "$previous_td" \
  --force-new-deployment > /dev/null

aws ecs wait services-stable --cluster "$cluster" --services "$service"

echo "rollback of $service to $previous_td completed"
