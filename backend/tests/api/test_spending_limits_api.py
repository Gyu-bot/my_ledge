import pytest

READ = "/api/v1/read/spending-reference"
LIMITS = "/api/v1/spending-limits"
VALID = {
    "target_kind": "category",
    "target_value": "category-synthetic",
    "effective_from_period": "2031-01",
    "amount": 100,
}


@pytest.mark.parametrize("path", [READ, LIMITS])
async def test_auth_and_unknown_query(async_client, api_headers, path):
    assert (await async_client.get(path)).status_code == 401
    response = await async_client.get(
        path, params={"unknown": "value"}, headers=api_headers
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["query", "unknown"]
    assert (await async_client.post(LIMITS, json=VALID)).status_code == 401


@pytest.mark.parametrize(
    "change",
    [
        {"target_kind": "automatic"},
        {"target_kind": "adjustability", "target_value": "recommended"},
        {"amount": -1},
        {"amount": 1.5},
        {"amount": True},
        {"amount": "100"},
        {"effective_from_period": "2031-13"},
        {"extra": 100},
    ],
)
async def test_invalid_inputs(async_client, api_headers, change):
    response = await async_client.post(
        LIMITS, json={**VALID, **change}, headers=api_headers
    )
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)


async def test_immutable_order_and_index(async_client, api_headers):
    assert (
        await async_client.post(LIMITS, json=VALID, headers=api_headers)
    ).status_code == 201
    assert (
        await async_client.post(LIMITS, json=VALID, headers=api_headers)
    ).status_code == 409
    assert (
        await async_client.post(
            LIMITS,
            json={**VALID, "effective_from_period": "2030-12"},
            headers=api_headers,
        )
    ).status_code == 409
    assert (
        await async_client.get(READ, params={"period": "2030-13"}, headers=api_headers)
    ).status_code == 422
    index = (await async_client.get("/api/v1/read/index", headers=api_headers)).json()
    entry = next(row for row in index["entries"] if row["key"] == "spending_reference")
    assert entry["path"] == READ and entry["parameters"] == ["period"]


async def test_query_failure_returns_read_envelope(
    async_client, api_headers, monkeypatch
):
    from sqlalchemy.exc import SQLAlchemyError
    from app.api.v1.endpoints import read_surface

    async def failed(*args, **kwargs):
        raise SQLAlchemyError("synthetic failure")

    monkeypatch.setattr(read_surface, "read_spending_reference", failed)
    response = await async_client.get(READ, headers=api_headers)
    assert response.status_code == 503
    assert response.json()["status"] == "query_failed"
