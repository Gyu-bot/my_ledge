from httpx import AsyncClient

from app.models import Base


def test_expected_tables_exist() -> None:
    table_names = set(Base.metadata.tables)

    assert table_names == {
        "transactions",
        "asset_snapshots",
        "investments",
        "loans",
        "upload_logs",
    }

    transactions = Base.metadata.tables["transactions"]
    investments = Base.metadata.tables["investments"]
    loans = Base.metadata.tables["loans"]

    assert transactions.c.is_deleted.server_default is not None
    assert transactions.c.source.server_default is not None
    assert transactions.c.merged_into_id.foreign_keys
    assert {index.name for index in transactions.indexes} == {"idx_tx_datetime"}

    assert not investments.c.broker.nullable
    assert {
        tuple(column.name for column in constraint.columns)
        for constraint in investments.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    } == {("snapshot_date", "broker", "product_name")}

    assert not loans.c.lender.nullable
    assert {
        tuple(column.name for column in constraint.columns)
        for constraint in loans.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    } == {("snapshot_date", "lender", "product_name")}


async def test_schema_endpoint_requires_api_key(async_client: AsyncClient) -> None:
    response = await async_client.get("/api/v1/schema")

    assert response.status_code == 401


async def test_schema_endpoint_returns_tables(
    async_client: AsyncClient,
    api_headers: dict[str, str],
) -> None:
    response = await async_client.get("/api/v1/schema", headers=api_headers)

    assert response.status_code == 200
    assert response.json()["tables"][0]["name"] == "asset_snapshots"
    assert "transactions" in {table["name"] for table in response.json()["tables"]}
    assert {view["name"] for view in response.json()["views"]} == {
        "vw_category_monthly_spend",
        "vw_transactions_effective",
    }

    effective_view = next(
        view for view in response.json()["views"] if view["name"] == "vw_transactions_effective"
    )
    assert effective_view["recommended_for_ai"] is True
    assert effective_view["kind"] == "view"
    assert any(column["name"] == "effective_category_major" for column in effective_view["columns"])
