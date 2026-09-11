export type ParcelStatus = 'EN_TRANSIT' | 'DELIVERED' | 'RETURNED' | 'PENDING' | 'EN_ATTENTE' | 'EXPEDIE';

export interface Parcel {
  id: string;
  trackingNumber: string;
  storeName: string;
  clientName: string;
  clientPhone: string;
  address: string;
  governorate: string;
  codAmount: number;
  orderId: string;
  webhookUrl: string;
  status: ParcelStatus;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
  returnedAt?: string;
  returnReason?: string;
  driverNotes?: string;
  codCollected?: number;
}

export interface CreateShipmentPayload {
  storeName: string;
  clientName: string;
  clientPhone: string;
  address: string;
  governorate: string;
  codAmount: number | string;
  orderId?: string;
  webhookUrl?: string;
}

export interface CreateShipmentResponse {
  success: boolean;
  trackingNumber: string;
  waybillUrl: string;
  parcel?: Parcel;
  message?: string;
}

export interface WebhookLog {
  id: string;
  timestamp: string;
  trackingNumber: string;
  orderId?: string;
  status: ParcelStatus;
  targetUrl: string;
  payload: Record<string, unknown>;
  statusCode?: number;
  responseBody?: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

export interface CarrierStats {
  total: number;
  enTransit: number;
  delivered: number;
  returned: number;
  totalCodCollected: number;
  totalCodPending: number;
}

declare global {
  interface Window {
    addExternalParcel?: (parcelData: any) => Parcel | null;
    syncParcelsFromStorage?: () => Parcel[];
    expressLogisticsParcels?: Parcel[];
  }
}
