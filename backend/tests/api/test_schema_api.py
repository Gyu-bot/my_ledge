from httpx import AsyncClient

from app.models import Base


def test_expected_tables_exist() -> None:
    table_names = set(Base.metadata.tables)

    assert table_names == {
        "app_settings",
        "auto_classification_settings",
        "category_classification_rules",
        "merchant_alias_rules",
        "recurring_category_rules",
        "transactions",
        "asset_snapshots",
        "insurance_contracts",
        "investments",
        "loans",
        "loan_accounts",
        "loan_merchant_rules",
        "loan_transaction_links",
        "installment_plans",
        "installment_transaction_links",
        "purchase_gate_reviews",
        "upload_logs",
        "user_profile_snapshots",
    }

    transactions = Base.metadata.tables["transactions"]
    app_settings = Base.metadata.tables["app_settings"]
    category_classification_rules = Base.metadata.tables[
        "category_classification_rules"
    ]
    recurring_category_rules = Base.metadata.tables["recurring_category_rules"]
    investments = Base.metadata.tables["investments"]
    insurance_contracts = Base.metadata.tables["insurance_contracts"]
    loans = Base.metadata.tables["loans"]
    loan_accounts = Base.metadata.tables["loan_accounts"]
    loan_merchant_rules = Base.metadata.tables["loan_merchant_rules"]
    loan_transaction_links = Base.metadata.tables["loan_transaction_links"]
    installment_transaction_links = Base.metadata.tables[
        "installment_transaction_links"
    ]
    purchase_gate_reviews = Base.metadata.tables["purchase_gate_reviews"]
    user_profile_snapshots = Base.metadata.tables["user_profile_snapshots"]

    assert transactions.c.is_deleted.server_default is not None
    assert transactions.c.source.server_default is not None
    assert transactions.c.merged_into_id.foreign_keys
    assert {index.name for index in transactions.indexes} == {"idx_tx_datetime"}
    assert {
        tuple(column.name for column in constraint.columns)
        for constraint in app_settings.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    } == {("scope", "key")}
    assert {
        tuple(column.name for column in constraint.columns)
        for constraint in category_classification_rules.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    } == {("category_major", "category_minor")}
    assert {
        tuple(column.name for column in constraint.columns)
        for constraint in recurring_category_rules.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    } == {("category_major", "category_minor")}

    assert not investments.c.broker.nullable
    assert not insurance_contracts.c.insurer.nullable
    assert {
        tuple(column.name for column in constraint.columns)
        for constraint in insurance_contracts.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    } == {("snapshot_date", "insurer", "product_name")}
    assert {
        tuple(column.name for column in constraint.columns)
        for constraint in investments.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    } == {("snapshot_date", "broker", "product_name")}

    assert not loans.c.lender.nullable
    assert "monthly_payment_source" in loans.c
    assert "repayment_method_source" in loans.c
    assert {
        tuple(column.name for column in constraint.columns)
        for constraint in loans.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    } == {("snapshot_date", "lender", "product_name")}
    assert {
        tuple(column.name for column in constraint.columns)
        for constraint in loan_accounts.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    } == {("lender", "product_name")}
    assert loan_merchant_rules.c.loan_account_id.foreign_keys
    assert {
        tuple(column.name for column in constraint.columns)
        for constraint in loan_merchant_rules.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    } == {("match_field", "merchant")}
    assert loan_transaction_links.c.transaction_id.foreign_keys
    assert loan_transaction_links.c.loan_account_id.foreign_keys
    assert {
        tuple(column.name for column in constraint.columns)
        for constraint in loan_transaction_links.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    } == {("transaction_id",)}
    assert installment_transaction_links.c.transaction_id.foreign_keys
    assert installment_transaction_links.c.installment_plan_id.foreign_keys
    assert {
        tuple(column.name for column in constraint.columns)
        for constraint in installment_transaction_links.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    } == {("transaction_id",), ("installment_plan_id", "installment_number")}
    assert {"memo", "reviewed_at", "cooldown_until"}.issubset(
        set(purchase_gate_reviews.c.keys())
    )
    assert {
        tuple(column.name for column in constraint.columns)
        for constraint in user_profile_snapshots.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    } == {("snapshot_date",)}


