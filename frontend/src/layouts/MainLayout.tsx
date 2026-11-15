import { Outlet, useLocation } from 'react-router-dom'
import { PageLayout } from '../components/layout/PageLayout'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/companies': 'Company Intelligence',
  '/graph': 'Knowledge Graph',
  '/dashboard': 'Dashboard',
  '/lead-ranking': 'Lead Ranking',
  '/opportunities': 'Lead Ranking',
  '/legacy-opportunities': 'Opportunity Intelligence',
  '/settings': 'Settings',
}

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  if (pathname.startsWith('/companies/')) return 'Company Profile'
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
