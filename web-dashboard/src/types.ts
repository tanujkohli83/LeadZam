export type LeadStage = 'New lead' | 'Qualified' | 'Follow-up' | 'Proposal';

export interface Lead {
  id: string;
  name: string;
  company: string;
  phoneNumber: string;
  stage: LeadStage;
  initials: string;
  lastActivity: string;
  accent: string;
}

export type RequestStatus =
  | 'sending'
  | 'accepted'
  | 'received'
  | 'dialer_opened'
  | 'dismissed'
  | 'failed';

export interface RequestRecord {
  requestId: string;
  phoneNumber: string;
  contactName: string;
  deviceId: string | null;
  deviceName: string;
  status: Exclude<RequestStatus, 'sending'> | 'sending';
  createdAt: string;
  updatedAt: string;
  messageId?: string;
}

export interface DeviceRecord {
  deviceId: string;
  deviceName: string;
  available: boolean;
  registeredAt: string;
  lastSeenAt: string;
  isDefault: boolean;
}

export type LeadRequestStatus = 'ready' | RequestStatus | 'error';

export interface LeadRequestState {
  status: LeadRequestStatus;
  message: string;
  requestId?: string;
  targetDeviceId?: string;
  clientRequestId?: string;
  reuseClientRequestId?: boolean;
}
