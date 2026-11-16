from httpx import AsyncClient


async def test_get_analytics_settings_requires_api_key(
    async_client: AsyncClient,
) -> None:
    response = await async_client.get("/api/v1/settings/analytics")

    assert response.status_code == 401


async def test_get_and_patch_analytics_settings_returns_defaults_saved_and_effective_values(
    async_client: AsyncClient,
    api_headers: dict[str, str],
) -> None:
    initial = await async_client.get("/api/v1/settings/analytics", headers=api_headers)

    assert initial.status_code == 200
    initial_payload = initial.json()
    guide = initial_payload.pop("comparison_guide")
    assert guide["title"] == "비교 기준"
    assert [option["key"] for option in guide["options"]] == [
        "baseline_start_date",
        "baseline_method",
        "partial_month_handling",
        "no_data_months",
        "annual_window",
        "ordering",
    ]
    assert [option["editable"] for option in guide["options"]] == [
        True,
        False,
        False,
        False,
        False,
        False,
    ]
    assert guide["options"][0]["label"] == "기준 구간 시작일"
    assert guide["options"][1]["value_label"] == "최근 6개 마감월의 중앙값"
    assert initial_payload == {
        "defaults": {
            "spending_anomalies": {
                "min_delta_amount": 100000,
                "anomaly_threshold": 0.5,
                "baseline_months": 6,
            },
            "discretionary_velocity": {
                "baseline_months": 6,
                "outlier_policy": "median_30pct_exclusion",
                "warning_velocity_ratio": 1.2,
                "high_velocity_ratio": 1.5,
                "minimum_classification_coverage": 0.7,
                "baseline_mode": "prorated_closed_month_baseline",
                "excluded_category_names": [],
                "excluded_merchants": [],
            },
            "purchase_gate": {
                "large_purchase_threshold": 100000,
                "min_candidate_amount": 100000,
                "new_merchant_lookback_months": 6,
                "merchant_spike_ratio": 2.0,
                "discretionary_spike_ratio": 1.5,
                "review_cooldown_days": 14,
                "candidate_risk_threshold": "warning",
                "enabled_candidate_types": [
                    "large_oneoff",
                    "new_merchant",
                    "merchant_spike",
                    "discretionary_spike",
                ],
                "excluded_category_names": [],
                "excluded_merchants": [],
            },
            "recurring_dry_run": {
                "min_occurrences": 2,
                "min_distinct_months": 2,
                "min_distinct_days": 2,
                "max_amount_cv": 0.5,
                "monthly_interval_days_min": 25,
                "monthly_interval_days_max": 35,
                "weekly_interval_days_min": 6,
                "weekly_interval_days_max": 8,
                "minimum_confidence": 0.5,
                "default_apply_scope": "all_matching",
                "upload_auto_apply": False,
            },
            "asset_liability_health": {
                "emergency_fund_included_tiers": ["immediate"],
                "show_near_liquid_as_secondary": True,
                "monthly_payment_estimate_lookback_months": 6,
                "monthly_payment_min_observations": 2,
                "debt_payment_confidence_requires_user_confirmation": True,
            },
            "bulk_operations": {
                "require_preview": True,
                "require_confirmation": True,
                "show_undo_after_delete": True,
                "max_bulk_rows_without_extra_confirmation": 100,
            },
            "financial_targets": {
                "emergency_fund_target_months": 3,
                "savings_rate_target": None,
                "debt_strategy_preference": None,
            },
            "comparison": {"baseline_start_date": None},
        },
        "saved": {
            "spending_anomalies": {
                "min_delta_amount": None,
                "anomaly_threshold": None,
                "baseline_months": None,
            },
            "discretionary_velocity": {
                "baseline_months": None,
                "outlier_policy": None,
                "warning_velocity_ratio": None,
                "high_velocity_ratio": None,
                "minimum_classification_coverage": None,
                "baseline_mode": None,
                "excluded_category_names": None,
                "excluded_merchants": None,
            },
            "purchase_gate": {
                "large_purchase_threshold": None,
                "min_candidate_amount": None,
                "new_merchant_lookback_months": None,
                "merchant_spike_ratio": None,
                "discretionary_spike_ratio": None,
                "review_cooldown_days": None,
                "candidate_risk_threshold": None,
                "enabled_candidate_types": None,
                "excluded_category_names": None,
                "excluded_merchants": None,
            },
            "recurring_dry_run": {
                "min_occurrences": None,
                "min_distinct_months": None,
                "min_distinct_days": None,
                "max_amount_cv": None,
                "monthly_interval_days_min": None,
                "monthly_interval_days_max": None,
                "weekly_interval_days_min": None,
                "weekly_interval_days_max": None,
                "minimum_confidence": None,
                "default_apply_scope": None,
                "upload_auto_apply": None,
            },
            "asset_liability_health": {
                "emergency_fund_included_tiers": None,
                "show_near_liquid_as_secondary": None,
                "monthly_payment_estimate_lookback_months": None,
                "monthly_payment_min_observations": None,
                "debt_payment_confidence_requires_user_confirmation": None,
            },
            "bulk_operations": {
                "require_preview": None,
                "require_confirmation": None,
                "show_undo_after_delete": None,
                "max_bulk_rows_without_extra_confirmation": None,
            },
            "financial_targets": {
                "emergency_fund_target_months": None,
                "savings_rate_target": None,
                "debt_strategy_preference": None,
            },
            "comparison": {"baseline_start_date": None},
        },
        "effective": {
            "spending_anomalies": {
                "min_delta_amount": 100000,
                "anomaly_threshold": 0.5,
                "baseline_months": 6,
            },
            "discretionary_velocity": {
                "baseline_months": 6,
                "outlier_policy": "median_30pct_exclusion",
                "warning_velocity_ratio": 1.2,
                "high_velocity_ratio": 1.5,
                "minimum_classification_coverage": 0.7,
                "baseline_mode": "prorated_closed_month_baseline",
                "excluded_category_names": [],
                "excluded_merchants": [],
            },
            "purchase_gate": {
                "large_purchase_threshold": 100000,
                "min_candidate_amount": 100000,
                "new_merchant_lookback_months": 6,
                "merchant_spike_ratio": 2.0,
                "discretionary_spike_ratio": 1.5,
                "review_cooldown_days": 14,
                "candidate_risk_threshold": "warning",
                "enabled_candidate_types": [
                    "large_oneoff",
                    "new_merchant",
                    "merchant_spike",
                    "discretionary_spike",
                ],
                "excluded_category_names": [],
                "excluded_merchants": [],
            },
            "recurring_dry_run": {
                "min_occurrences": 2,
                "min_distinct_months": 2,
                "min_distinct_days": 2,
                "max_amount_cv": 0.5,
                "monthly_interval_days_min": 25,
                "monthly_interval_days_max": 35,
                "weekly_interval_days_min": 6,
                "weekly_interval_days_max": 8,
                "minimum_confidence": 0.5,
                "default_apply_scope": "all_matching",
                "upload_auto_apply": False,
            },
            "asset_liability_health": {
                "emergency_fund_included_tiers": ["immediate"],
                "show_near_liquid_as_secondary": True,
                "monthly_payment_estimate_lookback_months": 6,
                "monthly_payment_min_observations": 2,
                "debt_payment_confidence_requires_user_confirmation": True,
            },
            "bulk_operations": {
                "require_preview": True,
                "require_confirmation": True,
                "show_undo_after_delete": True,
                "max_bulk_rows_without_extra_confirmation": 100,
            },
            "financial_targets": {
                "emergency_fund_target_months": 3,
                "savings_rate_target": None,
                "debt_strategy_preference": None,
            },
            "comparison": {"baseline_start_date": None},
        },
    }

    patched = await async_client.patch(
        "/api/v1/settings/analytics",
        headers=api_headers,
        json={
            "spending_anomalies": {
                "min_delta_amount": 30000,
                "anomaly_threshold": 1.25,
            },
        },
    )

    assert patched.status_code == 200
    payload = patched.json()
    assert payload["saved"]["spending_anomalies"] == {
        "min_delta_amount": 30000,
        "anomaly_threshold": 1.25,
        "baseline_months": None,
    }
    assert payload["effective"]["spending_anomalies"] == {
        "min_delta_amount": 30000,
        "anomaly_threshold": 1.25,
        "baseline_months": 6,
    }

    settings_patch = await async_client.patch(
        "/api/v1/settings/analytics",
        headers=api_headers,
        json={
            "discretionary_velocity": {
                "warning_velocity_ratio": 1.1,
                "excluded_merchants": ["면세점"],
            },
            "purchase_gate": {
                "large_purchase_threshold": 150000,
                "enabled_candidate_types": ["large_oneoff", "new_merchant"],
            },
        },
    )

    assert settings_patch.status_code == 200
    settings_payload = settings_patch.json()
    assert (
        settings_payload["saved"]["discretionary_velocity"]["warning_velocity_ratio"]
        == 1.1
    )
    assert settings_payload["effective"]["discretionary_velocity"][
        "excluded_merchants"
    ] == ["면세점"]
    assert (
        settings_payload["effective"]["purchase_gate"]["large_purchase_threshold"]
        == 150000
    )
    assert settings_payload["effective"]["purchase_gate"][
        "enabled_candidate_types"
    ] == ["large_oneoff", "new_merchant"]

    financial_targets_patch = await async_client.patch(
        "/api/v1/settings/analytics",
        headers=api_headers,
        json={
            "financial_targets": {
                "emergency_fund_target_months": 6,
                "savings_rate_target": 0.35,
                "debt_strategy_preference": "avalanche",
            },
        },
    )

    assert financial_targets_patch.status_code == 200
    targets_payload = financial_targets_patch.json()
    assert targets_payload["saved"]["financial_targets"] == {
        "emergency_fund_target_months": 6,
        "savings_rate_target": 0.35,
        "debt_strategy_preference": "avalanche",
    }
    assert targets_payload["effective"]["financial_targets"] == {
        "emergency_fund_target_months": 6,
        "savings_rate_target": 0.35,
        "debt_strategy_preference": "avalanche",
    }


