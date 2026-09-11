import { Parcel, ParcelStatus } from '../types';

export const STORAGE_KEY = 'express_logistics_parcels';
export const BROADCAST_CHANNEL_NAME = 'express_logistics_channel';
export const ALT_BROADCAST_CHANNELS = ['markitik_shipping_channel', 'markitik_orders_channel', 'express_logistics_parcels'];

const FAKE_TRACKINGS = new Set(['TRK-748291', 'TRK-392014', 'TRK-582103', 'TRK-109482', 'TRK-892110']);
const FAKE_CLIENT_NAMES = new Set(['Sarra Ben Ali', 'Karim Mansour', 'Ines Trabelsi', 'Mohamed Dridi', 'Yassine Belhadj']);

// Helper to safely parse parcels from any format Markitik might write
export function parseParcelsFromStorage(raw: string | null): Parcel[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    let items: Parcel[] = [];
    if (Array.isArray(parsed)) {
      items = parsed.map((item) => normalizeParcel(item)).filter(Boolean) as Parcel[];
    } else if (typeof parsed === 'object' && parsed !== null) {
      // If it's a map or single parcel object
      if (parsed.trackingNumber || parsed.orderId || parsed.clientName) {
        const p = normalizeParcel(parsed);
        items = p ? [p] : [];
      } else {
        items = Object.values(parsed)
          .map((item) => normalizeParcel(item))
          .filter(Boolean) as Parcel[];
      }
    }
    // Purge fake seeds
    return items.filter(
      (item) => !FAKE_TRACKINGS.has(item.trackingNumber) && !FAKE_CLIENT_NAMES.has(item.clientName)
    );
  } catch (err) {
    console.warn('[Storage Sync] Error parsing storage item:', err);
    return [];
  }
}

