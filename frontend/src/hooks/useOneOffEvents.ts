import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { oneOffEventsApi } from '../api/oneOffEvents'
import type { OneOffEventInput } from '../types/oneOffEvents'

export function useOneOffEvents() {
  return useQuery({ queryKey: ['one-off-events', 'list'], queryFn: oneOffEventsApi.list })
}

export function useOneOffEvent(eventId: number | null) {
  return useQuery({
    queryKey: ['one-off-events', 'detail', eventId],
    queryFn: () => oneOffEventsApi.detail(eventId!),
    enabled: eventId !== null,
  })
}

export function useOneOffEventActions() {
  const client = useQueryClient()
  const invalidate = () => Promise.all(
    [
      ['one-off-events'], ['transactions'], ['metrics', 'monthly-flow'],
      ['metrics', 'comparison'], ['read'], ['canonical-views', 'month-projection'],
      ['spending-reference'], ['spending-limits'],
    ].map((queryKey) => client.invalidateQueries({ queryKey })),
  )
  const create = useMutation({ mutationFn: oneOffEventsApi.create, onSuccess: invalidate })
  const update = useMutation({
    mutationFn: ({ eventId, input }: { eventId: number; input: Partial<OneOffEventInput> }) =>
      oneOffEventsApi.update(eventId, input),
    onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: oneOffEventsApi.delete, onSuccess: invalidate })
  const editMembers = useMutation({
    mutationFn: ({ eventId, method, transactionIds }: { eventId: number; method: 'POST' | 'DELETE'; transactionIds: number[] }) =>
      oneOffEventsApi.editMembers(eventId, method, transactionIds),
    onSuccess: invalidate,
  })
  return { create, update, remove, editMembers }
}