async def test_patch_analytics_settings_validates_ranges(
    async_client: AsyncClient,
    api_headers: dict[str, str],
) -> None:
    response = await async_client.patch(
        "/api/v1/settings/analytics",
        headers=api_headers,
        json={"spending_anomalies": {"baseline_months": 13}},
    )

    assert response.status_code == 422


async def test_comparison_setting_write_requires_api_key_and_validates_date(
    async_client: AsyncClient,
    api_headers: dict[str, str],
) -> None:
    unauthorized = await async_client.patch(
        "/api/v1/settings/analytics",
        json={"comparison": {"baseline_start_date": "2026-03-01"}},
    )
    assert unauthorized.status_code == 401

    invalid = await async_client.patch(
        "/api/v1/settings/analytics",
        headers=api_headers,
        json={"comparison": {"baseline_start_date": "not-a-date"}},
    )
    assert invalid.status_code == 422

    saved = await async_client.patch(
        "/api/v1/settings/analytics",
        headers=api_headers,
        json={"comparison": {"baseline_start_date": "2026-03-01"}},
    )
    assert saved.status_code == 200
    payload = saved.json()
    assert payload["saved"]["comparison"] == {"baseline_start_date": "2026-03-01"}
    assert payload["effective"]["comparison"] == {"baseline_start_date": "2026-03-01"}
    assert "2026-03부터" in payload["comparison_guide"]["options"][0]["value_label"]

    other_section = await async_client.patch(
        "/api/v1/settings/analytics",
        headers=api_headers,
        json={"spending_anomalies": {"min_delta_amount": 1}},
    )
    assert other_section.json()["effective"]["comparison"] == {
        "baseline_start_date": "2026-03-01"
    }
