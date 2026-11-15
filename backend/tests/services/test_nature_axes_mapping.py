"""T056 mapping table (user decision 2026-11-15) and its frozen migration copy."""

import importlib.util
import itertools
from pathlib import Path

import pytest

from app.services.nature_axes_mapping import MAPPING_ROWS, map_legacy_classification

BACKFILL = (
    Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions"
    / "20261115_0037_nature_axes_backfill.py"
)


def _map(**overrides: object):  # type: ignore[no-untyped-def]
    values: dict[str, object] = {
        "loan_linked": False,
        "installment_linked": False,
        "cost_kind": None,
        "fixed_cost_necessity": None,
        "spend_necessity": None,
        "recurring_payment_kind": None,
    }
    values.update(overrides)
    return map_legacy_classification(**values)  # type: ignore[arg-type]


# (inputs, mapping_row, commitment_kind, resolved adjustability, flags)
DECISION_TABLE = [
    # linked to a loan -> committed (loan) · protected
    (
        {"loan_linked": True, "spend_necessity": "discretionary"},
        "loan_linked",
        "loan",
        "protected",
        (),
    ),
    # linked to an installment plan -> committed (installment) · protected
    (
        {"installment_linked": True, "cost_kind": "variable"},
        "installment_linked",
        "installment",
        "protected",
        (),
    ),
    # cost_kind=fixed + essential -> committed (recurring) · protected
    (
        {"cost_kind": "fixed", "fixed_cost_necessity": "essential"},
        "fixed_essential",
        "recurring",
        "protected",
        (),
    ),
    # cost_kind=fixed + discretionary -> committed (recurring) · adjustable
    (
        {"cost_kind": "fixed", "spend_necessity": "discretionary"},
        "fixed_discretionary",
        "recurring",
        "adjustable",
        (),
    ),
    # cost_kind=fixed + necessity empty -> committed (recurring) · undecided
    ({"cost_kind": "fixed"}, "fixed_necessity_empty", "recurring", "undecided", ()),
    # fixed with disagreeing necessities -> stays undecided, counted
    (
        {
            "cost_kind": "fixed",
            "fixed_cost_necessity": "essential",
            "spend_necessity": "discretionary",
        },
        "fixed_necessity_conflict",
        "recurring",
        "undecided",
        ("necessity_conflict",),
    ),
    # cost_kind=variable + discretionary -> ad hoc · adjustable
    (
        {"cost_kind": "variable", "spend_necessity": "discretionary"},
        "variable_discretionary",
        None,
        "adjustable",
        (),
    ),
    # cost_kind=variable + essential -> ad hoc · protected
    (
        {"cost_kind": "variable", "spend_necessity": "essential"},
        "variable_essential",
        None,
        "protected",
        (),
    ),
    ({"cost_kind": "variable"}, "variable_necessity_empty", None, "undecided", ()),
    # unclassified -> undecided
    ({}, "unclassified", None, "undecided", ()),
    # variable + monthly_recurring -> committed (recurring), necessity kept
    (
        {
            "cost_kind": "variable",
            "spend_necessity": "essential",
            "recurring_payment_kind": "monthly_recurring",
        },
        "variable_monthly_recurring",
        "recurring",
        "protected",
        (),
    ),
    # installment kind without a plan link -> ad hoc, link unconfirmed
    (
        {
            "recurring_payment_kind": "installment",
            "spend_necessity": "discretionary",
        },
        "installment_kind_unlinked",
        None,
        "adjustable",
        ("installment_link_unconfirmed",),
    ),
    # fixed + not_recurring -> ad hoc, necessity kept
    (
        {
            "cost_kind": "fixed",
            "fixed_cost_necessity": "essential",
            "recurring_payment_kind": "not_recurring",
        },
        "fixed_not_recurring",
        None,
        "protected",
        (),
    ),
    # monthly_recurring with no cost_kind -> committed (recurring) · undecided
    (
        {"recurring_payment_kind": "monthly_recurring"},
        "monthly_recurring_no_cost_kind",
        "recurring",
        "undecided",
        (),
    ),
    # no cost_kind but a necessity: ad hoc with that necessity (T054 view rule)
    (
        {"spend_necessity": "essential"},
        "no_cost_kind_with_necessity",
        None,
        "protected",
        (),
    ),
]


@pytest.mark.parametrize(
    ("inputs", "row", "commitment", "adjustability", "flags"), DECISION_TABLE
)
def test_every_mapping_row(
    inputs: dict[str, object],
    row: str,
    commitment: str | None,
    adjustability: str,
    flags: tuple[str, ...],
) -> None:
    nature = _map(**inputs)
    assert nature.mapping_row == row
    assert nature.commitment_kind == commitment
    assert nature.payment_form == ("committed" if commitment else "ad_hoc")
    assert nature.resolved_adjustability == adjustability
    assert nature.installment_link_unconfirmed == (
        "installment_link_unconfirmed" in flags
    )
    assert nature.necessity_conflict == ("necessity_conflict" in flags)


def test_decision_table_covers_every_mapping_row() -> None:
    assert {row for _, row, *_ in DECISION_TABLE} == set(MAPPING_ROWS)


def test_fixed_uses_fixed_necessity_first_then_spend_necessity() -> None:
    assert _map(cost_kind="fixed", spend_necessity="essential").adjustability == (
        "protected"
    )
    assert (
        _map(
            cost_kind="fixed",
            fixed_cost_necessity="discretionary",
            spend_necessity="discretionary",
        ).adjustability
        == "adjustable"
    )
    # Non-fixed rows read spend_necessity only.
    assert (
        _map(cost_kind="variable", fixed_cost_necessity="essential").adjustability
        is None
    )


def test_frozen_backfill_mapping_matches_service_on_every_input() -> None:
    spec = importlib.util.spec_from_file_location("_backfill_0037", BACKFILL)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    necessities = (None, "essential", "discretionary", "unknown")
    for loan, installment, kind, fixed_n, spend_n, recurring in itertools.product(
        (False, True),
        (False, True),
        (None, "fixed", "variable", "unknown"),
        necessities,
        necessities,
        (None, "monthly_recurring", "installment", "not_recurring", "unknown"),
    ):
        kwargs = {
            "loan_linked": loan,
            "installment_linked": installment,
            "cost_kind": kind,
            "fixed_cost_necessity": fixed_n,
            "spend_necessity": spend_n,
            "recurring_payment_kind": recurring,
        }
        nature = map_legacy_classification(**kwargs)  # type: ignore[arg-type]
        assert module.map_legacy(**kwargs) == (
            nature.mapping_row,
            nature.commitment_kind,
            nature.adjustability,
            nature.installment_link_unconfirmed,
            nature.necessity_conflict,
        ), kwargs
