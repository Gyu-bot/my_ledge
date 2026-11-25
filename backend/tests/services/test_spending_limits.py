import pytest
import spending_limit_scenarios as scenarios

SCENARIOS = [
    scenarios.scenario_annual_reference_and_outflow,
    scenarios.scenario_reference_query_count,
    scenarios.scenario_pairs_and_registered_yearly,
    scenarios.scenario_refund_nets_and_commitment_attribution,
    scenarios.scenario_limit_history,
    scenarios.scenario_no_limit_progress_and_gaps,
]


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda fn: fn.__name__)
async def test_spending_reference(scenario, db_session, async_client):
    await scenario(db_session, async_client)
