import { useDataStatus } from '@/services/dataLoader'

/** True only while the database is being loaded. Pages are mounted after the first load, so this is normally false. */
export function usePageLoading() {
  return useDataStatus().state === 'loading'
}
