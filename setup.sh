#!/usr/bin/env bash
# Sorabase's interactive Docker installer. Run from any working directory.
set +x
set -Eeuo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ENV_FILE="$ROOT/.env"
LOCK="$ROOT/.sorabase-setup.lock"
TEMP_ENV=''
TEMP_CLONE=''
LOCKED=false
STAGE='setup'
export LC_ALL=C

cleanup() {
  if [[ -n "$TEMP_ENV" ]]; then rm -f -- "$TEMP_ENV"; fi
  if [[ -n "$TEMP_CLONE" ]]; then rm -rf -- "$TEMP_CLONE"; fi
  if [[ "$LOCKED" == true ]]; then rmdir -- "$LOCK" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'printf "\nSetup interrupted. Existing configuration/data have not been automatically removed.\n" >&2; exit 130' INT TERM
trap 'printf "\nFailed during %s. Check the error above; no automatic data cleanup was performed.\n" "$STAGE" >&2' ERR

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

has_project() {
  [[ -f "$1/docker-compose.yml" && -f "$1/.env.example" && -d "$1/Backend" ]]
}

locate_project() {
  [[ "$(uname -s)" == Linux ]] || fail 'Use a Linux Docker host.'
  if has_project "$ROOT"; then return; fi
  local destination="$ROOT/Sorabase"
  if [[ -L "$destination" ]]; then
    fail 'Refusing to use a symbolic-link Sorabase directory.'
  elif has_project "$destination"; then
    printf '\nUsing existing repository: %s\n' "$destination"
  elif [[ -e "$destination" ]]; then
    fail 'Sorabase directory already exists but is not a complete repository. Nothing was overwritten; move it aside or restore its files.'
  elif [[ "$selection" == 2 ]]; then
    fail 'No existing Sorabase installation found beside setup.sh. Run the script from the original installation directory to uninstall.'
  else
    STAGE='GitHub repository download'
    command -v git >/dev/null 2>&1 || fail 'Install Git first, then run setup.sh again.'
    printf '\nDownloading Sorabase from GitHub to %s\n' "$destination"
    TEMP_CLONE="$(mktemp -d "$ROOT/.sorabase-download.XXXXXX")"
    if ! git clone --depth 1 --branch main -- \
      https://github.com/rehan3web/Astarbase.git "$TEMP_CLONE/repository"; then
      fail 'GitHub download failed. Check your network and repository access, then retry.'
    fi
    has_project "$TEMP_CLONE/repository" ||
      fail 'Downloaded repository is missing docker-compose.yml, .env.example or Backend. Installation has not started.'
    # Never merge into or replace a directory created by another installer.
    mv -T -n -- "$TEMP_CLONE/repository" "$destination"
    [[ ! -e "$TEMP_CLONE/repository" ]] ||
      fail 'Sorabase directory appeared during download. Nothing was overwritten; retry.'
    rm -rf -- "$TEMP_CLONE"
    TEMP_CLONE=''
  fi
  ROOT="$(cd -- "$destination" && pwd -P)"
  ENV_FILE="$ROOT/.env"
  LOCK="$ROOT/.sorabase-setup.lock"
  printf 'Installation directory: %s\n' "$ROOT"
}

check_project() {
  [[ "$(uname -s)" == Linux ]] || fail 'Use a Linux Docker host.'
  [[ -f "$ROOT/docker-compose.yml" && -f "$ROOT/.env.example" ]] ||
    fail 'Keep setup.sh in the Sorabase repository root beside docker-compose.yml and .env.example.'
  [[ -d "$ROOT/Backend" && ! -L "$ROOT/Backend" ]] ||
    fail 'Backend must be a real directory inside this repository, not a symbolic link.'
  [[ ! -L "$ENV_FILE" ]] || fail 'Refusing to replace or use a symbolic-link .env.'
  local directory
  for directory in "$ROOT/Backend/data" "$ROOT/Backend/backups"; do
    [[ ! -L "$directory" ]] || fail 'Runtime data/backup directories must not be symbolic links.'
  done
  if ! mkdir -- "$LOCK" 2>/dev/null; then
    fail 'Another setup may be running. If it has stopped, remove .sorabase-setup.lock and retry.'
  fi
  LOCKED=true
}

check_docker() {
  command -v docker >/dev/null 2>&1 || fail 'Install Docker Engine and Docker Compose v2 first.'
  docker --host unix:///var/run/docker.sock compose version >/dev/null 2>&1 ||
    fail 'Docker Compose v2 is required (docker compose version).'
  docker --host unix:///var/run/docker.sock info >/dev/null 2>&1 ||
    fail 'The local Docker daemon is unavailable or permission is denied. Start Docker or run this script with sudo.'
}

# Do not source .env as executable shell code. Compose is the only parser.
# Explicitly use the local daemon and this repository, never a remote context.
compose() (
  local line key
  # Shell exports must not override the configuration just entered by the user.
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)= ]]; then
      key="${BASH_REMATCH[1]}"
      unset "$key"
    fi
  done < "$ENV_FILE"
  unset COMPOSE_FILE COMPOSE_PROFILES COMPOSE_ENV_FILES COMPOSE_DISABLE_ENV_FILE
  docker --host unix:///var/run/docker.sock compose \
    --project-directory "$ROOT" --env-file "$ENV_FILE" \
    -f "$ROOT/docker-compose.yml" "$@"
)

