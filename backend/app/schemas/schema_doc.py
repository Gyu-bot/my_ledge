from pydantic import BaseModel


class SchemaColumnResponse(BaseModel):
    name: str
    type: str
    nullable: bool


class SchemaTableResponse(BaseModel):
    name: str
    columns: list[SchemaColumnResponse]


class SchemaDocumentResponse(BaseModel):
    tables: list[SchemaTableResponse]
