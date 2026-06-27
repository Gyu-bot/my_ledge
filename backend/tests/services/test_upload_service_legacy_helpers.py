from io import BytesIO

from app.models.transaction import Transaction
from app.parsers.transactions import TransactionRow, parse_transactions
from openpyxl import load_workbook


def parse_transactions_from_bytes(sample_workbook_bytes: bytes) -> list[TransactionRow]:
    workbook = load_workbook(BytesIO(sample_workbook_bytes), data_only=True)
    return parse_transactions(workbook)


def transaction_conditions(row: TransactionRow) -> tuple:
    category_minor = row["category_minor"]
    payment_method = row["payment_method"]
    return (
        Transaction.date == row["date"],
        Transaction.time == row["time"],
        Transaction.type == row["type"],
        Transaction.category_major == row["category_major"],
        Transaction.category_minor.is_(None)
        if category_minor is None
        else Transaction.category_minor == category_minor,
        Transaction.description == row["description"],
        Transaction.amount == row["amount"],
        Transaction.currency == row["currency"],
        Transaction.payment_method.is_(None)
        if payment_method is None
        else Transaction.payment_method == payment_method,
    )
