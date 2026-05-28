import { useQuery } from '@tanstack/react-query'
import { schemaApi } from '../api/schema'

export function useSchemaDocument() {
  return useQuery({
    queryKey: ['schema'],
    queryFn: () => schemaApi.getSchema(),
  })
}
