export type UserRole = 'admin' | 'consulta';
export type ParcelStatus = 'recibida' | 'en_transito' | 'entregada';

export interface DbUser {
  id: number;
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt?: string;
  updatedAt?: string;
}

export interface Branch {
  id: number;
  code: string;
  city: string;
  name: string;
  dailyDispatchQuota?: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BranchSummary {
  id: number;
  code: string;
  city: string;
  name: string;
}

export interface ParcelEvent {
  id: number;
  parcelId: number;
  eventDate: string;
  locationBranchId: number | null;
  locationText: string;
  status: ParcelStatus;
  notes: string;
  recordedByUid?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Parcel {
  id: number;
  trackingCode: string;
  originBranchId: number;
  originBranch: BranchSummary | null;
  destinationBranchId: number;
  destinationBranch: BranchSummary | null;
  recipientName: string;
  weightKg: number;
  currentStatus: ParcelStatus;
  internalNotes?: string;
  createdByUid?: string;
  createdAt: string;
  updatedAt: string;
  events?: ParcelEvent[];
}

export interface PaginatedParcels {
  items: Parcel[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface BranchBreakdownItem {
  id: number;
  code: string;
  city: string;
  name: string;
  active: boolean;
  dailyDispatchQuota: number;
  todayUsedQuota: number;
  todayMaxQuota: number;
  originParcels: number;
  destinationParcels: number;
}

export interface DashboardSummary {
  totalParcels: number;
  deliveredParcels: number;
  pendingParcels: number;
  byStatus: Record<ParcelStatus, number>;
  totalWeightKg: number;
  activeBranches: number;
  totalBranches: number;
  branchBreakdown: BranchBreakdownItem[];
  todayDate: string;
}

export interface ApiEnvelope<T = unknown> {
  accepted: boolean;
  code: string;
  rule: string;
  message: string;
  statusCode?: number;
  data?: T;
}

export interface MandatoryTestStep {
  step: string;
  action: string;
  input: Record<string, unknown>;
  expected: string;
  accepted: boolean;
  httpStatus: number;
  code: string;
  actualMessage: string;
}

export interface MandatoryTestReport {
  trackingCode: string;
  parcelId: number;
  executedAt: string;
  steps: MandatoryTestStep[];
  finalParcel: Parcel;
}

export interface ConcurrencyTestAttempt {
  request: string;
  trackingCode: string;
  durationMs: number;
  accepted: boolean;
  httpStatus: number;
  code: string;
  message: string;
}

export interface ConcurrencyTestReport {
  branch: string;
  quotaDate: string;
  maxCapacity: number;
  finalUsedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  results: ConcurrencyTestAttempt[];
}
