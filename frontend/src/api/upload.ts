import { apiRequest, getApiKeyHeaders } from './client';

export interface UploadResponse {
  status: string;
  upload_id: number;
  transactions: {
    total: number;
    new: number;
    skipped: number;
  };
  snapshots: {
    asset_snapshots: number;
    investments: number;
    loans: number;
  };
  error_message: string | null;
}

export interface UploadLogResponse {
  id: number;
  uploaded_at: string;
  filename: string | null;
  snapshot_date: string | null;
  tx_total: number | null;
  tx_new: number | null;
  tx_skipped: number | null;
  status: string | null;
  error_message: string | null;
}

export interface UploadLogListResponse {
  items: UploadLogResponse[];
}

interface UploadWorkbookParams {
  file: File;
  snapshot_date?: string;
}

export async function uploadWorkbook({
  file,
  snapshot_date,
}: UploadWorkbookParams): Promise<UploadResponse> {
  const formData = new FormData();
  formData.set('file', file);

  if (snapshot_date) {
    formData.set('snapshot_date', snapshot_date);
  }

  return apiRequest<UploadResponse>('/upload', {
    method: 'POST',
    body: formData,
    headers: getApiKeyHeaders(),
  });
}

export function getUploadLogs() {
  return apiRequest<UploadLogListResponse>('/upload/logs');
}
