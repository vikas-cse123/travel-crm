#!/usr/bin/env bash
# Clone the current ECS task definition, swap only the container image, and
# write a registerable definition. Read-only fields are removed; the image is
# the ONLY runtime change during a normal deployment.
#
# Usage: prepare-ecs-task-definition.sh <family> <image> <output.json>
#
# The output is deliberately never echoed in full: it contains secret
# references (task-definition `secrets`) that must not reach workflow logs.
set -Eeuo pipefail

family="$1"
image="$2"
output="$3"

if [[ -z "$family" || -z "$image" || -z "$output" ]]; then
  echo "usage: prepare-ecs-task-definition.sh <family> <image> <output.json>" >&2
  exit 2
fi

task_json="$(aws ecs describe-task-definition --task-definition "$family" --query 'taskDefinition' --output json)"

# Strip fields AWS rejects on registration. Keeps everything else: secrets,
# environment, roles, logging, port mappings, CPU/memory, platform, entrypoint.
printf '%s' "$task_json" | jq '
  del(
    .taskDefinitionArn,
    .revision,
    .status,
    .requiresAttributes,
    .compatibilities,
    .registeredAt,
    .registeredBy,
    .deregisteredAt
  )
  | .containerDefinitions = (
      .containerDefinitions | map(.image = "'"$image"'")
    )
' > "$output"

if [[ ! -s "$output" ]]; then
  echo "prepare-ecs-task-definition: failed to build task definition" >&2
  exit 1
fi

echo "prepared task definition for family=$family image=${image%%@*}"
