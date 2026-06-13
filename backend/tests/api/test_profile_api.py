from httpx import AsyncClient


async def test_profile_empty_state_explains_missing_snapshot(
    async_client: AsyncClient,
) -> None:
    response = await async_client.get("/api/v1/profile")

    assert response.status_code == 200
    assert response.json() == {
        "snapshot_date": None,
        "gender": None,
        "age": None,
        "credit_score_kcb": None,
        "credit_score_history": [],
        "has_snapshot": False,
        "missing_reason": "never_imported",
        "expected_source": "BankSalad 1.고객정보",
        "source_section_found": None,
    }


async def test_profile_returns_latest_profile_snapshot_from_workbook(
    async_client: AsyncClient,
    seeded_finance_data: None,
) -> None:
    del seeded_finance_data

    response = await async_client.get("/api/v1/profile")

    assert response.status_code == 200
    assert response.json() == {
        "snapshot_date": "2026-03-24",
        "gender": "남",
        "age": 39,
        "credit_score_kcb": 996,
        "credit_score_history": [
            {
                "snapshot_date": "2026-03-24",
                "credit_score_kcb": 996,
            }
        ],
        "has_snapshot": True,
        "missing_reason": None,
        "expected_source": "BankSalad 1.고객정보",
        "source_section_found": True,
    }
