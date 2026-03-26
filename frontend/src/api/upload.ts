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
