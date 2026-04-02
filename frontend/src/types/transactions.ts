export interface TransactionResponse {
  id: number;
  date: string;
  time: string;
  type: string;
  category_major: string;
  category_minor: string | null;
  category_major_user: string | null;
  category_minor_user: string | null;
  effective_category_major: string;
  effective_category_minor: string | null;
  description: string;
  merchant?: string | null;
  amount: number;
  currency: string;
  payment_method: string | null;
  cost_kind: string | null;
  fixed_cost_necessity: string | null;
  memo: string | null;
  is_deleted: boolean;
  merged_into_id: number | null;
  is_edited: boolean;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface TransactionCreateRequest {
  date: string;
  time: string;
  type: string;
  category_major: string;
  category_minor: string | null;
  description: string;
  merchant?: string | null;
  amount: number;
  payment_method: string | null;
  memo: string | null;
}

export interface TransactionUpdateRequest {
  category_major_user?: string | null;
  category_minor_user?: string | null;
  merchant?: string | null;
  memo?: string | null;
}

export interface TransactionListResponse {
  total: number;
  page: number;
  per_page: number;
  items: TransactionResponse[];
}

export interface TransactionSummaryItem {
  period: string;
  amount: number;
}

export interface TransactionSummaryResponse {
  items: TransactionSummaryItem[];
}

export interface CategorySummaryItem {
  category: string;
  amount: number;
}

export interface CategorySummaryResponse {
  items: CategorySummaryItem[];
}

export interface CategoryTimelineItem {
  period: string;
  category: string;
  amount: number;
}

export interface CategoryTimelineResponse {
  items: CategoryTimelineItem[];
}

export interface PaymentMethodSummaryItem {
  payment_method: string | null;
  amount: number;
}

export interface PaymentMethodSummaryResponse {
  items: PaymentMethodSummaryItem[];
}
