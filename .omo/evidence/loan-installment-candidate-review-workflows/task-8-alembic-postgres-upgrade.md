# Task 8 F1 Alembic Postgres Upgrade Proof

Date: 2026-06-27
Scope: F1 blocker resolution for `.omo/plans/loan-installment-candidate-review-workflows.md`.
Surface: isolated disposable PostgreSQL migration environment.

## Safety inspection

Before Docker/service work:

```text
Invocation: docker ps --format '{{.Names}} {{.Ports}}'
Exit: 0
Result:
kinlayer-web 0.0.0.0:5173->5173/tcp, [::]:5173->5173/tcp
kinlayer-api 0.0.0.0:8765->8765/tcp, [::]:8765->8765/tcp
kinlayer-postgres 127.0.0.1:15432->5432/tcp
honcho-api-1 127.0.0.1:8000->8000/tcp
honcho-deriver-1 8000/tcp
honcho-redis-1 127.0.0.1:6379->6379/tcp
honcho-database-1 127.0.0.1:5432->5432/tcp
```

```text
Invocation: lsof -nP -iTCP -sTCP:LISTEN | rg ':(8000|5432|6379|4174|8018|15433)\b'
Exit: 0
Result:
com.docke ... TCP 127.0.0.1:8000 (LISTEN)
com.docke ... TCP 127.0.0.1:6379 (LISTEN)
com.docke ... TCP 127.0.0.1:5432 (LISTEN)
```

Sandbox note: the first non-escalated Docker socket read failed with `permission denied while trying to connect to the docker API at unix:///Users/gyurin/.docker/run/docker.sock`; Docker inspections and container lifecycle commands were rerun with escalation. Honcho services were not stopped, restarted, or used for migration testing.

Local image check:

```text
Invocation: docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}'
Exit: 0
Relevant result:
postgres:16-alpine 16bc17c64a57
```

## Isolated Postgres

```text
Invocation:
docker run --rm -d --name my-ledge-f1-alembic-pg -e POSTGRES_PASSWORD=<redacted> -e POSTGRES_USER=codex -e POSTGRES_DB=my_ledge_test -p 127.0.0.1:15433:5432 postgres:16-alpine

Exit: 0
Result:
e9308153512d2d002a35b8f7ff32098d39a0870a38881f7263eabb95ab66695e
```

```text
Invocation: docker exec my-ledge-f1-alembic-pg pg_isready -U codex -d my_ledge_test
Exit: 0
Result:
/var/run/postgresql:5432 - accepting connections
```

```text
Invocation: docker ps --format '{{.Names}} {{.Ports}}'
Exit: 0
Result:
my-ledge-f1-alembic-pg 127.0.0.1:15433->5432/tcp
kinlayer-web 0.0.0.0:5173->5173/tcp, [::]:5173->5173/tcp
kinlayer-api 0.0.0.0:8765->8765/tcp, [::]:8765->8765/tcp
kinlayer-postgres 127.0.0.1:15432->5432/tcp
honcho-api-1 127.0.0.1:8000->8000/tcp
honcho-deriver-1 8000/tcp
honcho-redis-1 127.0.0.1:6379->6379/tcp
honcho-database-1 127.0.0.1:5432->5432/tcp
```

```text
Invocation: lsof -nP -iTCP -sTCP:LISTEN | rg ':(8000|5432|6379|4174|8018|15433)\b'
Exit: 0
Result:
com.docke ... TCP 127.0.0.1:8000 (LISTEN)
com.docke ... TCP 127.0.0.1:6379 (LISTEN)
com.docke ... TCP 127.0.0.1:5432 (LISTEN)
com.docke ... TCP 127.0.0.1:15433 (LISTEN)
```

## Alembic proof

Surface: backend Alembic CLI against disposable PostgreSQL at `127.0.0.1:15433`.

