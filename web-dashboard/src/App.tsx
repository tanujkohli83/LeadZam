import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  LoaderCircle,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { ApiRequestError, checkBackendHealth, sendDialRequest } from './api';
import type { Lead, LeadRequestState } from './types';
import './App.css';

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
).replace(/\/+$/, '');

const MOCK_LEADS: Lead[] = [
  {
    id: 'rahul-sharma',
    name: 'Rahul Sharma',
    company: 'Aster Labs',
    phoneNumber: '+91 98765 43210',
    stage: 'Qualified',
    initials: 'RS',
    lastActivity: 'Follow-up due today',
    accent: 'coral',
  },
  {
    id: 'meera-iyer',
    name: 'Meera Iyer',
    company: 'Northstar Retail',
    phoneNumber: '+91 99887 12004',
    stage: 'Follow-up',
    initials: 'MI',
    lastActivity: 'Last contacted 2h ago',
    accent: 'blue',
  },
  {
    id: 'aditya-rao',
    name: 'Aditya Rao',
    company: 'Clearpath Finance',
    phoneNumber: '+91 98100 77882',
    stage: 'New lead',
    initials: 'AR',
    lastActivity: 'Added yesterday',
    accent: 'green',
  },
  {
    id: 'sana-khan',
    name: 'Sana Khan',
    company: 'Meridian Health',
    phoneNumber: '+91 98990 44551',
    stage: 'Proposal',
    initials: 'SK',
    lastActivity: 'Proposal viewed 4h ago',
    accent: 'violet',
  },
];

type HealthStatus = 'checking' | 'online' | 'offline';

const READY_STATE: LeadRequestState = {
  status: 'ready',
  message: 'Ready to send',
};

