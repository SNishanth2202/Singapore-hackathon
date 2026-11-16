import { Outlet, useLocation } from 'react-router-dom'
import { PageLayout } from '../components/layout/PageLayout'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Singtel Scout',
  '/companies': 'Company Intelligence',
  '/crm': 'Customer CRM',
  '/service-opportunities': 'Service Opportunities',
  '/ai-management': 'AI Management',
  '/research-graph': 'Evidence Graph',
  '/lead-ranking/reference': 'Lead Ranking',
  '/graph': 'Knowledge Graph',
  '/customer-graph': 'Central Customer Graph Database',
  '/dashboard': 'Singtel Scout',
  '/lead-ranking': 'Lead Ranking',
  '/sales': 'Sales Workbench',
  '/opportunities': 'Lead Ranking',
  '/legacy-opportunities': 'Opportunity Intelligence',
  '/settings': 'Settings',
}

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  if (pathname.startsWith('/companies/')) return 'Company Profile'
  if (pathname.startsWith('/crm/')) return 'Customer Account'
  if (pathname.startsWith('/sales/companies/')) return 'Sales Workflow'
  if (pathname.startsWith('/ai-management/companies/')) return 'AI Account Management'
  return 'Singtel Scout'
}

export default function MainLayout() {
  const location = useLocation()
  const title = getPageTitle(location.pathname)

  return (
    <PageLayout title={title}>
      <Outlet />
    </PageLayout>
  )
}