async def test_schema_endpoint_requires_api_key(async_client: AsyncClient) -> None:
    response = await async_client.get("/api/v1/schema")

    assert response.status_code == 401


async def test_schema_endpoint_returns_tables(
    async_client: AsyncClient,
    api_headers: dict[str, str],
) -> None:
    response = await async_client.get("/api/v1/schema", headers=api_headers)

    assert response.status_code == 200
    assert response.json()["tables"][0]["name"] == "app_settings"
    assert "transactions" in {table["name"] for table in response.json()["tables"]}
    assert {view["name"] for view in response.json()["views"]} == {
        "vw_category_monthly_spend",
        "vw_asset_snapshot_canonical",
        "vw_fixed_cost_monthly_summary",
        "vw_income_monthly_by_category",
        "vw_loan_account_canonical",
        "vw_loan_repayment_monthly",
        "vw_merchant_monthly_baseline",
        "vw_monthly_cashflow",
        "vw_recurring_merchant_monthly",
        "vw_transactions_effective",
        "vw_true_spendable_monthly",
        "vw_unclassified_work_queue",
    }

    effective_view = next(
        view
        for view in response.json()["views"]
        if view["name"] == "vw_transactions_effective"
    )
    assert effective_view["recommended_for_ai"] is True
    assert effective_view["kind"] == "view"
    assert "excludes deleted or merged rows" in effective_view["description"]
    assert any(
        column["name"] == "effective_category_major"
        for column in effective_view["columns"]
    )
    assert any(column["name"] == "merchant" for column in effective_view["columns"])
    assert any(
        column["name"] == "loan_repayment_type" for column in effective_view["columns"]
    )
    assert any(
        column["name"] == "loan_display_name" for column in effective_view["columns"]
    )
    assert any(column["name"] == "loan_kind" for column in effective_view["columns"])
    assert any(
        column["name"] == "loan_start_date" for column in effective_view["columns"]
    )
    assert any(
        column["name"] == "loan_maturity_date" for column in effective_view["columns"]
    )
    assert any(
        column["name"] == "cost_classification_source"
        for column in effective_view["columns"]
    )

    monthly_cashflow_view = next(
        view
        for view in response.json()["views"]
        if view["name"] == "vw_monthly_cashflow"
    )
    assert monthly_cashflow_view["recommended_for_ai"] is True
    assert {
        "income_total",
        "expense_total",
        "non_loan_expense_total",
        "loan_repayment_total",
        "fixed_total",
        "variable_total",
        "net_cashflow",
        "savings_rate",
    }.issubset({column["name"] for column in monthly_cashflow_view["columns"]})

    asset_snapshot_view = next(
        view
        for view in response.json()["views"]
        if view["name"] == "vw_asset_snapshot_canonical"
    )
    assert {
        "snapshot_date",
        "asset_total",
        "liability_total",
        "net_worth",
        "cash_equivalent_total",
        "near_liquid_total",
        "loan_balance_total",
        "monthly_debt_payment_total",
        "negative_asset_excluded_total",
    }.issubset({column["name"] for column in asset_snapshot_view["columns"]})

    loan_account_view = next(
        view
        for view in response.json()["views"]
        if view["name"] == "vw_loan_account_canonical"
    )
    assert {
        "loan_account_id",
        "display_name",
        "lender",
        "product_name",
        "loan_kind",
        "snapshot_date",
        "principal",
        "balance",
        "interest_rate",
        "monthly_payment",
        "monthly_payment_source",
        "repayment_method",
        "start_date",
        "maturity_date",
        "estimated_monthly_interest",
    }.issubset({column["name"] for column in loan_account_view["columns"]})

    income_view = next(
        view
        for view in response.json()["views"]
        if view["name"] == "vw_income_monthly_by_category"
    )
    assert {
        "period",
        "effective_category_major",
        "income_total",
        "transaction_count",
    }.issubset({column["name"] for column in income_view["columns"]})

    unclassified_queue_view = next(
        view
        for view in response.json()["views"]
        if view["name"] == "vw_unclassified_work_queue"
    )
    assert {
        "transaction_id",
        "needs_cost_kind",
        "needs_fixed_cost_necessity",
        "needs_recurring_payment_kind",
        "needs_loan_link_review",
        "priority_score",
        "priority_reason",
    }.issubset({column["name"] for column in unclassified_queue_view["columns"]})
