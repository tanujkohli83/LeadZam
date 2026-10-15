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

export type LeadRequestStatus = 'ready' | 'sending' | 'accepted' | 'error';

export interface LeadRequestState {
  status: LeadRequestStatus;
  message: string;
}
