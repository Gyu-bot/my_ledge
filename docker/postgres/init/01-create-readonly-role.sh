#!/bin/sh
set -eu

readonly_password="${DB_READONLY_PASSWORD:-}"

if [ -z "$readonly_password" ]; then
  echo "DB_READONLY_PASSWORD is empty; skipping readonly role bootstrap."
  exit 0
fi

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=readonly_password="$readonly_password" \
  --set=database_name="$POSTGRES_DB" \
  --set=owner_role="$POSTGRES_USER" <<'SQL'
SELECT format(
    'CREATE ROLE readonly LOGIN PASSWORD %L',
    :'readonly_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'readonly')
\gexec

SELECT format(
    'ALTER ROLE readonly WITH LOGIN PASSWORD %L',
    :'readonly_password'
)
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'readonly')
\gexec

GRANT CONNECT ON DATABASE :"database_name" TO readonly;
GRANT USAGE ON SCHEMA public TO readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
    GRANT SELECT ON TABLES TO readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
    GRANT SELECT ON SEQUENCES TO readonly;
ALTER ROLE readonly SET statement_timeout = '30s';
SQL
