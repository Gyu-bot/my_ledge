from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, TypedDict

from openpyxl import Workbook


class AssetSnapshotRow(TypedDict):
    side: Literal["asset", "liability"]
    category: str
    product_name: str
    amount: Decimal


class InvestmentRow(TypedDict):
    product_type: str | None
    broker: str | None
    product_name: str
    cost_basis: Decimal | None
    market_value: Decimal | None
    return_rate: Decimal | None


class LoanRow(TypedDict):
    loan_type: str | None
    lender: str | None
    product_name: str
    principal: Decimal | None
    balance: Decimal | None
    interest_rate: Decimal | None
    start_date: date | None
    maturity_date: date | None


class InsuranceContractRow(TypedDict):
    insurer: str
    product_name: str
    contract_status: str | None
    total_paid: Decimal | None
    contract_date: date | None
    maturity_date: date | None


class UserProfileRow(TypedDict):
    gender: str | None
    age: int | None
    credit_score_kcb: int | None


class CashflowBenchmarkRow(TypedDict):
    period: str
    transaction_type: Literal["수입", "지출"]
    category_major: str
    amount: Decimal


@dataclass(slots=True)
class SnapshotParseResult:
    asset_snapshots: list[AssetSnapshotRow]
    investments: list[InvestmentRow]
    loans: list[LoanRow]
    insurance_contracts: list[InsuranceContractRow] = field(default_factory=list)
    cashflow_benchmarks: list[CashflowBenchmarkRow] = field(default_factory=list)
    user_profile: UserProfileRow | None = None


def parse_snapshots(workbook: Workbook) -> SnapshotParseResult:
    worksheet = workbook["뱅샐현황"]
    rows = list(worksheet.iter_rows(values_only=True))

    asset_marker = find_table_start(rows, "3.재무현황")
    insurance_marker = find_table_start(rows, "4.보험현황")
    investment_marker = find_table_start(rows, "5.투자현황")
    loan_marker = find_table_start(rows, "6.대출현황")

    return SnapshotParseResult(
        asset_snapshots=_parse_asset_snapshots(
            rows, asset_marker + 4, investment_marker
        ),
        insurance_contracts=_parse_insurance_contracts(
            rows, insurance_marker + 3, investment_marker
        ),
        investments=_parse_investments(rows, investment_marker + 3, loan_marker),
        loans=_parse_loans(rows, loan_marker + 3),
        cashflow_benchmarks=_parse_cashflow_benchmarks(rows, asset_marker),
        user_profile=_parse_user_profile(rows),
    )


def _parse_user_profile(rows: list[tuple[object, ...]]) -> UserProfileRow | None:
    try:
        marker = find_table_start(rows, "1.고객정보")
    except ValueError:
        return None
    for row in rows[marker + 1 :]:
        if len(row) > 1 and isinstance(row[1], str) and row[1].startswith("2."):
            return None
        if len(row) < 5:
            continue
        gender = _optional_str(row[2])
        if gender == "성별":
            continue
        age = _optional_int(row[3])
        credit_score_kcb = _optional_int(row[4])
        if gender is None and age is None and credit_score_kcb is None:
            continue
        return {
            "gender": gender,
            "age": age,
            "credit_score_kcb": credit_score_kcb,
        }
    return None


def find_table_start(rows: list[tuple[object, ...]], marker: str) -> int:
    for index, row in enumerate(rows):
        if len(row) > 1 and row[1] and str(row[1]).strip() == marker:
            return index
    raise ValueError(f"Missing marker: {marker}")


def _parse_asset_snapshots(
    rows: list[tuple[object, ...]],
    start_row: int,
    end_row: int,
) -> list[AssetSnapshotRow]:
    assets: list[AssetSnapshotRow] = []
    liabilities: list[AssetSnapshotRow] = []
    last_asset_category: str | None = None
    last_liability_category: str | None = None

    for row in rows[start_row:end_row]:
        if isinstance(row[1], str) and row[1].startswith("4."):
            break

        asset_category = _optional_str(row[1])
        liability_category = _optional_str(row[5])
        if asset_category:
            last_asset_category = asset_category
        if liability_category:
            last_liability_category = liability_category

        if row[2] is not None and _is_number(row[4]) and last_asset_category:
            assets.append(
                {
                    "side": "asset",
                    "category": last_asset_category,
                    "product_name": str(row[2]),
                    "amount": _to_decimal(row[4]),
                }
            )

        if row[6] is not None and _is_number(row[8]) and last_liability_category:
            liabilities.append(
                {
                    "side": "liability",
                    "category": last_liability_category,
                    "product_name": str(row[6]),
                    "amount": _to_decimal(row[8]),
                }
            )

    return assets + liabilities