```text
Invocation:
cd backend && DATABASE_URL=postgresql+asyncpg://codex:<redacted>@127.0.0.1:15433/my_ledge_test API_KEY=test-api-key UV_CACHE_DIR=.uv-cache uv run alembic upgrade head

Exit: 0
Result:
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
INFO  [alembic.runtime.migration] Running upgrade  -> 20260323_0001, initial schema
INFO  [alembic.runtime.migration] Running upgrade 20260323_0001 -> 20260326_0002, add canonical views
INFO  [alembic.runtime.migration] Running upgrade 20260326_0002 -> 20260326_0003, add cost classification fields to transactions
INFO  [alembic.runtime.migration] Running upgrade 20260326_0003 -> 20260330_0004, filter deleted and merged rows from canonical transactions view
INFO  [alembic.runtime.migration] Running upgrade 20260330_0004 -> 20260402_0005, add merchant column to transactions
INFO  [alembic.runtime.migration] Running upgrade 20260402_0005 -> 20260515_0006, add app settings table
INFO  [alembic.runtime.migration] Running upgrade 20260515_0006 -> 20260524_0007, add loan transaction mapping
INFO  [alembic.runtime.migration] Running upgrade 20260524_0007 -> 20260524_0008, add loan mapping fields to canonical transaction view
INFO  [alembic.runtime.migration] Running upgrade 20260524_0008 -> 20260524_0009, add recurring payment classification
INFO  [alembic.runtime.migration] Running upgrade 20260524_0009 -> 20260525_0010, add auto classification rules
INFO  [alembic.runtime.migration] Running upgrade 20260525_0010 -> 20260525_0011, add fixed cost monthly summary view
INFO  [alembic.runtime.migration] Running upgrade 20260525_0011 -> 20260526_0012, add loan account display name
INFO  [alembic.runtime.migration] Running upgrade 20260526_0012 -> 20260526_0013, add loan account kind
INFO  [alembic.runtime.migration] Running upgrade 20260526_0013 -> 20260526_0014, add loan dates to canonical view
INFO  [alembic.runtime.migration] Running upgrade 20260526_0014 -> 20260528_0015, add advisor canonical read model views
INFO  [alembic.runtime.migration] Running upgrade 20260528_0015 -> 20260528_0016, normalize unclassified queue booleans
INFO  [alembic.runtime.migration] Running upgrade 20260528_0016 -> 20260528_0017, tighten unclassified queue recurring signal
INFO  [alembic.runtime.migration] Running upgrade 20260528_0017 -> 20260528_0018, add recurring category rules
INFO  [alembic.runtime.migration] Running upgrade 20260528_0018 -> 20260530_0019, add p1 advisor canonical surfaces
INFO  [alembic.runtime.migration] Running upgrade 20260530_0019 -> 20260530_0020, add loan merchant rule match field
INFO  [alembic.runtime.migration] Running upgrade 20260530_0020 -> 20260530_0021, add purchase gate review state
INFO  [alembic.runtime.migration] Running upgrade 20260530_0021 -> 20260530_0022, add asset snapshot canonical view
INFO  [alembic.runtime.migration] Running upgrade 20260530_0022 -> 20260530_0023, add installment management
INFO  [alembic.runtime.migration] Running upgrade 20260530_0023 -> 20260531_0024, add loan repayment metadata sources
INFO  [alembic.runtime.migration] Running upgrade 20260531_0024 -> 20260611_0025, add advisor canonical profile and loan income surfaces
INFO  [alembic.runtime.migration] Running upgrade 20260611_0025 -> 20260624_0026, add loan account hidden flag
INFO  [alembic.runtime.migration] Running upgrade 20260624_0026 -> 20260626_0027, add transaction source lifecycle
INFO  [alembic.runtime.migration] Running upgrade 20260626_0027 -> 20260626_0028
INFO  [alembic.runtime.migration] Running upgrade 20260626_0028 -> 20260627_0029
INFO  [alembic.runtime.migration] Running upgrade 20260627_0029 -> 20260627_0030
```

Verdict: PASS. `alembic upgrade head` succeeded against isolated PostgreSQL on `127.0.0.1:15433`; honcho operational DB on `127.0.0.1:5432` was not used.

## Cleanup

```text
Invocation: docker stop my-ledge-f1-alembic-pg
Exit: 0
Result:
my-ledge-f1-alembic-pg
```

```text
Invocation: docker ps --format '{{.Names}} {{.Ports}}'
Exit: 0
Result:
kinlayer-web 0.0.0.0:5173->5173/tcp, [::]:5173->5173/tcp
kinlayer-api 0.0.0.0:8765->8765/tcp, [::]:8765->8765/tcp
kinlayer-postgres 127.0.0.1:15432->5432/tcp
honcho-api-1 127.0.0.1:8000->8000/tcp
honcho-deriver-1 8000/tcp
honcho-redis-1 127.0.0.1:6379->6379/tcp
honcho-database-1 127.0.0.1:5432->5432/tcp
```

```text
Invocation: lsof -nP -iTCP -sTCP:LISTEN | rg ':(8000|5432|6379|4174|8018|15433)\b'
Exit: 0
Result:
com.docke ... TCP 127.0.0.1:8000 (LISTEN)
com.docke ... TCP 127.0.0.1:6379 (LISTEN)
com.docke ... TCP 127.0.0.1:5432 (LISTEN)
```

Cleanup verdict: PASS. No `4174`, `8018`, or `15433` listener remained; honcho `8000`, `5432`, and `6379` stayed present.
