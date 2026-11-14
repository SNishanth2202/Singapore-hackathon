import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeftIcon,
  GlobeIcon,
  MapPinIcon,
  CalendarIcon,
  UsersIcon,
  LayersIcon,
  AlertCircleIcon,
  ZapIcon,
  TargetIcon,
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
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-800 mt-0.5">{value ?? '—'}</p>
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

  if (loading) return <LoadingSpinner label="Loading company profile..." />
  if (error) return <ErrorState message={error} onRetry={fetchCompany} />
  if (!company) return <ErrorState title="Company not found" message="The requested company could not be found." />

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate('/companies')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy-600 mb-6 transition-colors"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Back to Company Intelligence
      </button>

      {company.isMockData && (
        <div className="mb-5 flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <AlertCircleIcon className="w-4 h-4 flex-shrink-0" />
          <span><strong>Sample company data</strong> — Fictional scenario for the local preview. AI analysis is live.</span>
        </div>
      )}

      {/* Company Card */}
      <div className="card p-6 mb-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-navy-50 border border-navy-100 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl font-bold text-navy-600">
                {company.companyName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{company.companyName}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {company.industry && <Badge label={company.industry} variant="industry" />}
                {company.companyStage && <Badge label={company.companyStage} />}
              </div>
            </div>
          </div>
          {company.website && (
            <a
              href={company.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors"
            >
              <GlobeIcon className="w-3.5 h-3.5" />
              Website
            </a>
          )}
        </div>

        {company.description && (
          <p className="text-sm text-gray-600 leading-relaxed mb-5 pb-5 border-b border-gray-100">
            {company.description}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ProfileField icon={MapPinIcon} label="Country" value={company.country} />
          <ProfileField icon={MapPinIcon} label="Headquarters" value={company.headquarters} />
          <ProfileField
            icon={CalendarIcon}
            label="Founded"
            value={formatDate(company.foundedDate)}
          />
          <ProfileField
            icon={UsersIcon}
            label="Employees"
            value={company.employeeCount ? formatNumber(company.employeeCount) : undefined}
          />
          <ProfileField icon={LayersIcon} label="Stage" value={company.companyStage} />
          <ProfileField
            icon={GlobeIcon}
            label="Registration #"
            value={company.registrationNumber}
          />
        </div>
      </div>

      <CompanyAnalysis key={company._id} companyId={company._id} />

      {/* Intelligence Signals */}
      <div className="card p-6 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <ZapIcon className="w-5 h-5 text-teal-600" />
          <h2 className="text-base font-semibold text-gray-800">Intelligence Signals</h2>
          <span className="ml-auto text-xs text-gray-400">
            {company.signals?.length ?? 0} signal{(company.signals?.length ?? 0) !== 1 ? 's' : ''}
          </span>
        </div>

        {!company.signals || company.signals.length === 0 ? (
          <div className="text-center py-8">
            <ZapIcon className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No intelligence signals detected yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Signals are captured automatically as the system monitors data sources.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {company.signals.map((sig) => (
              <li key={sig._id} className="flex gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex-shrink-0 mt-0.5 w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center">
                  <ZapIcon className="w-3 h-3 text-teal-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge label={sig.signalType} />
                    <span className="text-xs text-gray-400">{formatDate(sig.detectedAt)}</span>
                    <span className="ml-auto text-xs font-medium text-teal-700">
                      {company.isMockData ? 'Demo signal' : `${formatConfidence(sig.confidenceScore)} confidence`}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mt-1">{truncate(sig.description, 160)}</p>
                  {sig.source && (
                    <p className="text-xs text-gray-400 mt-0.5">Source: {sig.source}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Linked Opportunities */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <TargetIcon className="w-5 h-5 text-navy-600" />
          <h2 className="text-base font-semibold text-gray-800">Linked Opportunities</h2>
          <span className="ml-auto text-xs text-gray-400">
            {company.opportunities?.length ?? 0} opportunit{(company.opportunities?.length ?? 0) !== 1 ? 'ies' : 'y'}
          </span>
        </div>

        {!company.opportunities || company.opportunities.length === 0 ? (
          <div className="text-center py-8">
            <TargetIcon className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No linked opportunities for this company yet.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {company.opportunities.map((opp) => (
              <li key={opp._id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">
                      {opp.potentialService ?? opp.opportunityType ?? 'Opportunity'}
                    </span>
                    <Badge label={opp.priority} variant="priority" value={opp.priority} />
                    <Badge label={opp.status.replace('_', ' ')} variant="status" value={opp.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-teal-700 font-medium">
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
