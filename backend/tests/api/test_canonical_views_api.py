async def test_income_expectations_authenticated_validation_roundtrip_and_reset(
    async_client, api_headers
):
    endpoint = "/api/v1/settings/income-expectations"
    assert (await async_client.get(endpoint)).status_code == 401
    payload = {
        "items": [
            {
                "source_key": "income:example payer",
                "merchant": "Example Payer",
                "expected_amount": 100_000,
                "expected_day": 31,
                "stopped": False,
            }
        ]
    }
    assert (await async_client.patch(endpoint, json=payload)).status_code == 401
    response = await async_client.patch(endpoint, headers=api_headers, json=payload)
    assert response.status_code == 200
    assert (await async_client.get(endpoint, headers=api_headers)).json() == payload
    invalid = {"items": [{**payload["items"][0], "expected_day": 32}]}
    assert (
        await async_client.patch(endpoint, headers=api_headers, json=invalid)
    ).status_code == 422
    assert (
        await async_client.patch(
            endpoint, headers=api_headers, json={"items": payload["items"] * 2}
        )
    ).status_code == 422
    invalid["items"][0]["expected_day"] = 30
    invalid["items"][0]["source_key"] = "income:unrelated"
    assert (
        await async_client.patch(endpoint, headers=api_headers, json=invalid)
    ).status_code == 422
    assert (
        await async_client.patch(endpoint, headers=api_headers, json={"items": []})
    ).json() == {"items": []}
    assert (await async_client.get(endpoint, headers=api_headers)).json() == {
        "items": []
    }


async def test_month_projection_accuracy_endpoint_is_read_only_and_banded(
    async_client, api_headers, db_session
):
    """T064 R12: recent closed-month replay error by as-of day band."""
    import sys
    from pathlib import Path

    from sqlalchemy import func, select

    from app.models import AppSetting, Transaction

    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
    from forecast_backtest_ledger import build_backtest_ledger

    await build_backtest_ledger(db_session)
    endpoint = "/api/v1/canonical-views/month-projection/accuracy"
    assert (await async_client.get(endpoint)).status_code == 401
    before = await db_session.scalar(select(func.count()).select_from(Transaction))
    response = await async_client.get(
        endpoint, headers=api_headers, params={"reference_date": "2031-11-02"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["reference_period"] == "2031-11"
    assert body["evaluated_periods"] == ["2031-08", "2031-09", "2031-10"]
    assert body["current_band"] == "day_01_10"
    bands = {item["band"]: item for item in body["bands"]}
    assert bands["day_01_10"]["as_of_days"] == [5, 10]
    assert bands["day_01_10"]["points"] == 6
    assert bands["day_21_31"]["points"] == 3
    for item in bands.values():
        # The synthetic ledger repeats every month: no replay error.
        assert item["withheld_points"] == 0
        assert item["net_median_signed_error"] == 0
        assert item["net_median_absolute_error"] == 0
    # Default reference: the transaction as-of date (same as the dashboard).
    default = (await async_client.get(endpoint, headers=api_headers)).json()
    assert default["reference_period"] == "2031-11"
    assert await db_session.scalar(select(func.count()).select_from(Transaction)) == (
        before
    )
    assert await db_session.scalar(select(func.count()).select_from(AppSetting)) == 0