def _parse_investments(
    rows: list[tuple[object, ...]],
    start_row: int,
    end_row: int,
) -> list[InvestmentRow]:
    parsed: list[InvestmentRow] = []
    for row in rows[start_row:end_row]:
        if row[1] in {None, "총계"}:
            continue
        parsed.append(
            {
                "product_type": _optional_str(row[1]),
                "broker": _optional_str(row[2]),
                "product_name": str(row[3]),
                "cost_basis": _optional_decimal(row[5]),
                "market_value": _optional_decimal(row[6]),
                "return_rate": _optional_decimal(row[7]),
            }
        )
    return parsed


def _parse_insurance_contracts(
    rows: list[tuple[object, ...]],
    start_row: int,
    end_row: int,
) -> list[InsuranceContractRow]:
    parsed: list[InsuranceContractRow] = []
    for row in rows[start_row:end_row]:
        insurer = _optional_str(row[1])
        if insurer in {None, "총계"}:
            continue
        product_name = _optional_str(row[2])
        if product_name is None:
            continue
        parsed.append(
            {
                "insurer": insurer,
                "product_name": product_name,
                "contract_status": _optional_str(row[4]),
                "total_paid": _optional_decimal(row[5]),
                "contract_date": _optional_date(row[6]),
                "maturity_date": _optional_date(row[7]),
            }
        )
    return parsed


def _parse_loans(
    rows: list[tuple[object, ...]],
    start_row: int,
) -> list[LoanRow]:
    parsed: list[LoanRow] = []
    for row in rows[start_row:]:
        if row[1] in {None, "총계"}:
            continue
        parsed.append(
            {
                "loan_type": _optional_str(row[1]),
                "lender": _optional_str(row[2]),
                "product_name": str(row[3]),
                "principal": _optional_decimal(row[5]),
                "balance": _optional_decimal(row[6]),
                "interest_rate": _optional_decimal(row[7]),
                "start_date": _optional_date(row[8]),
                "maturity_date": _optional_date(row[9]),
            }
        )
    return parsed


def _parse_cashflow_benchmarks(
    rows: list[tuple[object, ...]],
    end_row: int,
) -> list[CashflowBenchmarkRow]:
    try:
        marker = find_table_start(rows, "2.현금흐름현황")
    except ValueError:
        return []

    header_row: tuple[object, ...] | None = None
    header_index = marker
    for index, row in enumerate(rows[marker:end_row], start=marker):
        if _optional_str(row[1]) == "항목":
            header_row = row
            header_index = index
            break
    if header_row is None:
        return []

    month_columns = [
        (index, str(value))
        for index, value in enumerate(header_row)
        if _is_month_label(value)
    ]
    parsed: list[CashflowBenchmarkRow] = []
    transaction_type: Literal["수입", "지출"] = "수입"
    for row in rows[header_index + 1 : end_row]:
        label = _optional_str(row[1])
        if label is None:
            continue
        if label == "월수입 총계":
            transaction_type = "지출"
            continue
        if label in {"월지출 총계", "순수입 총계"}:
            continue
        for column_index, period in month_columns:
            value = row[column_index] if column_index < len(row) else None
            if value is None or not _is_number(value):
                continue
            parsed.append(
                {
                    "period": period,
                    "transaction_type": transaction_type,
                    "category_major": label,
                    "amount": _to_decimal(value),
                }
            )
    return parsed


def _to_decimal(value: object) -> Decimal:
    return Decimal(str(value))


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float, Decimal))


def _is_month_label(value: object) -> bool:
    if not isinstance(value, str):
        return False
    parts = value.split("-")
    if len(parts) != 2:
        return False
    year, month = parts
    return len(year) == 4 and year.isdigit() and month.isdigit()


def _optional_decimal(value: object) -> Decimal | None:
    if value is None:
        return None
    return _to_decimal(value)


def _optional_date(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raise TypeError(f"Unsupported date value: {value!r}")


def _optional_str(value: object) -> str | None:
    if value is None:
        return None
    return str(value)


def _optional_int(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(text)
    except ValueError:
        return None
