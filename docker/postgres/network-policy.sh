#!/bin/sh
# Generate a guard in front of the original HBA file, never rewrite that file.
set -eu
admin=${1:?Internal admin role is required}
pgdata=${2:?PGDATA is required}
case "$admin" in
  *[!a-z0-9_]*) echo "Invalid internal admin role" >&2; exit 1 ;;
esac
if ! printf '%s\n' "$admin" | grep -Eq '^[a-z][a-z0-9_]{0,62}$'; then
  echo "Invalid internal admin role" >&2
  exit 1
fi
case "$pgdata" in
  /*) ;;
  *) echo "PGDATA must be an absolute path" >&2; exit 1 ;;
esac
case "$pgdata" in
  *[!a-zA-Z0-9_./-]*) echo "Unsupported characters in PGDATA" >&2; exit 1 ;;
esac
cat <<EOF
# Sorabase internal admin is Unix-only. Keep these rules before the include.
local all "$admin" scram-sha-256
host all "$admin" 0.0.0.0/0 reject
host all "$admin" ::/0 reject
host replication "$admin" 0.0.0.0/0 reject
host replication "$admin" ::/0 reject
include "$pgdata/pg_hba.conf"
EOF
