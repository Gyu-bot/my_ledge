import { createContext, useContext } from 'react'

interface ChromeContextValue {
  setMetaBadge: (badge: React.ReactNode) => void
}

export const ChromeContext = createContext<ChromeContextValue>({ setMetaBadge: () => {} })

export function useChromeContext() {
  return useContext(ChromeContext)
}
