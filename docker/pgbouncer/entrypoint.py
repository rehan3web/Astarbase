import os
import re

user = os.environ["DB_USER"]
password = os.environ["DB_PASSWORD"]
if not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", user):
    raise SystemExit("Invalid DB_USER")
if len(password) < 16 or any(ord(c) < 32 or ord(c) == 127 for c in password):
    raise SystemExit("DB_PASSWORD must have at least 16 characters and no control characters")

# PgBouncer userlist quotes are escaped by doubling, never shell interpolation.
os.umask(0o077)
with open("/etc/pgbouncer/users.txt", "w") as f:
    f.write('"' + user + '" "' + password.replace('"', '""') + '"\n')
with open("/etc/pgbouncer/pgbouncer.ini", "w") as f:
    f.write("""[databases]
* = host=/var/run/postgresql port=5432

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
unix_socket_dir = /tmp
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/users.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
reserve_pool_size = 5
server_reset_query = DISCARD ALL
server_reset_query_always = 1
server_idle_timeout = 60
server_login_retry = 1
log_connections = 0
log_disconnections = 0
""")
os.execvp("pgbouncer", ["pgbouncer", "/etc/pgbouncer/pgbouncer.ini"])