// Normalize incoming parcel objects into valid Express Logistics Parcel interface
export function normalizeParcel(raw: any): Parcel | null {
  if (!raw || typeof raw !== 'object') return null;

  const trackingNumber =
    raw.trackingNumber ||
    raw.tracking_number ||
    raw.tracking ||
    `EXP-TN-${Math.floor(100000 + Math.random() * 900000)}`;

  const clientName = String(raw.clientName || raw.client_name || raw.customerName || raw.customer_name || raw.recipientName || raw.name || raw.client || '').trim();

  // Discard fake demo clients
  if (FAKE_TRACKINGS.has(String(trackingNumber).trim()) || FAKE_CLIENT_NAMES.has(clientName)) {
    return null;
  }

  const now = new Date().toISOString();
  const rawCod = raw.codAmount ?? raw.cod_amount ?? raw.cod ?? raw.totalAmount ?? raw.total_amount ?? raw.amount ?? raw.total ?? 0;
  const codAmount = typeof rawCod === 'string' ? parseFloat(rawCod) || 0 : Number(rawCod) || 0;

  // Determine standard status
  let status: ParcelStatus = 'EN_TRANSIT';
  const rawStatus = String(raw.status || '').toUpperCase();
  if (rawStatus === 'DELIVERED' || rawStatus === 'LIVRE' || rawStatus === 'LIVRÉ') {
    status = 'DELIVERED';
  } else if (rawStatus === 'RETURNED' || rawStatus === 'RETOURNE' || rawStatus === 'RETOURNÉ' || rawStatus === 'CANCELLED' || rawStatus === 'REFUSE') {
    status = 'RETURNED';
  } else if (rawStatus === 'EXPEDIE' || rawStatus === 'EXPÉDIÉ') {
    status = 'EXPEDIE';
  } else if (rawStatus === 'PENDING' || rawStatus === 'EN_ATTENTE') {
    status = 'EN_ATTENTE';
  } else {
    status = 'EN_TRANSIT';
  }

  return {
    id: raw.id || `parcel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    trackingNumber: String(trackingNumber).trim(),
    orderId: String(raw.orderId || raw.order_id || raw.orderNumber || raw.order_number || raw.orderRef || raw.order_ref || '').trim() || `MKT-${Math.floor(10000 + Math.random() * 90000)}`,
    storeName: String(raw.storeName || raw.store_name || raw.shopName || raw.shop_name || raw.store || 'Markitik Store').trim(),
    clientName: String(raw.clientName || raw.client_name || raw.customerName || raw.customer_name || raw.recipientName || raw.name || raw.client || 'Client Destinataire').trim(),
    clientPhone: String(raw.clientPhone || raw.client_phone || raw.customerPhone || raw.customer_phone || raw.phone || raw.telephone || raw.tel || '+216 98 000 000').trim(),
    address: String(raw.address || raw.shippingAddress || raw.shipping_address || raw.destination || raw.street || 'Adresse de livraison').trim(),
    governorate: String(raw.governorate || raw.city || raw.ville || raw.state || raw.region || raw.gov || 'Tunis').trim(),
    codAmount: codAmount,
    webhookUrl: String(raw.webhookUrl || raw.webhook_url || raw.callbackUrl || raw.callback_url || 'http://localhost:3000/api/webhooks/shipping').trim(),
    status: status,
    createdAt: raw.createdAt || raw.created_at || now,
    updatedAt: raw.updatedAt || raw.updated_at || now,
    deliveredAt: raw.deliveredAt || raw.delivered_at,
    returnedAt: raw.returnedAt || raw.returned_at,
    returnReason: raw.returnReason || raw.return_reason || raw.reason,
    driverNotes: raw.driverNotes || raw.driver_notes,
    codCollected: status === 'DELIVERED' ? (raw.codCollected ?? codAmount) : 0
  };
}

// Get all parcels stored in localStorage
export function getLocalStorageParcels(): Parcel[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  return parseParcelsFromStorage(localStorage.getItem(STORAGE_KEY));
}

// Save complete parcels array to localStorage and notify external listeners (Markitik)
export function saveParcelsToLocalStorage(parcels: Parcel[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const serialized = JSON.stringify(parcels);
    localStorage.setItem(STORAGE_KEY, serialized);

    // 1. Dispatch custom storage event for same-window / same-page listeners
    try {
      window.dispatchEvent(new Event('storage'));
    } catch {
      // Fallback
    }

    // 2. Dispatch custom event with payload
    try {
      window.dispatchEvent(
        new CustomEvent('express_logistics_parcels_changed', {
          detail: { parcels, key: STORAGE_KEY, timestamp: new Date().toISOString() }
        })
      );
    } catch {
      // Fallback
    }

    // 3. BroadcastChannel notifications
    broadcastParcelsUpdate({
      type: 'EXPRESS_LOGISTICS_PARCELS_UPDATED',
      key: STORAGE_KEY,
      parcels,
      timestamp: new Date().toISOString()
    });

    // 4. PostMessage for cross-iframe or parent windows
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          type: 'EXPRESS_LOGISTICS_PARCELS_UPDATED',
          key: STORAGE_KEY,
          parcels
        },
        '*'
      );
    }
  } catch (err) {
    console.error('[Storage Sync] Failed to write parcels to localStorage:', err);
  }
}

// Append or update single parcel into localStorage and dispatch all notification events
export function appendOrUpdateLocalStorageParcel(parcelData: any): Parcel | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const normalized = normalizeParcel(parcelData);
  if (!normalized) return null;

  const current = getLocalStorageParcels();
  const index = current.findIndex(
    (p) =>
      p.trackingNumber === normalized.trackingNumber ||
      (normalized.orderId && p.orderId === normalized.orderId)
  );

  let updatedList: Parcel[];
  if (index >= 0) {
    updatedList = [...current];
    updatedList[index] = { ...current[index], ...normalized, updatedAt: new Date().toISOString() };
  } else {
    updatedList = [normalized, ...current];
  }

  saveParcelsToLocalStorage(updatedList);

  // Dispatch specific express_parcel_added event
  try {
    window.dispatchEvent(
      new CustomEvent('express_parcel_added', {
        detail: { parcel: normalized, timestamp: new Date().toISOString() }
      })
    );
  } catch {
    // Fallback
  }

  return normalized;
}

// Update specific parcel status in localStorage and broadcast to Markitik
export function updateParcelStatusInLocalStorage(
  trackingNumber: string,
  status: ParcelStatus,
  reason?: string,
  codCollected?: number
): Parcel[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];

  const existing = getLocalStorageParcels();
  const now = new Date().toISOString();
  let found = false;

  const updated = existing.map((p) => {
    if (p.trackingNumber === trackingNumber || (p.orderId && p.orderId === trackingNumber)) {
      found = true;
      const updatedParcel: Parcel = {
        ...p,
        status,
        updatedAt: now,
        deliveredAt: status === 'DELIVERED' ? now : undefined,
        returnedAt: status === 'RETURNED' ? now : undefined,
        returnReason: status === 'RETURNED' ? reason || 'Refus Client / Annulation' : undefined,
        codCollected: status === 'DELIVERED' ? (codCollected ?? p.codAmount) : 0
      };
      return updatedParcel;
    }
    return p;
  });

  if (found) {
    saveParcelsToLocalStorage(updated);

    // Broadcast specific single status change event for Markitik order synchronization
    const targetParcel = updated.find((p) => p.trackingNumber === trackingNumber || p.orderId === trackingNumber);
    if (targetParcel) {
      broadcastSingleStatusChange(targetParcel, status, reason);
    }
  }

  return updated;
}

// Broadcast helper for BroadcastChannel API
export function broadcastParcelsUpdate(payload: any): void {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;

  const channelNames = [BROADCAST_CHANNEL_NAME, ...ALT_BROADCAST_CHANNELS];
  channelNames.forEach((name) => {
    try {
      const bc = new BroadcastChannel(name);
      bc.postMessage(payload);
      bc.close();
    } catch {
      // Ignore broadcast channel errors
    }
  });
}

export function broadcastSingleStatusChange(
  parcel: Parcel,
  status: ParcelStatus,
  reason?: string
): void {
  const payload = {
    type: 'PARCEL_STATUS_CHANGED',
    trackingNumber: parcel.trackingNumber,
    orderId: parcel.orderId,
    status: status,
    markitikStatus: status === 'DELIVERED' ? 'Livré' : status === 'RETURNED' ? 'Retourné' : 'En Transit',
    codAmount: parcel.codAmount,
    codCollected: status === 'DELIVERED' ? parcel.codAmount : 0,
    reason: reason || null,
    timestamp: new Date().toISOString()
  };

  broadcastParcelsUpdate(payload);

  // Also postMessage to window/parent
  if (typeof window !== 'undefined') {
    window.postMessage(payload, '*');
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, '*');
    }
  }
}
