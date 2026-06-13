from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient


async def _create_sample_canonical_views(db_session: AsyncSession) -> None:
    await db_session.execute(
        text(
            """
            CREATE VIEW vw_monthly_cashflow AS
            SELECT
                '2025-11' AS period,
                6621314 AS income_total,
                3000000 AS expense_total,
                2600000 AS non_loan_expense_total,
                250000 AS transfer_activity_total,
                400000 AS loan_repayment_total,
                1500000 AS fixed_total,
                1100000 AS variable_total,
                1000000 AS essential_fixed_total,
                500000 AS discretionary_fixed_total,
                200000 AS essential_variable_total,
                900000 AS discretionary_variable_total,
                1200000 AS required_spend_total,
                1400000 AS discretionary_spend_total,
                300000 AS unclassified_expense_total,
                3000000 AS net_cashflow,
                0.5 AS savings_rate
            UNION ALL
            SELECT
                '2025-12',
                6612477,
                3300000,
                2900000,
                250000,
                400000,
                1650000,
                1250000,
                1150000,
                500000,
                250000,
                1000000,
                1400000,
                1500000,
                300000,
                3900000,
                0.5417
            UNION ALL
            SELECT
                '2026-01',
                7117437,
                3200000,
                2800000,
                250000 AS transfer_activity_total,
                400000 AS loan_repayment_total,
                1600000 AS fixed_total,
                1200000 AS variable_total,
                1100000 AS essential_fixed_total,
                500000 AS discretionary_fixed_total,
                200000 AS essential_variable_total,
                1000000 AS discretionary_variable_total,
                1300000 AS required_spend_total,
                1500000 AS discretionary_spend_total,
                300000 AS unclassified_expense_total,
                1800000 AS net_cashflow,
                0.36 AS savings_rate
            UNION ALL
            SELECT
                '2026-02',
                10234941,
                3200000,
                2800000,
                250000,
                400000,
                1600000,
                1200000,
                1100000,
                500000,
                200000,
                1000000,
                1300000,
                1500000,
                300000,
                7034941,
                0.6873
            UNION ALL
            SELECT
                '2026-03',
                7012341,
                3200000,
                2800000,
                250000,
                400000,
                1600000,
                1200000,
                1100000,
                500000,
                200000,
                1000000,
                1300000,
                1500000,
                300000,
                3812341,
                0.5436
            UNION ALL
            SELECT
                '2026-04',
                7042935,
                3200000,
                2800000,
                250000,
                400000,
                1600000,
                1200000,
                1100000,
                500000,
                200000,
                1000000,
                1300000,
                1500000,
                300000,
                3842935,
                0.5456
            UNION ALL
            SELECT
                '2026-05',
                1521,
                3500000,
                3000000,
                100000,
                500000,
                1700000,
                1300000,
                1200000,
                500000,
                300000,
                1000000,
                1500000,
                1500000,
                200000,
                -3498479,
                -2300.1189
            """
        )
    )
    await db_session.execute(
        text(
            """
            CREATE VIEW vw_true_spendable_monthly AS
            SELECT
                '2026-05' AS period,
                1521 AS income_total,
                500000 AS loan_repayment_total,
                1700000 AS fixed_commitment_total,
                1300000 AS variable_total,
                300000 AS required_variable_total,
                1000000 AS discretionary_variable_total,
                -2198479 AS spendable_before_variable_spend,
                -3498479 AS remaining_after_variable_spend
            """
        )
    )
    await db_session.execute(
        text(
            """
            CREATE VIEW vw_loan_repayment_monthly AS
            SELECT
                '2026-05' AS period,
                1 AS loan_account_id,
                '국민 주담대' AS loan_display_name,
                '국민은행' AS loan_lender,
                '주택담보대출' AS loan_product_name,
                'mortgage' AS loan_kind,
                '2036-05-21' AS loan_maturity_date,
                'principal_interest' AS loan_repayment_type,
                500000 AS repayment_total,
                1 AS transaction_count
            """
        )
    )
    await db_session.execute(
        text(
            """
            CREATE VIEW vw_merchant_monthly_baseline AS
            SELECT
                '2026-05' AS period,
                '쿠팡' AS merchant,
                '생활' AS effective_category_major,
                '쇼핑' AS effective_category_minor,
                350000 AS monthly_spend,
                5 AS transaction_count,
                3 AS baseline_month_count,
                220000.0 AS trailing_3_month_avg,
                130000.0 AS baseline_delta,
                0.5909 AS baseline_delta_pct
            """
        )
    )
    await db_session.execute(
        text(
            """
            CREATE VIEW vw_recurring_merchant_monthly AS
            SELECT
                '2026-05' AS period,
                '쿠팡' AS merchant,
                'monthly_recurring' AS recurring_payment_kind,
                220000 AS monthly_spend,
                2 AS transaction_count,
                '2026-05-10' AS first_date,
                '2026-05-20' AS last_date
            """
        )
    )
    await db_session.execute(
        text(
            """
            CREATE VIEW vw_unclassified_work_queue AS
            SELECT
                42 AS transaction_id,
                '2026-05-20' AS date,
                '지출' AS type,
                '대출상환' AS merchant,
                '금융' AS effective_category_major,
                '대출' AS effective_category_minor,
                -500000 AS amount,
                500000 AS amount_abs,
                1 AS needs_cost_kind,
                NULL AS needs_fixed_cost_necessity,
                1 AS needs_spend_necessity,
                1 AS needs_recurring_payment_kind,
                1 AS needs_loan_link_review,
                2 AS merchant_expense_count,
                585000 AS priority_score,
                'loan_link_review' AS priority_reason
            """
        )
    )
    await db_session.commit()


