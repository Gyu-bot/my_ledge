from app.models import Base


def test_expected_tables_exist() -> None:
    table_names = set(Base.metadata.tables)

    assert table_names == {
        "transactions",
        "asset_snapshots",
        "investments",
        "loans",
        "upload_logs",
    }
