from io import BytesIO

from openpyxl import load_workbook

from app.parsers.snapshots import parse_snapshots


def test_parse_snapshots_extracts_marker_based_sections(
    sample_workbook_bytes: bytes,
) -> None:
    workbook = load_workbook(BytesIO(sample_workbook_bytes), data_only=True)

    parsed = parse_snapshots(workbook)

    assert len(parsed.asset_snapshots) == 45
    assert len(parsed.investments) == 11
    assert len(parsed.loans) == 5
    assert parsed.asset_snapshots[0] == {
        "side": "asset",
        "category": "자유입출금 자산",
        "product_name": "KB국민ONE통장-저축예금",
        "amount": 6988580,
    }
    assert parsed.asset_snapshots[40] == {
        "side": "liability",
        "category": "장기대출",
        "product_name": "KB 주택담보대출_혼합(구입)",
        "amount": 171195456,
    }
    assert parsed.investments[0]["product_name"] == "미래에셋합리적인AI글로벌모멘텀혼합자산자투자신탁[재간접형]"
    assert parsed.loans[-1]["product_name"] == "우리은행 마이너스 통장"