async def test_canonical_dashboard_requires_api_key(async_client: AsyncClient) -> None:
    response = await async_client.get("/api/v1/canonical-views/dashboard")

    assert response.status_code == 401


async def test_canonical_dashboard_returns_view_rows(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    await _create_sample_canonical_views(db_session)

    response = await async_client.get(
        "/api/v1/canonical-views/dashboard",
        headers=api_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["data_coverage"] == {
        "first_transaction_date": None,
        "last_transaction_date": None,
    }
    assert body["monthly_cashflow"][-1]["period"] == "2026-05"
    assert body["monthly_cashflow"][-1]["is_complete_month"] is False
    assert body["monthly_cashflow"][-1]["loan_repayment_total"] == 500000
    assert body["monthly_cashflow"][-1]["discretionary_variable_total"] == 1000000
    assert body["monthly_cashflow"][-1]["income_total"] == 1521
    assert body["monthly_cashflow"][-1]["savings_rate_basis"] == "insufficient_partial_month_income"
    assert (
        body["true_spendable_monthly"][0]["remaining_after_variable_spend"] == -3498479
    )
    assert body["true_spendable_monthly"][0]["is_complete_month"] is False
    assert body["true_spendable_monthly"][0]["discretionary_variable_total"] == 1000000
    assert body["loan_repayment_monthly"][0]["loan_display_name"] == "국민 주담대"
    assert body["merchant_monthly_baseline"][0]["baseline_delta"] == 130000.0
    assert body["recurring_merchant_monthly"][0]["merchant"] == "쿠팡"
    assert body["unclassified_work_queue"][0]["transaction_id"] == 42
    assert body["unclassified_work_queue"][0]["needs_fixed_cost_necessity"] is False
    assert body["unclassified_work_queue"][0]["needs_loan_link_review"] is True
    assert body["unclassified_work_queue"][0]["issue_types"] == [
        "cost_kind",
        "spend_necessity",
        "recurring_kind",
        "loan_link",
    ]
    assert body["unclassified_work_queue"][0]["primary_issue_type"] == "loan_link"
    assert body["unclassified_work_queue"][0]["recurrence_signal"] == {
        "has_monthly_pattern": True,
        "active_month_count": 2,
        "same_month_repeat_only": False,
    }


async def test_canonical_dashboard_filters_unclassified_queue_by_issue_and_period(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    await _create_sample_canonical_views(db_session)

    loan_link_response = await async_client.get(
        "/api/v1/canonical-views/dashboard",
        headers=api_headers,
        params={"issue_types": "loan_link", "period_from": "2026-05", "period_to": "2026-05"},
    )
    cost_kind_response = await async_client.get(
        "/api/v1/canonical-views/dashboard",
        headers=api_headers,
        params={"issue_types": "cost_kind", "period_from": "2026-06"},
    )

    assert loan_link_response.status_code == 200
    assert len(loan_link_response.json()["unclassified_work_queue"]) == 1
    assert cost_kind_response.status_code == 200
    assert cost_kind_response.json()["unclassified_work_queue"] == []


async def test_canonical_dashboard_estimates_income_for_partial_current_month(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    await _create_sample_canonical_views(db_session)

    response = await async_client.get(
        "/api/v1/canonical-views/dashboard?reference_date=2026-05-28",
        headers=api_headers,
    )

    assert response.status_code == 200
    current_month = response.json()["true_spendable_monthly"][0]
    assert current_month["period"] == "2026-05"
    assert current_month["income_total"] == 1521
    assert current_month["observed_income_total"] == 1521
    assert current_month["estimated_income_total"] == 6881301
    assert current_month["income_basis"] == "estimated"
    assert current_month["is_income_estimated"] is True
    assert current_month["income_estimate_month_count"] == 5
    assert current_month["income_estimate_source"] == "trailing_6_outlier_adjusted_avg"
    assert current_month["excluded_income_periods"] == ["2026-02"]
    assert current_month["estimated_spendable_before_variable_spend"] == 4681301
    assert current_month["estimated_remaining_after_variable_spend"] == 3381301
