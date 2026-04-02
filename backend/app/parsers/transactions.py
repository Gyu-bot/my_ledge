from datetime import date, datetime, time
from typing import TypedDict

from openpyxl import Workbook


class TransactionRow(TypedDict):
    date: date
    time: time
    type: str
    category_major: str
    category_minor: str | None
    description: str
    merchant: str
    amount: int
    currency: str
    payment_method: str | None
    memo: str | None


HEADER_MAP = {
    "날짜": "date",
    "시간": "time",
    "타입": "type",
    "대분류": "category_major",
    "소분류": "category_minor",
    "내용": "description",
    "금액": "amount",
    "화폐": "currency",
    "결제수단": "payment_method",
    "메모": "memo",
}


def parse_transactions(workbook: Workbook) -> list[TransactionRow]:
    worksheet = workbook["가계부 내역"]
    rows = worksheet.iter_rows(values_only=True)
    header = next(rows)
    normalized_header = [HEADER_MAP.get(str(value), str(value)) for value in header]

    parsed: list[TransactionRow] = []
    for row in rows:
        if row[0] is None:
            continue
        raw = dict(zip(normalized_header, row, strict=False))
        parsed.append(normalize_transaction_row(raw))
    return parsed


def normalize_transaction_row(raw: dict[str, object]) -> TransactionRow:
    description = str(raw["description"])
    return {
        "date": _to_date(raw["date"]),
        "time": _to_time(raw["time"]),
        "type": str(raw["type"]),
        "category_major": str(raw["category_major"]),
        "category_minor": _optional_str(raw.get("category_minor")),
        "description": description,
        "merchant": description,
        "amount": int(raw["amount"]),
        "currency": str(raw["currency"] or "KRW"),
        "payment_method": _optional_str(raw.get("payment_method")),
        "memo": _optional_str(raw.get("memo")),
    }


def _to_date(value: object) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raise TypeError(f"Unsupported date value: {value!r}")


def _to_time(value: object) -> time:
    if isinstance(value, datetime):
        return value.time()
    if isinstance(value, time):
        return value
    raise TypeError(f"Unsupported time value: {value!r}")


def _optional_str(value: object) -> str | None:
    if value is None:
        return None
    return str(value)
