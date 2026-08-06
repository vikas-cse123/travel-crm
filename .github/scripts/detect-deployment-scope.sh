#!/usr/bin/env bash
# Detect which production services a push or manual run must deploy.
#
# Inputs (environment):
#   GITHUB_EVENT_NAME        push | workflow_dispatch
#   GITHUB_BEFORE            previous SHA (push)
#   GITHUB_SHA               current SHA
#   DEPLOY_SCOPE_INPUT       auto|frontend|api|both (workflow_dispatch)
#   RUN_MIGRATIONS_INPUT     auto|yes|no (workflow_dispatch)
#
# Outputs (set-output syntax) consumed by the workflow:
#   deploy_frontend, deploy_api, run_migrations, schema_without_migration,
#   infra_changed
set -Eeuo pipefail

deploy_frontend="false"
deploy_api="false"
run_migrations="false"
schema_without_migration="false"
infra_changed="false"

changed=""

if [[ "${GITHUB_EVENT_NAME:-}" == "push" ]]; then
  before="${GITHUB_BEFORE:-0000000000000000000000000000000000000000}"
  sha="${GITHUB_SHA:-HEAD}"
  if [[ "$before" =~ ^0+$ ]]; then
    # First push to the branch: treat all files as changed.
    changed="$(git ls-tree -r --name-only HEAD)"
  else
    changed="$(git diff --name-only "$before" "$sha")"
  fi
fi

is_frontend_path() {
  case "$1" in
    apps/web/*) return 0 ;;
  esac
  return 1
}

is_api_path() {
  case "$1" in
    apps/api/*) return 0 ;;
  esac
  return 1
}

is_shared_or_root_build() {
  case "$1" in
    packages/shared/*|package.json|package-lock.json|tsconfig.base.json|.dockerignore) return 0 ;;
  esac
  return 1
}

is_infra_path() {
  case "$1" in
    infra/*|.github/*) return 0 ;;
  esac
  return 1
}

is_docs_only() {
  case "$1" in
    docs/*|*.md|references/*|*.png|*.jpg|*.jpeg|*.gif|*.svg|*.webp) return 0 ;;
  esac
  return 1
}

if [[ "${GITHUB_EVENT_NAME:-}" == "workflow_dispatch" ]]; then
  scope="${DEPLOY_SCOPE_INPUT:-auto}"
  case "$scope" in
    frontend) deploy_frontend="true" ;;
    api)      deploy_api="true" ;;
    both)     deploy_frontend="true"; deploy_api="true" ;;
    auto)     deploy_frontend="true"; deploy_api="true" ;;
  esac
  mig="${RUN_MIGRATIONS_INPUT:-auto}"
  if [[ "$mig" == "yes" ]]; then
    run_migrations="true"
  fi
else
  for path in $changed; do
    [[ -z "$path" ]] && continue
    if is_infra_path "$path"; then
      infra_changed="true"
      continue
    fi
    if is_docs_only "$path"; then
      continue
    fi
    if is_frontend_path "$path"; then
      deploy_frontend="true"
    fi
    if is_api_path "$path"; then
      deploy_api="true"
    fi
    if is_shared_or_root_build "$path"; then
      deploy_frontend="true"
      deploy_api="true"
    fi
  done
fi

# Migration decision (only relevant when the API is being deployed).
mig="${RUN_MIGRATIONS_INPUT:-auto}"
if [[ "$deploy_api" == "true" ]]; then
  migration_files_changed="false"
  if [[ "${GITHUB_EVENT_NAME:-}" == "push" ]]; then
    migration_files_changed="$(printf '%s\n' "$changed" | grep -c '^apps/api/prisma/migrations/' || true)"
    schema_changed="$(printf '%s\n' "$changed" | grep -c '^apps/api/prisma/schema.prisma$' || true)"
  else
    migration_files_changed="true" # workflow_dispatch cannot diff; decide by input
  fi

  if [[ "$mig" == "yes" ]]; then
    run_migrations="true"
  elif [[ "$mig" == "auto" ]]; then
    if [[ "${GITHUB_EVENT_NAME:-}" == "push" && "$migration_files_changed" != "0" ]]; then
      run_migrations="true"
    fi
  fi

  # Schema changed but no migration committed -> block API deployment.
  if [[ "${GITHUB_EVENT_NAME:-}" == "push" && "$schema_changed" != "0" && "$migration_files_changed" == "0" ]]; then
    schema_without_migration="true"
  fi
fi

echo "deploy_frontend=$deploy_frontend"
echo "deploy_api=$deploy_api"
echo "run_migrations=$run_migrations"
echo "schema_without_migration=$schema_without_migration"
echo "infra_changed=$infra_changed"