prompt_value() {
  local target="$1" label="$2" default="${3:-}" secret="${4:-false}" value
  while true; do
    if [[ -n "$default" ]]; then
      printf '%s [%s]: ' "$label" "$default" >&2
    else
      printf '%s: ' "$label" >&2
    fi
    if [[ "$secret" == true ]]; then
      if ! IFS= read -r -s value; then printf '\n' >&2; exit 1; fi
      printf '\n' >&2
    else
      IFS= read -r value || exit 1
    fi
    value="${value:-$default}"
    if [[ "$value" =~ [[:cntrl:]] ]]; then
      printf 'Control characters are not allowed. Try again.\n' >&2
      continue
    fi
    case "$target" in
      DB_NAME|DB_USER)
        [[ "$value" =~ ^[a-z][a-z0-9_]{0,62}$ ]] ||
          { printf 'Use 1-63 lowercase letters/numbers/underscores, starting with a letter.\n' >&2; continue; }
        ;;
      DB_PASSWORD)
        [[ ${#value} -ge 16 ]] ||
          { printf 'Database password must be at least 16 characters.\n' >&2; continue; }
        ;;
      ADMIN_USERNAME)
        [[ "$value" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,47}$ ]] ||
          { printf 'Use 3-48 letters/numbers/._-, starting with a letter or number.\n' >&2; continue; }
        ;;
      ADMIN_EMAIL)
        [[ ${#value} -le 254 && "$value" =~ ^[a-zA-Z0-9_%+.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] ||
          { printf 'Enter a valid admin email address.\n' >&2; continue; }
        ;;
      ADMIN_PASSWORD)
        [[ ${#value} -ge 12 && ${#value} -le 256 ]] ||
          { printf 'Admin password must be 12-256 characters.\n' >&2; continue; }
        ;;
    esac
    printf -v "$target" '%s' "$value"
    return
  done
}

# Compose double-quoted dotenv: escape backslashes/quotes and protect literal
# dollars from interpolation. Values are never evaluated as shell commands.
write_setting() {
  local key="$1" value="$2"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\$\$}"
  printf '%s="%s"\n' "$key" "$value"
}

create_environment() {
  command -v openssl >/dev/null 2>&1 || fail 'Install OpenSSL to securely generate private server secrets.'
  local DB_NAME DB_USER DB_PASSWORD ADMIN_USERNAME ADMIN_EMAIL ADMIN_PASSWORD
  prompt_value DB_NAME 'DB Name' 'sorabase'
  prompt_value DB_USER 'DB User' 'sorabase_admin'
  prompt_value DB_PASSWORD 'DB Password' '' true
  prompt_value ADMIN_USERNAME 'Admin Username' 'admin'
  prompt_value ADMIN_EMAIL 'Admin Email'
  prompt_value ADMIN_PASSWORD 'Admin Password' '' true

  local api_secret session_secret line key
  api_secret="$(openssl rand -hex 32)"
  session_secret="$(openssl rand -hex 32)"
  [[ "$api_secret" =~ ^[a-f0-9]{64}$ && "$session_secret" =~ ^[a-f0-9]{64}$ && "$api_secret" != "$session_secret" ]] ||
    fail 'Secure secret generation failed.'
  TEMP_ENV="$(mktemp "$ROOT/.env.setup.XXXXXX")"
  # Copy the example's comments and default settings, replacing only these keys.
  while IFS= read -r line || [[ -n "$line" ]]; do
    key="${line%%=*}"
    case "$key" in
      DB_NAME) write_setting "$key" "$DB_NAME" ;;
      DB_USER) write_setting "$key" "$DB_USER" ;;
      DB_PASSWORD) write_setting "$key" "$DB_PASSWORD" ;;
      ADMIN_USERNAME) write_setting "$key" "$ADMIN_USERNAME" ;;
      ADMIN_EMAIL) write_setting "$key" "$ADMIN_EMAIL" ;;
      ADMIN_PASSWORD) write_setting "$key" "$ADMIN_PASSWORD" ;;
      ADMIN_API_TOKEN) write_setting "$key" "$api_secret" ;;
      SESSION_SECRET) write_setting "$key" "$session_secret" ;;
      *) printf '%s\n' "$line" ;;
    esac
  done < "$ROOT/.env.example" > "$TEMP_ENV"
  chmod 600 "$TEMP_ENV"
  # Never overwrite existing credentials, including a file created concurrently.
  ln -- "$TEMP_ENV" "$ENV_FILE" ||
    fail '.env already exists; it has not been overwritten.'
  rm -f -- "$TEMP_ENV"
  TEMP_ENV=''
}

