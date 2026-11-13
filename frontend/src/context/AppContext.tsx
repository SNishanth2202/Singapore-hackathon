import React, { createContext, useContext, useState, useCallback } from 'react'
import { Company, companiesService, PaginatedCompanies } from '../services/companies.service'
import { Opportunity, opportunitiesService, PaginatedOpportunities } from '../services/opportunities.service'

interface AppState {
  // Companies
  companies: Company[]
  companiesTotal: number
  companiesLoading: boolean
  companiesError: string | null
  companiesMockData: boolean
  // Opportunities
  opportunities: Opportunity[]
  opportunitiesTotal: number
  opportunitiesLoading: boolean
  opportunitiesError: string | null
  opportunitiesMockData: boolean
}

interface AppContextValue extends AppState {
  fetchCompanies: (filters?: Parameters<typeof companiesService.getCompanies>[0]) => Promise<PaginatedCompanies>
  fetchOpportunities: (filters?: Parameters<typeof opportunitiesService.getOpportunities>[0]) => Promise<PaginatedOpportunities>
  clearCompaniesError: () => void
  clearOpportunitiesError: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>({
    companies: [],
    companiesTotal: 0,
    companiesLoading: false,
    companiesError: null,
    companiesMockData: false,
    opportunities: [],
    opportunitiesTotal: 0,
    opportunitiesLoading: false,
    opportunitiesError: null,
    opportunitiesMockData: false,
  })

  const fetchCompanies = useCallback(async (filters?: Parameters<typeof companiesService.getCompanies>[0]) => {
    setState((s) => ({ ...s, companiesLoading: true, companiesError: null }))
    try {
      const result = await companiesService.getCompanies(filters)
      setState((s) => ({
        ...s,
        companies: result.data,
        companiesTotal: result.total,
        companiesLoading: false,
        companiesMockData: result.isMockData ?? false,
      }))
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load companies'
      setState((s) => ({ ...s, companiesLoading: false, companiesError: message }))
      throw err
    }
  }, [])

  const fetchOpportunities = useCallback(async (filters?: Parameters<typeof opportunitiesService.getOpportunities>[0]) => {
    setState((s) => ({ ...s, opportunitiesLoading: true, opportunitiesError: null }))
    try {
      const result = await opportunitiesService.getOpportunities(filters)
      setState((s) => ({
        ...s,
        opportunities: result.data,
        opportunitiesTotal: result.total,
        opportunitiesLoading: false,
        opportunitiesMockData: result.isMockData ?? false,
      }))
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load opportunities'
      setState((s) => ({ ...s, opportunitiesLoading: false, opportunitiesError: message }))
      throw err
    }
  }, [])

  const clearCompaniesError = useCallback(() => {
    setState((s) => ({ ...s, companiesError: null }))
  }, [])

  const clearOpportunitiesError = useCallback(() => {
    setState((s) => ({ ...s, opportunitiesError: null }))
  }, [])

  return (
    <AppContext.Provider
      value={{
        ...state,
        fetchCompanies,
        fetchOpportunities,
        clearCompaniesError,
        clearOpportunitiesError,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
