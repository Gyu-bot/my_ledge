from sqlalchemy import MetaData

from app.services.canonical_views import CANONICAL_VIEWS, SchemaColumnDefinition
from app.schemas.schema_doc import (
    SchemaColumnResponse,
    SchemaDocumentResponse,
    SchemaRelationResponse,
)

RAW_TABLE_DESCRIPTIONS = {
    "asset_source_runs": "Append-only source sync runs. Only success_complete whole-account runs are selectable; valuation and ingestion times are distinct. BankSalad account keys are broker groups, not verified account IDs.",
    "asset_source_observations": "Immutable asset, investment and loan evidence. Raw audit rows are not additive canonical totals; use GET /assets/source-coverage or /investments/selected for selection and conflicts.",
    "asset_source_mappings": "Explicit confirmed mapping of one complete BankSalad broker group to a Toss account; stable asset component keys and cash scope gate current net-worth replacement.",
    "asset_source_policy_revisions": "Append-only confirmed source policy revisions with actor/reason. Policies affect selected estimates; historical BankSalad snapshot APIs remain unchanged.",
    "app_settings": (
        "Typed application settings. Analytics defaults are resolved from this table "
        "when request query parameters do not override them."
    ),
    "auto_classification_settings": (
        "Feature toggles for applying category and loan merchant auto-classification "
        "rules after workbook uploads."
    ),
    "category_classification_rules": (
        "Legacy/frozen category-to-cost-kind rules. No application writes "
        "or applies these rules; use /nature/category-defaults."
    ),
    "loan_merchant_rules": (
        "User-configurable exact merchant/description-to-loan-account rules for "
        "automatic loan repayment linking."
    ),
    "merchant_alias_rules": (
        "User-configurable raw-description alias patterns that write normalized "
        "analysis merchant values into transactions.merchant."
    ),
    "transactions": (
        "Raw transaction rows from imports and manual edits. Read directly for audit, "
        "debugging, or low-level data correction."
    ),
    "asset_snapshots": "Raw asset snapshot rows keyed by snapshot_date.",
    "investments": "Raw investment snapshot rows keyed by snapshot_date.",
    "loans": "Raw loan snapshot rows keyed by snapshot_date.",
    "loan_accounts": (
        "Stable loan account identities keyed by lender and product_name. "
        "Use this table to map transactions to a loan across multiple snapshots."
    ),
    "loan_transaction_links": (
        "Manual mapping between transactions and stable loan accounts, including "
        "principal/interest/mixed repayment type."
    ),
    "upload_logs": "Upload execution history and import result counters.",
    "recurring_commitments": (
        "T056 human-registered recurring-payment bundles (정기 지급). A 지출 "
        "belongs when merchant (merchant scope) and effective category match and "
        "its date is within start_date..end_date. Cycle, amount kind (fixed/"
        "variable), adjustability, and end are bundle attributes. Read resolved "
        "membership from vw_transaction_nature; write only via /api/v1/nature."
    ),
    "category_adjustability_defaults": (
        "T056 per-category adjustability default (protected/adjustable); a null "
        "category_minor covers the whole major category. Lowest precedence."
    ),
    "transaction_nature_overrides": (
        "T056 per-transaction inputs: adjustability (highest precedence), explicit "
        "bundle membership or exclusion, and migration flags "
        "(installment_link_unconfirmed, necessity_conflict). Not a resolved value; "
        "read vw_transaction_nature for the result."
    ),
    "transfer_purpose_rules": (
        "T061 human-registered transfer purpose defaults: match_scope merchant "
        "(exact merchant) or category (effective major, optional minor). purpose "
        "investment/savings/internal_move. Read the resolved value from "
        "vw_transfer_purpose; write only via /api/v1/transfer-purposes."
    ),
    "transfer_purpose_overrides": (
        "T061 per-transaction transfer purpose set by a human (highest "
        "precedence). Not a resolved value; read vw_transfer_purpose."
    ),
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
                        description=(
                            "legacy/frozen: 이전 분류 보관용. 입력·계산에 사용하지 않으며 삭제 예정."
                            if column.name
                            in {
                                "cost_kind",
                                "fixed_cost_necessity",
                                "spend_necessity",
                                "cost_classification_source",
                                "recurring_payment_kind",
                            }
                            else "이전 수동 분류 편집 이력. is_edited에만 사용하며 새 분류 입력이 아니다."
                            if column.name == "legacy_classification_edited"
                            else "사람이 이행 약정의 주기·금액을 확인한 시각. 이행 출처이고 null이면 확인 대기."
                            if column.name == "attributes_confirmed_at"
                            else None
                        ),
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
        SchemaColumnResponse(
            name=column.name, type=str(column.type), nullable=column.nullable
        )
        for column in columns
    ]
