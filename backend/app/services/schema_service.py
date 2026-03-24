from sqlalchemy import MetaData

from app.schemas.schema_doc import (
    SchemaColumnResponse,
    SchemaDocumentResponse,
    SchemaTableResponse,
)


def build_schema_document(metadata: MetaData) -> SchemaDocumentResponse:
    tables = []
    for table in sorted(metadata.sorted_tables, key=lambda item: item.name):
        tables.append(
            SchemaTableResponse(
                name=table.name,
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
    return SchemaDocumentResponse(tables=tables)
