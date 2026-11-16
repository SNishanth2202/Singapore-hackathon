import { ReactNode, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Navbar } from './Navbar'

interface PageLayoutProps {
  title: string
  children: ReactNode
}

export function PageLayout({ title, children }: PageLayoutProps) {
  const { pathname } = useLocation()
  const content = useRef<HTMLElement>(null)
  useEffect(() => { content.current?.scrollTo({ top: 0, left: 0 }) }, [pathname])
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F8FAFC' }}>
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Navbar title={title} />
        <main ref={content} className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
