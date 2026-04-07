import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { uploadApi } from '../api/upload'
import type { DataResetScope } from '../types/upload'

export function useUploadLogs(limit = 10) {
  return useQuery({
    queryKey: ['upload', 'logs', limit],
    queryFn: () => uploadApi.logs(limit),
  })
}

export function useUploadFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, snapshotDate }: { file: File; snapshotDate: string }) =>
      uploadApi.upload(file, snapshotDate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['upload'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['analytics'] })
    },
  })
}

export function useResetData() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scope: DataResetScope) => uploadApi.reset(scope),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['analytics'] })
    },
  })
}