show_address() {
  local address='' port=''
  address="$(hostname -I 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i ~ /^[0-9]+\./ && $i !~ /^127\./) {print $i; exit}}')" || true
  port="$(compose port frontend 5000 2>/dev/null)" || true
  port="${port##*:}"
  [[ "$port" =~ ^[0-9]+$ ]] || port=5000
  printf '\nSorabase Installed\n'
  if [[ -n "$address" ]]; then
    printf 'Studio IP : http://%s:%s\n' "$address" "$port"
    printf 'If this is a private/NAT address, use your server public IP with port %s.\n' "$port"
  else
    printf 'Studio IP : http://YOUR_SERVER_IP:%s\n' "$port"
    printf 'Automatic IP detection was unavailable; replace YOUR_SERVER_IP with your server address.\n'
  fi
  printf 'Use your admin username/email and password to sign in.\n'
  printf 'Before Internet access, configure HTTPS and restrict database ports 5432/6432 with firewall rules.\n'
}

install_sorabase() {
  STAGE='installation prerequisites'
  check_docker
  if [[ -e "$ENV_FILE" ]]; then
    [[ -f "$ENV_FILE" ]] || fail '.env is not a regular file.'
    printf '\nExisting .env found. Reusing it; passwords and secrets will NOT be reset.\n'
  else
    # Existing state cannot safely be paired with newly entered credentials.
    local existing_volumes
    existing_volumes="$(docker --host unix:///var/run/docker.sock volume ls \
      --filter label=com.docker.compose.project=sorabase --format '{{.Name}}')"
    [[ -z "$existing_volumes" ]] ||
      fail 'Existing Sorabase Docker volumes found without .env. Restore the original configuration; volumes have not been changed.'
    local directory
    for directory in "$ROOT/Backend/data" "$ROOT/Backend/backups"; do
      if [[ -d "$directory" ]] && [[ -n "$(find "$directory" -mindepth 1 ! -name .gitkeep -print -quit)" ]]; then
        fail 'Existing runtime data found without .env. Restore the original .env before installing; data has not been modified.'
      fi
    done
    STAGE='environment setup'
    create_environment
  fi
  STAGE='Compose configuration validation'
  compose config --quiet
  STAGE='Docker build and service healthchecks'
  printf '\nBuilding and starting Sorabase. The first build may take several minutes.\n'
  if ! compose up --build -d --wait --wait-timeout 600; then
    printf '\nInstallation did not complete. Configuration and data have been preserved.\n' >&2
    printf 'Inspect services: docker compose ps\nInspect logs: docker compose logs --tail=100 studio frontend postgres pgbouncer\n' >&2
    printf 'Run this script again and select Standard Install to retry with the same .env.\n' >&2
    return 1
  fi
  STAGE='Studio address'
  show_address
}

uninstall_sorabase() {
  printf '\nWARNING: This permanently deletes this Sorabase Compose project:\n'
  printf '  - Containers, service images, network and named volumes\n'
  printf '  - Main database, all branches, settings, saved queries and credentials\n'
  printf '  - Backend/data, Backend/backups and the root .env\n'
  printf 'Other Docker projects and the repository source are not removed.\n'
  printf 'Shared images still used by other containers cannot be removed.\n'
  printf 'Back up anything you need before continuing.\n\nType confirm to uninstall: '
  local confirmation
  IFS= read -r confirmation || exit 1
  if [[ "$confirmation" != confirm ]]; then
    printf 'Uninstall cancelled. Nothing was removed.\n'
    return
  fi
  STAGE='uninstall prerequisites'
  [[ -f "$ENV_FILE" ]] ||
    fail 'Original .env is missing. Restore it first so the correct Compose project can be identified; nothing was removed.'
  check_docker
  STAGE='uninstall configuration validation'
  compose config --quiet
  STAGE='Sorabase containers, images and volumes removal'
  # No global prune commands and no forced removal of other projects' resources.
  compose down --volumes --remove-orphans --rmi all --timeout 60
  STAGE='Sorabase local data removal'
  # Stop on failure; keep .env for an operator to retry with sudo if necessary.
  rm -rf -- "$ROOT/Backend/data" "$ROOT/Backend/backups"
  rm -f -- "$ENV_FILE"
  printf '\nSorabase Uninstalled\nAll project data and configuration have been removed.\n'
}

printf '\nSorabase Setup\n\n1) Standard Install\n2) Uninstall\n3) Exit\n\n'
printf 'Select [1-3]: '
IFS= read -r selection || exit 0
case "$selection" in
  1) locate_project; check_project; install_sorabase ;;
  2) locate_project; check_project; uninstall_sorabase ;;
  3) printf 'Setup closed.\n' ;;
  *) printf 'Invalid selection. Choose 1, 2 or 3.\n' >&2; exit 1 ;;
esac
