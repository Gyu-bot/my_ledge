from io import BytesIO

from openpyxl import load_workbook

from app.parsers.snapshots import parse_snapshots


def test_parse_snapshots_extracts_marker_based_sections(
    sample_workbook_bytes: bytes,
) -> None:
    workbook = load_workbook(BytesIO(sample_workbook_bytes), data_only=True)

    parsed = parse_snapshots(workbook)

    assert len(parsed.asset_snapshots) == 42
    assert len(parsed.insurance_contracts) == 2
    assert len(parsed.investments) == 9
    assert len(parsed.loans) == 4
    assert len(parsed.cashflow_benchmarks) == 351
    assert parsed.user_profile == {
        "gender": "남",
        "age": 39,
        "credit_score_kcb": 996,
    }
    assert parsed.asset_snapshots[0] == {
        "side": "asset",
        "category": "자유입출금 자산",
        "product_name": "KB국민ONE통장-저축예금",
        "amount": 266918,
    }
    assert parsed.asset_snapshots[40] == {
        "side": "liability",
        "category": "장기대출",
        "product_name": "신용대출",
        "amount": 16735249,
    }
    assert (
        parsed.investments[0]["product_name"]
        == "미래에셋합리적인AI글로벌모멘텀혼합자산자투자신탁[재간접형]"
    )
    assert parsed.insurance_contracts[0] == {
        "insurer": "DB손해보험",
        "product_name": "다이렉트 실손의료비보험1804(CM)",
        "contract_status": "정상",
        "total_paid": 0,
        "contract_date": parsed.insurance_contracts[0]["contract_date"],
        "maturity_date": parsed.insurance_contracts[0]["maturity_date"],
    }
    assert {
        "period": "2026-02",
        "transaction_type": "수입",
        "category_major": "보험금",
        "amount": 33500,
    } in parsed.cashflow_benchmarks
    assert {
        "period": "2026-04",
        "transaction_type": "지출",
        "category_major": "보험",
        "amount": 127662,
    } in parsed.cashflow_benchmarks
    assert parsed.loans[-1]["product_name"] == "우리은행 마이너스 통장"
