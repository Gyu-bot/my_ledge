# Task 8 F1 Fixes Evidence

Date: 2026-06-27
Branch: `codex/loan-installment-candidate-review-workflows`
Scope: F1 plan-compliance blocker fixes only. No product code was edited.

## Blocker resolution summary

- F1 blocker 1, inbox browser evidence insufficient: RESOLVED with a new in-app browser screenshot where the visible `대출 후보 아님` button appears in the loan candidate row, plus a DOM/accessibility artifact proving exact role/button text.
- F1 blocker 2, `alembic upgrade head` unconfirmed: RESOLVED with isolated disposable PostgreSQL on `127.0.0.1:15433`; `alembic upgrade head` exited 0. Honcho DB `127.0.0.1:5432` was not used.

## Surface evidence

### Browser evidence: visible inbox action

Surface: Codex in-app browser against isolated fixture stack.

Exact invocation:

```text
Backend:
cd backend && DATABASE_URL=sqlite+aiosqlite:////Users/gyurin/dev/my_ledge/.omo/evidence/loan-installment-candidate-review-workflows/task-8-browser-qa.db API_KEY=test-api-key CORS_ORIGINS=http://127.0.0.1:4174 UV_CACHE_DIR=.uv-cache uv run uvicorn app.main:app --host 127.0.0.1 --port 8018

Frontend:
cd frontend && VITE_PROXY_TARGET=http://127.0.0.1:8018 API_KEY=test-api-key npm run dev -- --host 127.0.0.1 --port 4174

Browser:
Codex in-app browser goto('http://127.0.0.1:4174/data/inbox')
wait for getByRole('button', { name: '대출 후보 아님', exact: true }) visible
capture screenshot to .omo/evidence/loan-installment-candidate-review-workflows/task-8-inbox-button-visible.png
write DOM/accessibility proof to .omo/evidence/loan-installment-candidate-review-workflows/task-8-inbox-button-visible-dom.txt
```

Supporting API probe:

```text
Invocation:
curl -i 'http://127.0.0.1:8018/api/v1/loan-transaction-links?linked=unlinked&page=1&per_page=20'

Exit: 0
Result:
HTTP/1.1 200 OK
{"total":1,"page":1,"per_page":20,"items":[{"transaction_id":1,"date":"2026-06-20","time":"09:00:00","type":"지출","effective_category_major":"금융","effective_category_minor":"대출상환","description":"국민은행 대출이자 QA","merchant":"국민은행 대출이자 QA","amount":-350000,"currency":"KRW","payment_method":"국민은행 계좌","memo":null,"link":null}]}
```

Browser artifact proof:

```text
Artifact: task-8-inbox-button-visible.png
Description: visible in-app browser screenshot of `/data/inbox` with candidate row `국민은행 대출이자 QA` and visible button text `대출 후보 아님`.
Size: 36K

Artifact: task-8-inbox-button-visible-dom.txt
Description: DOM/accessibility proof from the same browser page: exact button count 1 for role button name `대출 후보 아님`; snapshot contains `대출 후보 아님` and `국민은행 대출이자 QA`.
Size: 928B
```

Verdict: PASS. This directly resolves the prior screenshot gap; the action text is visible in the screenshot and independently proven through the browser DOM/accessibility artifact.

### Alembic evidence: isolated PostgreSQL upgrade-head

Surface: backend Alembic CLI against disposable PostgreSQL on `127.0.0.1:15433`.

Exact invocation:

```text
docker run --rm -d --name my-ledge-f1-alembic-pg -e POSTGRES_PASSWORD=<redacted> -e POSTGRES_USER=codex -e POSTGRES_DB=my_ledge_test -p 127.0.0.1:15433:5432 postgres:16-alpine
docker exec my-ledge-f1-alembic-pg pg_isready -U codex -d my_ledge_test
cd backend && DATABASE_URL=postgresql+asyncpg://codex:<redacted>@127.0.0.1:15433/my_ledge_test API_KEY=test-api-key UV_CACHE_DIR=.uv-cache uv run alembic upgrade head
docker stop my-ledge-f1-alembic-pg
```

Result:

```text
pg_isready exit: 0
alembic exit: 0
alembic result:
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
...
INFO  [alembic.runtime.migration] Running upgrade 20260627_0029 -> 20260627_0030
```

Full transcript: `.omo/evidence/loan-installment-candidate-review-workflows/task-8-alembic-postgres-upgrade.md`.

Verdict: PASS. Migration proof is PostgreSQL-backed and isolated from honcho operational DB.

## manualQa

### surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
| --- | --- | --- | --- | --- | --- |
| F1-S1 | Blocker 1: visible `대출 후보 아님` action | Codex in-app browser UI `/data/inbox` | `goto('http://127.0.0.1:4174/data/inbox')`; wait for role `button` name `대출 후보 아님`; screenshot | PASS | F1-A1, F1-A2 |
| F1-S2 | Blocker 1: fixture contains expected candidate | HTTP API | `curl -i 'http://127.0.0.1:8018/api/v1/loan-transaction-links?linked=unlinked&page=1&per_page=20'` | PASS | F1-A3 |
| F1-S3 | Blocker 2: isolated Postgres migration | CLI + Docker | `cd backend && DATABASE_URL=postgresql+asyncpg://codex:<redacted>@127.0.0.1:15433/my_ledge_test API_KEY=test-api-key UV_CACHE_DIR=.uv-cache uv run alembic upgrade head` | PASS | F1-A4 |
| F1-S4 | Cleanup and honcho preservation | Docker + lsof | `docker ps --format '{{.Names}} {{.Ports}}'`; `lsof -nP -iTCP -sTCP:LISTEN | rg ':(8000|5432|6379|4174|8018|15433)\b'` | PASS | F1-A4 |

### adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
| --- | --- | --- | --- | --- | --- |
| F1-ACT1 | Safety requirements | stale_state | Re-check branch/worktree, Docker, and listener state before browser/container work. | PASS | F1-A4 |
| F1-ACT2 | Shared worktree safety | dirty_worktree | Do not edit product code or revert pre-existing dirty/untracked files; write only F1 evidence under the allowed directory. | PASS | F1-A4 |
| F1-ACT3 | Alembic requirement | misleading_success_output | Treat only command exit 0 plus Alembic migration log as success; redact DB password in evidence. | PASS | F1-A4 |
| F1-ACT4 | Command reliability | long_commands | Let server startup, `pg_isready`, Alembic, and cleanup commands complete; no required session left running. | PASS | F1-A4 |
| F1-ACT5 | Cleanup requirement | cleanup | Stop Vite 4174, FastAPI 8018, and disposable Postgres 15433; confirm only honcho protected ports remain. | PASS | F1-A4 |
| F1-ACT6 | Browser evidence requirement | browser-evidence completeness | Evidence must show or prove the exact visible action text `대출 후보 아님`, not merely infer it from tests. | PASS | F1-A1, F1-A2 |
| F1-ACT7 | Migration isolation | migration-environment isolation | Use disposable Postgres on non-honcho port, not operational `127.0.0.1:5432`. | PASS | F1-A4 |

### artifactRefs

| id | kind | description | path |
| --- | --- | --- | --- |
| F1-A1 | screenshot | In-app browser screenshot of `/data/inbox` where candidate row and `대출 후보 아님` button are visible | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-inbox-button-visible.png` |
| F1-A2 | browser DOM/accessibility text | Exact proof from the same browser page: role/button count for `대출 후보 아님`, candidate merchant text, and snapshot excerpt | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-inbox-button-visible-dom.txt` |
| F1-A3 | HTTP transcript | `curl -i` proof that isolated fixture API returned the candidate row used by the browser page | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-f1-fixes.md` |
| F1-A4 | migration transcript | Isolated Postgres startup, Alembic `upgrade head` exit 0, and cleanup proof | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-alembic-postgres-upgrade.md` |
| F1-A5 | screenshot copy | Raw scrolled browser capture retained as capture provenance; same visible evidence as F1-A1 | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-inbox-button-visible-scrolled.png` |

## Cleanup receipt

Stopped/closed:

- Codex in-app browser QA tab: closed.
- Temporary viewport override: reset.
- Vite dev server on `127.0.0.1:4174`: stopped with `Ctrl-C`; session exited.
- FastAPI QA server on `127.0.0.1:8018`: stopped with `Ctrl-C`; session exited.
- Disposable Postgres container `my-ledge-f1-alembic-pg`: stopped; container was started with `--rm`.

Final cleanup checks:

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

Cleanup verdict: PASS. No `4174`, `8018`, or `15433` listener remains. Honcho `8000`, `5432`, and `6379` stayed present.

Urgent cleanup recheck after user reported seeing lingering listeners:

```text
Invocation: lsof -nP -iTCP -sTCP:LISTEN | rg ':(8000|5432|6379|4174|8018|15433)\b'
Exit: 0
Result:
com.docke  1628 gyurin  154u  IPv4 0x6ebf2adfeb32dd82      0t0  TCP 127.0.0.1:8000 (LISTEN)
com.docke  1628 gyurin  158u  IPv4 0x3d5e9f89fb12a07a      0t0  TCP 127.0.0.1:6379 (LISTEN)
com.docke  1628 gyurin  159u  IPv4  0x80135fa6eb69512      0t0  TCP 127.0.0.1:5432 (LISTEN)
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

Recheck verdict: PASS. `4174`, `8018`, and `15433` are absent; protected honcho ports remain.

Final verification:

```text
Invocation: git diff --check
Exit: 0
Result: no output
```

## Remaining risks

- The browser fixture still logs a known `GET /api/v1/canonical-views/dashboard` 500 because the minimal SQLite browser fixture does not include canonical SQL views. This is not part of the F1 blocker and did not prevent the loan candidate row/action from rendering.
- The shared worktree remains dirty from pre-existing product/docs/test changes outside this F1 evidence pass. This pass intentionally did not edit or revert product code.
