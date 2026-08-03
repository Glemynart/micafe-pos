'use client'

import { createContext, useContext } from 'react'

export type ModoOperacionPermitido = 'FISCAL' | 'DEMO'

const OnboardingAccessContext = createContext<ModoOperacionPermitido>('FISCAL')

export function OnboardingAccessProvider({
  modo,
  children,
}: {
  modo: ModoOperacionPermitido
  children: React.ReactNode
}) {
  return <OnboardingAccessContext.Provider value={modo}>{children}</OnboardingAccessContext.Provider>
}

export function useModoOperacionPermitido(): ModoOperacionPermitido {
  return useContext(OnboardingAccessContext)
}