function stageClass(stage: Lead['stage']) {
  return stage.toLowerCase().replace(' ', '-');
}

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('checking');
  const [healthMessage, setHealthMessage] = useState('Checking backend connection…');
  const [requestStates, setRequestStates] = useState<Record<string, LeadRequestState>>({});
  const inFlightLeadIds = useRef(new Set<string>());

  const loadHealth = useCallback(async () => {
    setHealthStatus('checking');
    setHealthMessage('Checking backend connection…');

    try {
      await checkBackendHealth(API_BASE_URL);
      setHealthStatus('online');
      setHealthMessage('Backend online');
    } catch (error) {
      setHealthStatus('offline');
      setHealthMessage(
        error instanceof ApiRequestError
          ? error.message
          : 'Backend health check failed.',
      );
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const filteredLeads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return MOCK_LEADS;

    return MOCK_LEADS.filter((lead) =>
      [lead.name, lead.company, lead.phoneNumber, lead.stage].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [searchQuery]);

  const updateLeadState = (leadId: string, state: LeadRequestState) => {
    setRequestStates((current) => ({ ...current, [leadId]: state }));
  };

  const handleCall = async (lead: Lead) => {
    const currentState = requestStates[lead.id] || READY_STATE;
    if (currentState.status === 'sending' || inFlightLeadIds.current.has(lead.id)) return;

    inFlightLeadIds.current.add(lead.id);
    updateLeadState(lead.id, {
      status: 'sending',
      message: 'Sending request…',
    });

    try {
      await sendDialRequest(API_BASE_URL, lead.phoneNumber, lead.name);
      updateLeadState(lead.id, {
        status: 'accepted',
        message: 'Request accepted for sending.',
      });
    } catch (error) {
      updateLeadState(lead.id, {
        status: 'error',
        message:
          error instanceof ApiRequestError
            ? error.message
            : 'The request failed. Please try again.',
      });
    } finally {
      inFlightLeadIds.current.delete(lead.id);
    }
  };

  const acceptedCount = Object.values(requestStates).filter(
    ({ status }) => status === 'accepted',
  ).length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="LeadZam CRM home">
          <span className="brand-mark" aria-hidden="true">lz</span>
          <span>
            <strong>LeadZam</strong>
            <small>CRM workspace</small>
          </span>
        </a>

        <div className="topbar-actions">
          <div
            className={`health-pill health-pill--${healthStatus}`}
            role="status"
            aria-live="polite"
            title={healthMessage}
          >
            <span className="health-dot" aria-hidden="true" />
            <span>
              {healthStatus === 'checking'
                ? 'Checking connection'
                : healthStatus === 'online'
                  ? 'Backend online'
                  : 'Backend unavailable'}
            </span>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={() => void loadHealth()}
            aria-label="Refresh backend connection status"
            title="Refresh connection status"
          >
            <RefreshCw size={17} aria-hidden="true" />
          </button>
          <div className="user-avatar" aria-label="Signed in as Tanuj">T</div>
        </div>
      </header>

      <main id="top" className="page-content">
        <section className="intro-row" aria-labelledby="page-title">
          <div>
            <p className="eyebrow"><Activity size={14} aria-hidden="true" /> Sales overview</p>
            <h1 id="page-title">Good afternoon, Tanuj<span>.</span></h1>
            <p className="intro-copy">
              Keep your pipeline moving with quick, reliable conversations.
            </p>
          </div>
          <div className="date-card">
            <span className="date-label">Today</span>
            <strong>October 15, 2026</strong>
            <span className="date-meta"><Clock3 size={14} aria-hidden="true" /> Local workspace</span>
          </div>
        </section>

        <section className="summary-grid" aria-label="Pipeline summary">
          <SummaryCard
            icon={<Users size={19} aria-hidden="true" />}
            label="Open leads"
            value="24"
            detail="+12% from last week"
            tone="blue"
          />
          <SummaryCard
            icon={<ShieldCheck size={19} aria-hidden="true" />}
            label="Qualified"
            value="08"
            detail="Ready for a conversation"
            tone="green"
          />
          <SummaryCard
            icon={<Phone size={19} aria-hidden="true" />}
            label="Requests accepted"
            value={String(acceptedCount).padStart(2, '0')}
            detail="This dashboard session"
            tone="coral"
          />
        </section>

        <section className="content-grid">
          <div className="leads-panel panel" aria-labelledby="leads-title">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Your pipeline</p>
                <h2 id="leads-title">Recent leads</h2>
              </div>
              <div className="lead-count">{filteredLeads.length} shown</div>
            </div>

            <div className="toolbar">
              <label className="search-field">
                <Search size={17} aria-hidden="true" />
                <span className="sr-only">Search leads</span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search leads"
                />
                <kbd>⌘ K</kbd>
              </label>
              <button className="filter-button" type="button">
                All stages <ChevronRight size={15} aria-hidden="true" />
              </button>
            </div>

            <div className="lead-list">
              {filteredLeads.map((lead) => {
                const state = requestStates[lead.id] || READY_STATE;
                const isSending = state.status === 'sending';
                return (
                  <article className="lead-card" key={lead.id}>
                    <div className={`lead-avatar lead-avatar--${lead.accent}`} aria-hidden="true">
                      {lead.initials}
                    </div>
                    <div className="lead-info">
                      <div className="lead-heading">
                        <div>
                          <h3>{lead.name}</h3>
                          <p>{lead.company}</p>
                        </div>
                        <span className={`stage-badge stage-badge--${stageClass(lead.stage)}`}>
                          {lead.stage}
                        </span>
                      </div>
                      <div className="lead-meta">
                        <span><Phone size={14} aria-hidden="true" /> {lead.phoneNumber}</span>
                        <span><Clock3 size={14} aria-hidden="true" /> {lead.lastActivity}</span>
                      </div>
                      <div
                        className={`request-feedback request-feedback--${state.status}`}
                        role="status"
                        aria-live="polite"
                      >
                        {state.status === 'sending' && <LoaderCircle className="spin" size={15} aria-hidden="true" />}
                        {state.status === 'accepted' && <CheckCircle2 size={15} aria-hidden="true" />}
                        {state.status === 'error' && <AlertCircle size={15} aria-hidden="true" />}
                        {state.status === 'ready' && <span className="feedback-marker" aria-hidden="true" />}
                        <span>{state.message}</span>
                      </div>
                    </div>
                    <button
                      className={`call-button call-button--${state.status}`}
                      type="button"
                      onClick={() => void handleCall(lead)}
                      disabled={isSending}
                      aria-busy={isSending}
                      aria-label={isSending ? `Sending call request for ${lead.name}` : `Call ${lead.name}`}
                    >
                      {isSending ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <Phone size={17} aria-hidden="true" />}
                      <span>{isSending ? 'Sending' : 'Call'}</span>
                    </button>
                  </article>
                );
              })}
              {filteredLeads.length === 0 && (
                <div className="empty-state">
                  <Search size={22} aria-hidden="true" />
                  <strong>No leads found</strong>
                  <span>Try a different name, company, or stage.</span>
                </div>
              )}
            </div>
          </div>

          <aside className="workflow-panel panel" aria-labelledby="workflow-title">
            <div className="workflow-icon"><Phone size={20} aria-hidden="true" /></div>
            <p className="eyebrow">Click-to-call</p>
            <h2 id="workflow-title">A clear path from lead to call</h2>
            <p className="workflow-copy">
              Select a lead and we&apos;ll hand the request to your local backend. The Android app handles the final dialer step.
            </p>
            <ol className="workflow-steps">
              <li>
                <span className="step-number">1</span>
                <span><strong>Choose a lead</strong><small>Review the contact details first.</small></span>
              </li>
              <li>
                <span className="step-number">2</span>
                <span><strong>Send the request</strong><small>POST /api/dial sends a data message.</small></span>
              </li>
              <li>
                <span className="step-number">3</span>
                <span><strong>Continue on Android</strong><small>The device displays the request.</small></span>
              </li>
            </ol>
            <div className="workflow-note">
              <CircleHelp size={16} aria-hidden="true" />
              <span>A successful response means the backend accepted the request for sending. It does not confirm device delivery.</span>
            </div>
            <a className="workflow-link" href="#leads-title">
              View all leads <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </aside>
        </section>

        {healthStatus === 'offline' && (
          <div className="connection-banner" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span><strong>Backend connection needs attention.</strong> {healthMessage}</span>
            <button type="button" onClick={() => void loadHealth()}>Try again</button>
          </div>
        )}
      </main>

      <footer className="footer">
        <span>LeadZam CRM · Local assessment workspace</span>
        <span className="footer-status"><Check size={14} aria-hidden="true" /> No credentials in browser</span>
      </footer>
    </div>
  );
}

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: 'blue' | 'green' | 'coral';
}

function SummaryCard({ icon, label, value, detail, tone }: SummaryCardProps) {
  return (
    <div className="summary-card">
      <div className={`summary-icon summary-icon--${tone}`}>{icon}</div>
      <div>
        <span className="summary-label">{label}</span>
        <strong className="summary-value">{value}</strong>
        <span className="summary-detail">{detail}</span>
      </div>
    </div>
  );
}

export default App;
