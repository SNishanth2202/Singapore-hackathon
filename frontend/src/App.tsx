import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import MainLayout from './layouts/MainLayout'
import Dashboard from './pages/Dashboard'
import CompanyIntelligence from './pages/CompanyIntelligence'
import CompanyProfile from './pages/CompanyProfile'
import KnowledgeGraph from './pages/KnowledgeGraph'
import OpportunityIntelligence from './pages/OpportunityIntelligence'
import LeadRankingQueue from './pages/LeadRankingQueue'
import Settings from './pages/Settings'
import SalesWorkbench from './pages/SalesWorkbench'
import SalesWorkflowPage from './pages/SalesWorkflowPage'

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/lead-ranking" element={<LeadRankingQueue />} />
            <Route path="/sales" element={<SalesWorkbench />} />
            <Route path="/sales/companies/:companyId" element={<SalesWorkflowPage />} />
            <Route path="/opportunities" element={<Navigate to="/lead-ranking" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/companies" element={<CompanyIntelligence />} />
            <Route path="/companies/:id" element={<CompanyProfile />} />
            <Route path="/graph" element={<KnowledgeGraph />} />
            <Route path="/legacy-opportunities" element={<OpportunityIntelligence />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}

export default App
