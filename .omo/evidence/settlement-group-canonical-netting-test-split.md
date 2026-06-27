# settlement-group-canonical-netting-test-split

## Split scope
- `backend/tests/api/test_settlement_match_api.py`
- `backend/tests/api/test_settlement_match_api_errors.py`
- `backend/tests/api/test_settlement_match_api_unlink.py`
- `backend/tests/services/test_settlement_group_service.py`
- `backend/tests/services/test_settlement_group_service_regression.py`
- `backend/tests/services/test_settlement_group_service_regression_edges.py`

## File split rationale
- API: 분할 책임을 `confirm/reject`(및 auth 체크), `errors`, `unlink`로 분리해 검증의 책임을 분리.
- 서비스: 핵심 그룹핑 테스트는 `test_settlement_group_service.py`에 유지.
- 회귀/엣지 케이스는 `test_settlement_group_service_regression.py`와 `test_settlement_group_service_regression_edges.py`로 분리해 250 LOC 제한 준수.

## Commands executed
1) `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/api/test_settlement_match_api*.py tests/services/test_settlement_group_service*.py tests/services/test_settlement_match_service.py -q`
- Result: `19 passed, 172 warnings`

2) `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py tests/api/test_settlement_match_api*.py tests/services/test_settlement_group_service*.py tests/services/test_settlement_match_service.py -q`
- Result: `88 passed, 794 warnings`

3) `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check .`
- Result: `All checks passed!`

4) `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff format --check tests/api/test_settlement_match_api.py tests/api/test_settlement_match_api_errors.py tests/api/test_settlement_match_api_unlink.py tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py tests/services/test_settlement_group_service_regression_edges.py`
- Result: `6 files already formatted`

5) `git diff --check`
- Result: no issues

## Pure LOC check
Command used:
`for f in backend/tests/api/test_settlement_match_api.py backend/tests/api/test_settlement_match_api_errors.py backend/tests/api/test_settlement_match_api_unlink.py backend/tests/services/test_settlement_group_service.py backend/tests/services/test_settlement_group_service_regression.py backend/tests/services/test_settlement_group_service_regression_edges.py; do pure=$(awk 'BEGIN{n=0} /^[[:space:]]*(#|$)/{next} {n++} END{print n}' "$f"); total=$(wc -l < "$f"); printf "%s\tlines=%s\tpure=%s\n" "$f" "$total" "$pure"; done`

| file | total lines | pure LOC |
|---|---:|---:|
| `backend/tests/api/test_settlement_match_api.py` | 197 | 177 |
| `backend/tests/api/test_settlement_match_api_errors.py` | 87 | 79 |
| `backend/tests/api/test_settlement_match_api_unlink.py` | 119 | 110 |
| `backend/tests/services/test_settlement_group_service.py` | 123 | 109 |
| `backend/tests/services/test_settlement_group_service_regression.py` | 211 | 193 |
| `backend/tests/services/test_settlement_group_service_regression_edges.py` | 270 | 239 |

All split settlement test files are now <= 250 pure LOC.

## Cleanup
- No Docker/services/background jobs started.
- No production code was modified.
- New files created under test scope only.
