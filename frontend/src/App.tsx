import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import MainLayout from './layouts/MainLayout'
import Dashboard from './pages/Dashboard'
import CompanyIntelligence from './pages/CompanyIntelligence'
import CompanyProfile from './pages/CompanyProfile'
import CustomerGraph from './pages/CustomerGraph'
import OpportunityIntelligence from './pages/OpportunityIntelligence'
import LeadRankingQueue from './pages/LeadRankingQueue'
import Settings from './pages/Settings'
import SalesWorkbench from './pages/SalesWorkbench'
import SalesWorkflowPage from './pages/SalesWorkflowPage'
import KnowledgeGraph from './pages/KnowledgeGraph'
import AiManagementPage from './pages/AiManagementPage'
import AiCompanyPage from './pages/AiCompanyPage'

function LegacyCustomerGraph() {
  const { search } = useLocation()
  return <Navigate to={`/graph${search}`} replace />
}

function App() {
  return (
    <AppProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/lead-ranking" element={<LeadRankingQueue />} />
            <Route path="/sales" element={<SalesWorkbench />} />
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
    </AppProvider>
  )
}

export default App
