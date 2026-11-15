import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeftIcon,
  GlobeIcon,
  MapPinIcon,
  CalendarIcon,
  UsersIcon,
  LayersIcon,
  ZapIcon,
  TargetIcon,
  ExternalLinkIcon,
  BuildingIcon,
} from 'lucide-react'
import { companiesService, CompanyWithSignals } from '../services/companies.service'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { ErrorState } from '../components/ui/ErrorState'
import { Badge } from '../components/ui/Badge'
import CompanyAnalysis from '../components/CompanyAnalysis'
import { formatDate, formatNumber, formatConfidence, truncate } from '../utils/formatters'

interface ProfileFieldProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
}

function ProfileField({ icon: Icon, label, value }: ProfileFieldProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center">
        <Icon className="w-3.5 h-3.5 text-gray-400" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
        <p className="text-sm text-gray-800 mt-0.5 font-medium">{value ?? '—'}</p>
      </div>
    </div>
  )
}

export default function CompanyProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [company, setCompany] = useState<(CompanyWithSignals & { isMockData?: boolean }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchCompany() {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const data = await companiesService.getCompanyById(id)
      setCompany(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load company')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchCompany()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoadingSpinner label="Loading company profile…" />
  if (error) return <ErrorState message={error} onRetry={fetchCompany} />
  if (!company) return <ErrorState title="Company not found" message="The requested company could not be found." />

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Back */}
      <button
        onClick={() => navigate('/companies')}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-navy-600 transition-colors group"
      >
        <ArrowLeftIcon className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Company Intelligence
      </button>

      {/* Company Card */}
      <div className="card overflow-hidden">
        {/* Top accent bar */}
        <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #1E3A5F, #0D9488)' }} />

        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm"
                style={{ background: 'linear-gradient(135deg, #1E3A5F 0%, #2D5080 100%)' }}
              >
                <span className="text-2xl font-bold text-white">
                  {company.companyName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-gray-900">{company.companyName}</h1>
                  {company.isMockData && <Badge label="Demo" variant="sample" />}
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {company.industry && <Badge label={company.industry} variant="industry" />}
                  {company.companyStage && (
                    <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
                      {company.companyStage}
                    </span>
                  )}
                  {company.country && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <GlobeIcon className="w-3 h-3" />
                      {company.country}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors"
              >
                <ExternalLinkIcon className="w-3.5 h-3.5" />
                Website
              </a>
            )}
          </div>

          {company.description && (
            <p className="text-sm text-gray-600 leading-relaxed mb-5 pb-5 border-b border-gray-100">
              {company.description}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <ProfileField icon={MapPinIcon} label="Country" value={company.country} />
            <ProfileField icon={BuildingIcon} label="Headquarters" value={company.headquarters} />
            <ProfileField icon={CalendarIcon} label="Founded" value={formatDate(company.foundedDate)} />
            <ProfileField icon={UsersIcon} label="Employees" value={company.employeeCount ? formatNumber(company.employeeCount) : undefined} />
            <ProfileField icon={LayersIcon} label="Stage" value={company.companyStage} />
            <ProfileField icon={GlobeIcon} label="Registration #" value={company.registrationNumber} />
          </div>
        </div>
      </div>

      {/* AI Analysis */}
      <CompanyAnalysis key={company._id} companyId={company._id} />

      {/* Intelligence Signals */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
            <ZapIcon className="w-4 h-4 text-teal-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Intelligence Signals</h2>
            <p className="text-xs text-gray-400">{company.signals?.length ?? 0} signal{(company.signals?.length ?? 0) !== 1 ? 's' : ''} detected</p>
          </div>
        </div>

        {!company.signals || company.signals.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <ZapIcon className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-500">No signals detected yet</p>
            <p className="text-xs text-gray-400 mt-1">Signals are captured as the system monitors data sources.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {company.signals.map((sig) => (
              <li key={sig._id} className="flex gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-teal-200 transition-colors">
                <div className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center">
                  <ZapIcon className="w-3.5 h-3.5 text-teal-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge label={sig.signalType} variant="default" />
                    <span className="text-xs text-gray-400">{formatDate(sig.detectedAt)}</span>
                    <span className="ml-auto text-xs font-semibold text-teal-700">
                      {company.isMockData ? 'Demo signal' : `${formatConfidence(sig.confidenceScore)} confidence`}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mt-2 leading-relaxed">{truncate(sig.description, 160)}</p>
                  {sig.source && <p className="text-xs text-gray-400 mt-1">Source: {sig.source}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Linked Opportunities */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-navy-50 flex items-center justify-center">
            <TargetIcon className="w-4 h-4 text-navy-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Linked Opportunities</h2>
            <p className="text-xs text-gray-400">
              {company.opportunities?.length ?? 0} opportunit{(company.opportunities?.length ?? 0) !== 1 ? 'ies' : 'y'}
            </p>
          </div>
        </div>

        {!company.opportunities || company.opportunities.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <TargetIcon className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-500">No linked opportunities yet</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {company.opportunities.map((opp) => (
              <li key={opp._id} className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-navy-200 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">
                      {opp.potentialService ?? opp.opportunityType ?? 'Opportunity'}
                    </span>
                    <Badge label={opp.priority} variant="priority" value={opp.priority} />
                    <Badge label={opp.status.replace('_', ' ')} variant="status" value={opp.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs font-semibold text-teal-700">
                      {formatConfidence(opp.confidenceScore)} confidence
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(opp.createdAt)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
