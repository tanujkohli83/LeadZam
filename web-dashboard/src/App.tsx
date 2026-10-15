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
import {
  ApiRequestError,
  checkBackendHealth,
  getDevices,
  getRequestHistory,
  sendDialRequest,
} from './api';
import type {
  DeviceRecord,
  Lead,
  LeadRequestState,
  RequestRecord,
  RequestStatus,
} from './types';
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

const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  sending: 'Sending',
  accepted: 'Accepted',
  received: 'Received',
  dialer_opened: 'Dialer opened',
  dismissed: 'Dismissed',
  failed: 'Failed',
};

function requestStatusMessage(status: RequestStatus) {
  return REQUEST_STATUS_LABELS[status];
}

function formatRequestTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function createClientRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dashboard-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function callErrorMessage(error: unknown) {
  if (!(error instanceof ApiRequestError)) {
    return 'The request failed. Please try again with the same device selected.';
  }
  if (error.ambiguous) {
    return `${error.message} Retry checks the original request and will not silently target another device.`;
  }
  return error.message;
}

function stageClass(stage: Lead['stage']) {
  return stage.toLowerCase().replace(' ', '-');
}

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('checking');
  const [healthMessage, setHealthMessage] = useState('Checking backend connection…');
  const [requestStates, setRequestStates] = useState<Record<string, LeadRequestState>>({});
  const [requestHistory, setRequestHistory] = useState<RequestRecord[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const devicesLoaded = useRef(false);
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

  const loadRequestHistory = useCallback(async () => {
    try {
      const response = await getRequestHistory(API_BASE_URL);
      setRequestHistory(response.requests);
      setHistoryError(null);
    } catch (error) {
      setHistoryError(
        error instanceof ApiRequestError
          ? error.message
          : 'Request history could not be loaded.',
      );
    }
  }, []);

  const loadDevices = useCallback(async () => {
    if (!devicesLoaded.current) setDevicesLoading(true);

    try {
      const response = await getDevices(API_BASE_URL);
      setDevices(response.devices);
      setSelectedDeviceId((current) => {
        if (current && response.devices.some((device) => device.deviceId === current)) {
          return current;
        }
        return response.defaultDeviceId || '';
      });
      setDevicesError(null);
    } catch (error) {
      setDevicesError(
        error instanceof ApiRequestError
          ? error.message
          : 'Registered devices could not be loaded.',
      );
    } finally {
      devicesLoaded.current = true;
      setDevicesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  useEffect(() => {
    let disposed = false;
    let timeoutId: number | undefined;

    const refresh = async () => {
      await Promise.all([loadRequestHistory(), loadDevices()]);
      if (!disposed) {
        timeoutId = window.setTimeout(() => void refresh(), 4_000);
      }
    };

    void refresh();

    return () => {
      disposed = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [loadDevices, loadRequestHistory]);

  const filteredLeads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return MOCK_LEADS;

    return MOCK_LEADS.filter((lead) =>
      [lead.name, lead.company, lead.phoneNumber, lead.stage].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [searchQuery]);

  const latestRequestByPhone = useMemo(() => {
    const latest = new Map<string, RequestRecord>();
    requestHistory.forEach((request) => {
      if (!latest.has(request.phoneNumber)) latest.set(request.phoneNumber, request);
    });
    return latest;
  }, [requestHistory]);

  const selectedDevice = devices.find((device) => device.deviceId === selectedDeviceId);
  const selectedDeviceUnavailable = Boolean(selectedDevice && !selectedDevice.available);

  const updateLeadState = (leadId: string, state: LeadRequestState) => {
    setRequestStates((current) => ({ ...current, [leadId]: state }));
  };

  const handleCall = async (lead: Lead) => {
    const currentState = requestStates[lead.id] || READY_STATE;
    if (currentState.status === 'sending' || inFlightLeadIds.current.has(lead.id)) return;

    const selectedTargetDeviceId = selectedDeviceId || undefined;
    const canReuseRequest =
      currentState.status === 'error' &&
      currentState.reuseClientRequestId === true &&
      Boolean(currentState.clientRequestId) &&
      currentState.targetDeviceId === selectedTargetDeviceId;
    const targetDeviceId = canReuseRequest
      ? currentState.targetDeviceId
      : selectedTargetDeviceId;
    const clientRequestId = canReuseRequest
      ? currentState.clientRequestId
      : createClientRequestId();

    inFlightLeadIds.current.add(lead.id);
    updateLeadState(lead.id, {
      status: 'sending',
      message: 'Sending request…',
      targetDeviceId,
      clientRequestId,
    });

    try {
      const response = await sendDialRequest(
        API_BASE_URL,
        lead.phoneNumber,
        lead.name,
        targetDeviceId,
        clientRequestId,
      );
      updateLeadState(lead.id, {
        status: 'accepted',
        message: `Request accepted for ${response.device.deviceName}.`,
        requestId: response.requestId,
        targetDeviceId,
        clientRequestId,
      });
      void loadRequestHistory();
    } catch (error) {
      updateLeadState(lead.id, {
        status: 'error',
        message: callErrorMessage(error),
        requestId: error instanceof ApiRequestError ? error.requestId : undefined,
        targetDeviceId,
        clientRequestId,
        reuseClientRequestId: error instanceof ApiRequestError && error.ambiguous,
      });
      void loadRequestHistory();
    } finally {
      inFlightLeadIds.current.delete(lead.id);
    }
  };

  const trackedCount = requestHistory.length;

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
            label="Requests tracked"
            value={String(trackedCount).padStart(2, '0')}
            detail="In-memory backend history"
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

            <div className="device-toolbar">
              <label htmlFor="target-device">Send call requests to</label>
              <select
                id="target-device"
                value={selectedDeviceId}
                onChange={(event) => setSelectedDeviceId(event.target.value)}
                disabled={devicesLoading}
                aria-busy={devicesLoading}
              >
                <option value="">Default configured device</option>
                {devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId} disabled={!device.available}>
                    {device.deviceName}{device.available ? '' : ' (unavailable)'}
                  </option>
                ))}
              </select>
              <span className={selectedDeviceUnavailable ? 'device-state device-state--unavailable' : 'device-state'}>
                {devicesLoading
                  ? 'Loading registered devices…'
                  : selectedDevice
                  ? selectedDeviceUnavailable
                    ? 'Unavailable — register the device again'
                    : `Ready: ${selectedDevice.deviceName}`
                  : 'Uses the existing FCM_TOKEN fallback'}
              </span>
            </div>
            {devicesError && <p className="device-error" role="alert">{devicesError}</p>}

            <div className="lead-list">
              {filteredLeads.map((lead) => {
                const localState = requestStates[lead.id];
                const historyRequest = latestRequestByPhone.get(lead.phoneNumber);
                const state: LeadRequestState =
                  localState?.status === 'sending'
                    ? localState
                    : historyRequest
                      ? {
                          status: historyRequest.status,
                          message: requestStatusMessage(historyRequest.status),
                          requestId: historyRequest.requestId,
                        }
                      : localState || READY_STATE;
                const isSending = state.status === 'sending';
                const isRetry = state.status === 'error';
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
                        {state.status !== 'sending' && state.status !== 'ready' && state.status !== 'error' && <CheckCircle2 size={15} aria-hidden="true" />}
                        {(state.status === 'error' || state.status === 'failed') && <AlertCircle size={15} aria-hidden="true" />}
                        {state.status === 'ready' && <span className="feedback-marker" aria-hidden="true" />}
                        <span>{state.message}</span>
                      </div>
                    </div>
                    <button
                      className={`call-button call-button--${state.status}`}
                      type="button"
                      onClick={() => void handleCall(lead)}
                      disabled={devicesLoading || isSending || selectedDeviceUnavailable}
                      aria-busy={devicesLoading || isSending}
                      aria-label={
                        devicesLoading
                          ? `Loading devices before calling ${lead.name}`
                          : isSending
                            ? `Sending call request for ${lead.name}`
                            : isRetry
                              ? `Retry call request for ${lead.name}`
                              : `Call ${lead.name}`
                      }
                    >
                      {devicesLoading || isSending ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <Phone size={17} aria-hidden="true" />}
                      <span>{devicesLoading ? 'Loading' : isSending ? 'Sending' : isRetry ? 'Retry' : 'Call'}</span>
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
            <div className="request-history" aria-labelledby="history-title">
              <div className="history-header">
                <div>
                  <p className="eyebrow">Latest activity</p>
                  <h3 id="history-title">Request history</h3>
                </div>
                <button type="button" onClick={() => void loadRequestHistory()}>
                  Refresh
                </button>
              </div>
              {historyError && <p className="history-error" role="alert">{historyError}</p>}
              {!historyError && requestHistory.length === 0 && (
                <p className="history-empty">No request events recorded yet.</p>
              )}
              <div className="history-list">
                {requestHistory.slice(0, 8).map((request) => (
                  <div className="history-item" key={request.requestId}>
                    <div>
                      <strong>{request.contactName}</strong>
                      <small>
                        {request.phoneNumber} · {request.deviceName || 'Default configured device'} · {formatRequestTime(request.updatedAt)}
                      </small>
                    </div>
                    <span className={`history-status history-status--${request.status}`}>
                      {requestStatusMessage(request.status)}
                    </span>
                  </div>
                ))}
              </div>
              <small className="history-note">History is held in memory and resets when the backend restarts.</small>
            </div>
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
