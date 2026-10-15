FROM alpine:3.22
# Alpine ships a root-owned pgbouncer.ini; the non-root entrypoint rewrites it.
RUN apk add --no-cache pgbouncer python3 postgresql17-client \
    && addgroup -S studio-pool && adduser -S -D -H -G studio-pool studio-pool \
    && mkdir -p /etc/pgbouncer \
    && chown -R studio-pool:studio-pool /etc/pgbouncer
COPY entrypoint.py /entrypoint.py
USER studio-pool
EXPOSE 6432
ENTRYPOINT ["python3", "/entrypoint.py"]
