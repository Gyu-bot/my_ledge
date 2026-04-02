from io import BytesIO

from openpyxl import load_workbook

from app.parsers.transactions import parse_transactions


def test_parse_transactions_extracts_normalized_rows(
    sample_workbook_bytes: bytes,
) -> None:
    workbook = load_workbook(BytesIO(sample_workbook_bytes), data_only=True)

    parsed = parse_transactions(workbook)

    assert len(parsed) == 2219
    assert parsed[0] == {
        "date": workbook["가계부 내역"]["A2"].value.date(),
        "time": workbook["가계부 내역"]["B2"].value,
        "type": "지출",
        "category_major": "주거/통신",
        "category_minor": "미분류",
        "description": "SK텔레콤-자동납부",
        "merchant": "SK텔레콤-자동납부",
        "amount": -106600,
        "currency": "KRW",
        "payment_method": "(구)KB국민 My WE:SH(마이 위시) 카드",
        "memo": None,
    }


def test_parse_transactions_preserves_positive_expense_amounts(
    sample_workbook_bytes: bytes,
) -> None:
    workbook = load_workbook(BytesIO(sample_workbook_bytes), data_only=True)

    parsed = parse_transactions(workbook)

    assert parsed[4]["amount"] == 1507
    assert parsed[4]["type"] == "지출"
