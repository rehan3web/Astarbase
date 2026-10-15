FROM node:24-alpine
# Alpine ships a root-owned pgbouncer.ini; the non-root entrypoint rewrites it.
RUN apk add --no-cache pgbouncer postgresql17-client \
    && addgroup -S studio-pool && adduser -S -D -H -G studio-pool studio-pool \
    && mkdir -p /etc/pgbouncer \
    && chown -R studio-pool:studio-pool /etc/pgbouncer
COPY entrypoint.mts /entrypoint.mts
RUN node --check /entrypoint.mts
USER studio-pool
EXPOSE 6432
ENTRYPOINT ["node", "/entrypoint.mts"]
