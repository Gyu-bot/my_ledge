export interface TransactionRecord {
  id: number;
  date: string;
  time: string;
  type: string;
  effectiveCategoryMajor: string;
  effectiveCategoryMinor: string | null;
  description: string;
  amount: number;
  paymentMethod: string | null;
  isEdited: boolean;
}

export interface TransactionListResponse {
  total: number;
  page: number;
  perPage: number;
  items: TransactionRecord[];
}
