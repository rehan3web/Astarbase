#!/bin/sh
set -eu
# Named volumes are initially owned by root. Prepare before the official
# entrypoint drops privileges, on every boot (including existing PG volumes).
mkdir -p /var/lib/sorabase/backups
for archive in /var/lib/sorabase/legacy-backups/*.dump; do
  [ -f "$archive" ] || continue
  target="/var/lib/sorabase/backups/$(basename "$archive")"
  if [ -e "$target" ]; then
    if ! cmp -s "$archive" "$target"; then
      echo "Conflicting backup archive: $(basename "$archive"). Resolve manually; nothing was overwritten." >&2
      exit 1
    fi
  else
    cp -p "$archive" "$target"
  fi
done
chown postgres:postgres /var/lib/sorabase/backups
chmod 700 /var/lib/sorabase/backups
case "${1:-}" in
  postgres|-*)
    # Applies on first initialization AND upgrades of an existing volume.
    # The official entrypoint creates PGDATA/pg_hba.conf before its temp server
    # starts. Including it preserves client rules and relative HBA includes.
    policy=/var/lib/sorabase/pg_hba.conf
    sh /usr/local/bin/sorabase-network-policy.sh "$POSTGRES_USER" \
      "${PGDATA:-/var/lib/postgresql/data}" > "$policy.tmp"
    chown postgres:postgres "$policy.tmp"
    chmod 600 "$policy.tmp"
    mv -f "$policy.tmp" "$policy"
    set -- "$@" -c "hba_file=$policy"
    ;;
esac
exec /usr/local/bin/docker-entrypoint.sh "$@"
