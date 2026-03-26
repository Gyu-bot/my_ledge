from typing import Literal

from pydantic import BaseModel


class SchemaColumnResponse(BaseModel):
    name: str
    type: str
    nullable: bool


class SchemaRelationResponse(BaseModel):
    name: str
    kind: Literal["table", "view"]
    description: str | None = None
    recommended_for_ai: bool = False
    columns: list[SchemaColumnResponse]


class SchemaDocumentResponse(BaseModel):
    tables: list[SchemaRelationResponse]
    views: list[SchemaRelationResponse] = []
