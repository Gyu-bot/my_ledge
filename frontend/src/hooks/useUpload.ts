import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { uploadApi } from '../api/upload'
import type { DataResetScope, UploadApplySelection } from '../types/upload'

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

export function useUploadPreview() {
  return useMutation({
    mutationFn: ({ file, snapshotDate }: { file: File; snapshotDate: string }) =>
      uploadApi.preview(file, snapshotDate),
  })
}

export function useApplyUploadPreview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      file,
      snapshotDate,
      selections,
    }: {
      file: File
      snapshotDate: string
      selections: readonly UploadApplySelection[]
    }) => uploadApi.apply(file, snapshotDate, selections),
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
