from sqlalchemy import MetaData

from app.services.canonical_views import CANONICAL_VIEWS, SchemaColumnDefinition
from app.schemas.schema_doc import (
    SchemaColumnResponse,
    SchemaDocumentResponse,
    SchemaRelationResponse,
)

RAW_TABLE_DESCRIPTIONS = {
    "transactions": (
        "Raw transaction rows from imports and manual edits. Read directly for audit, "
        "debugging, or low-level data correction."
    ),
    "asset_snapshots": "Raw asset snapshot rows keyed by snapshot_date.",
    "investments": "Raw investment snapshot rows keyed by snapshot_date.",
    "loans": "Raw loan snapshot rows keyed by snapshot_date.",
    "upload_logs": "Upload execution history and import result counters.",
}


def build_schema_document(metadata: MetaData) -> SchemaDocumentResponse:
    tables = []
    for table in sorted(metadata.sorted_tables, key=lambda item: item.name):
        tables.append(
            SchemaRelationResponse(
                name=table.name,
                kind="table",
                description=RAW_TABLE_DESCRIPTIONS.get(table.name),
                columns=[
                    SchemaColumnResponse(
                        name=column.name,
                        type=str(column.type),
                        nullable=column.nullable,
                    )
                    for column in table.columns
                ],
            )
        )
    views = [
        SchemaRelationResponse(
            name=view.name,
            kind="view",
            description=view.description,
            recommended_for_ai=view.recommended_for_ai,
            columns=_serialize_defined_columns(view.columns),
        )
        for view in sorted(CANONICAL_VIEWS, key=lambda item: item.name)
    ]
    return SchemaDocumentResponse(tables=tables, views=views)


def _serialize_defined_columns(
    columns: tuple[SchemaColumnDefinition, ...],
) -> list[SchemaColumnResponse]:
    return [
        SchemaColumnResponse(name=column.name, type=str(column.type), nullable=column.nullable)
        for column in columns
    ]
