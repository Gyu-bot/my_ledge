# Triage F3 Ruff Format Failure: settlement-group-canonical-netting

Overall verdict: FAIL

The repository-wide `ruff format --check .` failure is not only inherited drift. The changed backend Python file subset also fails `ruff format --check`, with 7 changed files needing formatting.

## Changed Backend Python Files Needing Formatting

- `backend/app/services/analytics_service.py`
- `backend/app/services/settlement_group_matching.py`
- `backend/tests/api/test_analytics_api.py`
- `backend/tests/api/test_transactions_api.py`
- `backend/tests/services/test_analytics_service.py`
- `backend/tests/services/test_settlement_group_service.py`
- `backend/tests/services/test_settlement_group_service_regression.py`

## Changed Backend Python Files Already Format-Clean

- `backend/app/models/__init__.py`
- `backend/alembic/versions/20260627_0029_add_settlement_matches.py`
- `backend/app/models/settlement_group.py`
- `backend/app/services/settlement_group_service.py`

## manualQa

### surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
|---|---|---|---|---|---|
| F3-FMT-CHANGED-001 | Changed backend Python files must be format-clean to classify the broad F3 formatter failure as out-of-scope | Backend changed-file ruff format check | `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff format --check app/models/__init__.py app/services/analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py tests/services/test_analytics_service.py alembic/versions/20260627_0029_add_settlement_matches.py app/models/settlement_group.py app/services/settlement_group_matching.py app/services/settlement_group_service.py tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py` | FAIL: 7 changed files would be reformatted, 4 changed files already formatted | ART-001 |
| F3-FMT-REPO-001 | Compare against repository-wide result enough to classify inherited drift versus changed-file failures | Repository-wide backend ruff format check | `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff format --check .` | FAIL: 53 files would be reformatted, including the 7 changed files listed above | ART-002 |
| F3-DIFF-001 | Requested whitespace/conflict-marker gate | Git diff whitespace check | `git diff --check` | PASS: no whitespace errors or conflict markers reported | ART-003 |

### adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
|---|---|---|---|---|---|
| F3-ADV-001 | Detect whether broad formatter failure is purely pre-existing drift | Repository-wide drift could mask changed-file formatter regressions | Run ruff format on only changed backend Python files and fail if any changed file would be reformatted | FAIL: changed-file-only check reports 7 changed files would be reformatted | ART-001 |
| F3-ADV-002 | Detect whether broad formatter failure includes unrelated inherited drift | Repository-wide formatter output should still be captured for comparison | Repository-wide run may fail, but classification must distinguish unrelated files from changed files | PASS: repository-wide run reports 53 files, proving broad drift exists but does not exonerate changed files | ART-002 |
| F3-ADV-003 | Detect unrelated whitespace failures not covered by ruff format | Trailing whitespace or conflict markers could create an independent failure mode | `git diff --check` should pass for no whitespace/conflict-marker issues | PASS: command exited 0 with no findings | ART-003 |

### artifactRefs

| id | kind | description | path |
|---|---|---|---|
| ART-001 | terminal transcript | Changed backend Python files ruff format check transcript, non-empty 471 bytes | `.omo/evidence/settlement-group-canonical-netting-f3-format-triage/changed-files-ruff-format-check.typescript` |
| ART-002 | terminal transcript | Repository-wide backend ruff format check transcript, non-empty 3014 bytes | `.omo/evidence/settlement-group-canonical-netting-f3-format-triage/repository-wide-ruff-format-check.typescript` |
| ART-003 | terminal transcript | `git diff --check` transcript, non-empty 4 bytes | `.omo/evidence/settlement-group-canonical-netting-f3-format-triage/git-diff-check.typescript` |
