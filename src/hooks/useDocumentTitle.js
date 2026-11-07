import { useEffect } from 'react'

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Cricket Academy` : 'Cricket Academy Management'
  }, [title])
}
