#!/bin/sh
set -eu
# Named volumes are initially owned by root. Prepare before the official
# entrypoint drops privileges, on every boot (including existing PG volumes).
mkdir -p /var/lib/astarbase/backups
for archive in /var/lib/astarbase/legacy-backups/*.dump; do
  [ -f "$archive" ] || continue
  target="/var/lib/astarbase/backups/$(basename "$archive")"
  if [ -e "$target" ]; then
    if ! cmp -s "$archive" "$target"; then
      echo "Conflicting backup archive: $(basename "$archive"). Resolve manually; nothing was overwritten." >&2
      exit 1
    fi
  else
    cp -p "$archive" "$target"
  fi
done
chown postgres:postgres /var/lib/astarbase/backups
chmod 700 /var/lib/astarbase/backups
exec /usr/local/bin/docker-entrypoint.sh "$@"
