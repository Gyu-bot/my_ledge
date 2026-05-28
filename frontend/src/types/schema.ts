export interface SchemaColumn {
  name: string
  type: string
  nullable: boolean
}

export interface SchemaRelation {
  name: string
  kind: 'table' | 'view'
  description: string | null
  recommended_for_ai: boolean
  columns: SchemaColumn[]
}

export interface SchemaDocumentResponse {
  tables: SchemaRelation[]
  views: SchemaRelation[]
}
