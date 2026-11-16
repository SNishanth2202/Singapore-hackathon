import { lazy } from 'react'
import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const CompanyIntelligence = lazy(() => import('./pages/CompanyIntelligence'))
const CompanyProfile = lazy(() => import('./pages/CompanyProfile'))
const CustomerGraph = lazy(() => import('./pages/CustomerGraph'))
const OpportunityIntelligence = lazy(() => import('./pages/OpportunityIntelligence'))
const LeadRankingQueue = lazy(() => import('./pages/RealLeadRanking'))
const ReferenceRanking = import.meta.env.DEV ? lazy(() => import('./pages/LeadRankingQueue')) : null
const Settings = lazy(() => import('./pages/Settings'))
const SalesWorkbench = lazy(() => import('./pages/SalesWorkbench'))
const SalesWorkflowPage = lazy(() => import('./pages/SalesWorkflowPage'))
const KnowledgeGraph = lazy(() => import('./pages/KnowledgeGraph'))
const AiManagementPage = lazy(() => import('./pages/AiManagementPage'))
const AiCompanyPage = lazy(() => import('./pages/AiCompanyPage'))
const CrmAccounts = lazy(() => import('./pages/CrmAccounts'))
const CustomerPortfolio = lazy(() => import('./pages/CustomerPortfolio'))

function LegacyCustomerGraph() {
  const { search } = useLocation()
  return <Navigate to={`/graph${search}`} replace />
}

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/lead-ranking" element={<LeadRankingQueue />} />
          {ReferenceRanking && <Route path="/lead-ranking/reference" element={<ReferenceRanking />} />}
          <Route path="/sales" element={<SalesWorkbench />} />
          <Route path="/crm" element={<CustomerPortfolio />} />
          <Route path="/crm/records" element={<CrmAccounts />} />
          <Route path="/crm/records/:accountId" element={<CrmAccounts />} />
          <Route path="/crm/:accountId" element={<CustomerPortfolio />} />
          <Route path="/service-opportunities" element={<OpportunityIntelligence />} />
          <Route path="/sales/companies/:companyId" element={<SalesWorkflowPage />} />
          <Route path="/ai-management" element={<AiManagementPage />} />
          <Route path="/ai-management/companies/:companyId" element={<AiCompanyPage />} />
          <Route path="/opportunities" element={<Navigate to="/lead-ranking" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/companies" element={<CompanyIntelligence />} />
          <Route path="/companies/:id" element={<CompanyProfile />} />
          <Route path="/graph" element={<CustomerGraph />} />
          <Route path="/research-graph" element={<KnowledgeGraph />} />
          <Route path="/customer-graph" element={<LegacyCustomerGraph />} />
          <Route path="/customer-360" element={<LegacyCustomerGraph />} />
          <Route path="/legacy-opportunities" element={<OpportunityIntelligence />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
