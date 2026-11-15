"""Legacy classification -> two-axis nature mapping (T056, user-approved 2026-11-15).

One pure function shared by the old-column write-through, the dry-run report,
and (as a frozen copy) the Alembic backfill ``20261115_0037``. The test
``tests/services/test_nature_axes_mapping.py`` checks that the frozen copy and
this function agree on every input combination.

Mapping (essential -> protected, discretionary -> adjustable, empty -> undecided):

| Existing                                      | New                                   |
|-----------------------------------------------|---------------------------------------|
| loan link                                     | committed (loan) · protected (fixed)  |
| installment-plan link                         | committed (installment) · protected   |
| recurring_payment_kind=installment, no link   | ad hoc, link unconfirmed · necessity  |
| cost_kind=fixed + not_recurring               | ad hoc · necessity                    |
| cost_kind=fixed (+ monthly/empty kind)        | committed (recurring) · necessity     |
| cost_kind=variable + monthly_recurring        | committed (recurring) · necessity     |
| cost_kind=variable                            | ad hoc · necessity                    |
| no cost_kind + monthly_recurring              | committed (recurring) · necessity     |
| no cost_kind, necessity set                   | ad hoc · necessity (T054 view rule)   |
| no cost_kind, no necessity                    | ad hoc · undecided                    |

For ``cost_kind=fixed`` the necessity is ``fixed_cost_necessity`` first, then
``spend_necessity``; when both are set and disagree the row stays undecided and
is flagged ``necessity_conflict``. Otherwise ``spend_necessity`` is used.
"""

from dataclasses import dataclass
from typing import Literal

EXPENSE = "지출"

CommitmentKind = Literal["loan", "installment", "recurring"]
Adjustability = Literal["protected", "adjustable"]

MAPPING_ROWS: tuple[str, ...] = (
    "loan_linked",
    "installment_linked",
    "installment_kind_unlinked",
    "fixed_not_recurring",
    "fixed_essential",
    "fixed_discretionary",
    "fixed_necessity_empty",
    "fixed_necessity_conflict",
    "variable_monthly_recurring",
    "variable_essential",
    "variable_discretionary",
    "variable_necessity_empty",
    "monthly_recurring_no_cost_kind",
    "no_cost_kind_with_necessity",
    "unclassified",
)

_NECESSITY_TO_ADJUSTABILITY: dict[str, Adjustability] = {
    "essential": "protected",
    "discretionary": "adjustable",
}


@dataclass(frozen=True, slots=True)
class LegacyNature:
    mapping_row: str
    commitment_kind: CommitmentKind | None
    # Value carried by the existing human classification; None = 미정.
    adjustability: Adjustability | None
    installment_link_unconfirmed: bool = False
    necessity_conflict: bool = False

    @property
    def payment_form(self) -> str:
        return "committed" if self.commitment_kind is not None else "ad_hoc"

    @property
    def resolved_adjustability(self) -> str:
        """Adjustability the metric views show for this row right after mapping."""
        if self.commitment_kind in ("loan", "installment"):
            return "protected"
        return self.adjustability or "undecided"


def _clean(value: str | None, allowed: tuple[str, ...]) -> str | None:
    return value if value in allowed else None


def map_legacy_classification(
    *,
    loan_linked: bool,
    installment_linked: bool,
    cost_kind: str | None,
    fixed_cost_necessity: str | None,
    spend_necessity: str | None,
    recurring_payment_kind: str | None,
) -> LegacyNature:
    """Map one expense transaction's existing classification to the two axes."""
    kind = _clean(cost_kind, ("fixed", "variable"))
    fixed_necessity = _clean(fixed_cost_necessity, ("essential", "discretionary"))
    necessity_value = _clean(spend_necessity, ("essential", "discretionary"))
    recurring = _clean(
        recurring_payment_kind, ("monthly_recurring", "installment", "not_recurring")
    )

    conflict = False
    if kind == "fixed":
        if (
            fixed_necessity is not None
            and necessity_value is not None
            and fixed_necessity != necessity_value
        ):
            conflict = True
            necessity = None
        else:
            necessity = fixed_necessity or necessity_value
    else:
        necessity = necessity_value
    adjustability = _NECESSITY_TO_ADJUSTABILITY.get(necessity or "")

    def nature(
        row: str,
        commitment: CommitmentKind | None,
        *,
        link_unconfirmed: bool = False,
    ) -> LegacyNature:
        return LegacyNature(
            mapping_row=row,
            commitment_kind=commitment,
            adjustability=adjustability,
            installment_link_unconfirmed=link_unconfirmed,
            necessity_conflict=conflict,
        )

    if loan_linked:
        return nature("loan_linked", "loan")
    if installment_linked:
        return nature("installment_linked", "installment")
    if recurring == "installment":
        return nature("installment_kind_unlinked", None, link_unconfirmed=True)
    if kind == "fixed":
        if recurring == "not_recurring":
            return nature("fixed_not_recurring", None)
        if conflict:
            return nature("fixed_necessity_conflict", "recurring")
        row = {
            "protected": "fixed_essential",
            "adjustable": "fixed_discretionary",
        }.get(adjustability or "", "fixed_necessity_empty")
        return nature(row, "recurring")
    if kind == "variable":
        if recurring == "monthly_recurring":
            return nature("variable_monthly_recurring", "recurring")
        row = {
            "protected": "variable_essential",
            "adjustable": "variable_discretionary",
        }.get(adjustability or "", "variable_necessity_empty")
        return nature(row, None)
    if recurring == "monthly_recurring":
        return nature("monthly_recurring_no_cost_kind", "recurring")
    if adjustability is not None:
        return nature("no_cost_kind_with_necessity", None)
    return nature("unclassified", None)
