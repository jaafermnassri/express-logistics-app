import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { DriverView } from './components/DriverView';
import { WaybillModal } from './components/WaybillModal';
import { Parcel, CarrierStats } from './types';
import {
  STORAGE_KEY,
  BROADCAST_CHANNEL_NAME,
  ALT_BROADCAST_CHANNELS,
  getLocalStorageParcels,
  saveParcelsToLocalStorage,
  updateParcelStatusInLocalStorage,
  parseParcelsFromStorage,
  broadcastParcelsUpdate,
  broadcastSingleStatusChange,
  normalizeParcel
} from './utils/storageSync';

const FAKE_TRACKINGS = new Set(['TRK-748291', 'TRK-392014', 'TRK-582103', 'TRK-109482', 'TRK-892110']);
const FAKE_CLIENT_NAMES = new Set(['Sarra Ben Ali', 'Karim Mansour', 'Ines Trabelsi', 'Mohamed Dridi', 'Yassine Belhadj']);

export default function App() {
  // Helper to calculate statistics from a parcel list
  const computeStats = (list: Parcel[]): CarrierStats => {
    const isActive = (s: string) => ['EN_TRANSIT', 'EXPEDIE', 'EN_ATTENTE', 'PENDING'].includes(s);
    return {
      total: list.length,
      enTransit: list.filter((p) => isActive(p.status)).length,
      delivered: list.filter((p) => p.status === 'DELIVERED').length,
      returned: list.filter((p) => p.status === 'RETURNED').length,
      totalCodCollected: list
        .filter((p) => p.status === 'DELIVERED')
        .reduce((sum, p) => sum + (p.codCollected || p.codAmount || 0), 0),
      totalCodPending: list
        .filter((p) => isActive(p.status))
        .reduce((sum, p) => sum + (p.codAmount || 0), 0)
    };
  };

  // Initialize state directly from localStorage so parcels render instantaneously on mount
  const [parcels, setParcels] = useState<Parcel[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = getLocalStorageParcels();
      return stored.filter(
        (p) => !FAKE_TRACKINGS.has(p.trackingNumber) && !FAKE_CLIENT_NAMES.has(p.clientName)
      );
    }
    return [];
  });

  const [stats, setStats] = useState<CarrierStats | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = getLocalStorageParcels().filter(
        (p) => !FAKE_TRACKINGS.has(p.trackingNumber) && !FAKE_CLIENT_NAMES.has(p.clientName)
      );
      if (stored.length > 0) return computeStats(stored);
    }
    return null;
  });

  const [loading, setLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [selectedWaybillParcel, setSelectedWaybillParcel] = useState<Parcel | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // References for tracking changes
  const knownTrackingNumbersRef = useRef<Set<string>>(
    new Set(typeof window !== 'undefined' ? getLocalStorageParcels().map((p) => p.trackingNumber) : [])
  );
  const isInitialLoadRef = useRef<boolean>(true);
  const lastStorageRawRef = useRef<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  );
  const isSyncingStorageRef = useRef<boolean>(false);

  // Purge fake seeds on startup
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = getLocalStorageParcels();
      const cleaned = stored.filter(
        (p) => !FAKE_TRACKINGS.has(p.trackingNumber) && !FAKE_CLIENT_NAMES.has(p.clientName)
      );
      if (cleaned.length !== stored.length) {
        saveParcelsToLocalStorage(cleaned);
        setParcels(cleaned);
        setStats(computeStats(cleaned));
      }
    }
  }, []);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Sync parcels to server backend silently
  const syncParcelsToServer = useCallback(async (parcelsToSync: Parcel[]) => {
    if (!parcelsToSync.length) return;
    try {
      await fetch('/api/carrier/sync-parcels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parcels: parcelsToSync })
      });
    } catch (err) {
      console.warn('[Sync to Server] Warning during sync:', err);
    }
  }, []);

  // Global helper function to append/insert a new parcel directly into state and localStorage
  const addExternalParcel = useCallback(
    (parcelData: any): Parcel | null => {
      const normalized = normalizeParcel(parcelData);
      if (!normalized) return null;

      setParcels((prev) => {
        const existsIndex = prev.findIndex(
          (p) =>
            p.trackingNumber === normalized.trackingNumber ||
            (normalized.orderId && p.orderId === normalized.orderId)
        );

        let updated: Parcel[];
        if (existsIndex >= 0) {
          updated = [...prev];
          updated[existsIndex] = {
            ...prev[existsIndex],
            ...normalized,
            updatedAt: new Date().toISOString()
          };
        } else {
          updated = [normalized, ...prev];
        }

        setStats(computeStats(updated));
        saveParcelsToLocalStorage(updated);
        lastStorageRawRef.current = JSON.stringify(updated);
        knownTrackingNumbersRef.current.add(normalized.trackingNumber);
        return updated;
      });

      // Sync with server backend
      syncParcelsToServer([normalized]);

      showToast(
        `📦 Nouveau colis reçu : ${normalized.trackingNumber} (${normalized.clientName} - ${normalized.governorate}) ajouté pour livraison !`,
        'success'
      );

      return normalized;
    },
    [syncParcelsToServer]
  );

  // Manual explicit Refresh / Sync handler that re-reads localStorage and updates cards list
  const handleManualStorageSync = useCallback(() => {
    setIsRefreshing(true);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const stored = parseParcelsFromStorage(raw);

      setParcels((current) => {
        const map = new Map<string, Parcel>();
        // 1. Existing in current state
        current.forEach((p) => map.set(p.trackingNumber, p));

        // 2. Merge from LocalStorage
        stored.forEach((sp) => {
          const existing = map.get(sp.trackingNumber);
          if (!existing) {
            map.set(sp.trackingNumber, sp);
          } else {
            map.set(sp.trackingNumber, { ...existing, ...sp });
          }
        });

        const merged = Array.from(map.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        // Update stats and tracking numbers
        knownTrackingNumbersRef.current = new Set(merged.map((p) => p.trackingNumber));
        setStats(computeStats(merged));
        saveParcelsToLocalStorage(merged);
        lastStorageRawRef.current = JSON.stringify(merged);

        // Also sync to server so labels work
        syncParcelsToServer(merged);

        return merged;
      });

      showToast(
        `🔄 Synchronisation terminée : ${stored.length} colis chargés depuis le stockage local (express_logistics_parcels).`,
        'success'
      );
    } catch (err) {
      console.error('Erreur lors de la synchronisation locale:', err);
      showToast('Erreur lors de la synchronisation avec le stockage local', 'error');
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  }, [syncParcelsToServer]);

  // Fetch all parcels from Server & reconcile with LocalStorage
  const fetchParcels = useCallback(
    async (showIndicator = false) => {
      if (showIndicator) setIsRefreshing(true);
      try {
        const res = await fetch('/api/carrier/parcels');
        if (!res.ok) throw new Error('Erreur de chargement');
        const data = await res.json();
        const serverParcels: Parcel[] = data.parcels || [];

        // Read local storage parcels
        const storedParcels = getLocalStorageParcels();

        // Merge server & local storage parcels
        const mergedMap = new Map<string, Parcel>();

        // 1. Add server parcels
        serverParcels.forEach((p) => mergedMap.set(p.trackingNumber, p));

        // 2. Add or update from localStorage
        let hasNewFromStorage = false;
        storedParcels.forEach((sp) => {
          const existing = mergedMap.get(sp.trackingNumber);
          if (!existing) {
            mergedMap.set(sp.trackingNumber, sp);
            hasNewFromStorage = true;
          } else {
            if (sp.updatedAt && (!existing.updatedAt || new Date(sp.updatedAt) >= new Date(existing.updatedAt))) {
              mergedMap.set(sp.trackingNumber, { ...existing, ...sp });
            }
          }
        });

        const finalParcels = Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        // Detect newly arrived parcels
        if (!isInitialLoadRef.current && knownTrackingNumbersRef.current.size > 0) {
          const newParcels = finalParcels.filter(
            (p) => !knownTrackingNumbersRef.current.has(p.trackingNumber) && p.status === 'EN_TRANSIT'
          );
          if (newParcels.length > 0) {
            const newest = newParcels[0];
            showToast(
              `📦 Nouveau colis reçu : ${newest.trackingNumber} (${newest.clientName} - ${newest.governorate}) prêt pour livraison !`,
              'success'
            );
          }
        }

        // Update known set
        knownTrackingNumbersRef.current = new Set(finalParcels.map((p) => p.trackingNumber));
        isInitialLoadRef.current = false;

        // Update state
        setParcels(finalParcels);
        setStats(computeStats(finalParcels));

        // Keep localStorage in sync
        const serialized = JSON.stringify(finalParcels);
        lastStorageRawRef.current = serialized;
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem(STORAGE_KEY, serialized);
        }

        // If localStorage had items missing from server, sync them to server
        if (hasNewFromStorage) {
          syncParcelsToServer(finalParcels);
        }
      } catch (err) {
        console.error('Failed to fetch carrier parcels:', err);
      } finally {
        setLoading(false);
        if (showIndicator) setIsRefreshing(false);
      }
    },
    [syncParcelsToServer]
  );

  // Handle incoming data from localStorage or Cross-App events
  const handleStorageChange = useCallback(() => {
    if (isSyncingStorageRef.current) return;
    try {
      isSyncingStorageRef.current = true;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === lastStorageRawRef.current) return;
      lastStorageRawRef.current = raw;

      const stored = parseParcelsFromStorage(raw);
      if (!stored.length) return;

      setParcels((currentParcels) => {
        const map = new Map<string, Parcel>();
        currentParcels.forEach((p) => map.set(p.trackingNumber, p));

        let newArrivalDetected = false;
        let newestArrival: Parcel | null = null;

        stored.forEach((sp) => {
          const existing = map.get(sp.trackingNumber);
          if (!existing) {
            map.set(sp.trackingNumber, sp);
            if (!knownTrackingNumbersRef.current.has(sp.trackingNumber) && sp.status === 'EN_TRANSIT') {
              newArrivalDetected = true;
              newestArrival = sp;
            }
          } else {
            // Update status if changed by external app
            map.set(sp.trackingNumber, { ...existing, ...sp });
          }
        });

        const updatedList = Array.from(map.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        // Update known tracking numbers
        knownTrackingNumbersRef.current = new Set(updatedList.map((p) => p.trackingNumber));

        // Update stats
        setStats(computeStats(updatedList));

        // Notify user if a new order arrived live
        if (newArrivalDetected && newestArrival) {
          showToast(
            `📦 Nouveau colis reçu de Markitik : ${(newestArrival as Parcel).trackingNumber} (${(newestArrival as Parcel).clientName} - ${(newestArrival as Parcel).governorate}) prêt pour livraison !`,
            'success'
          );
        }

        // Sync new parcels to backend server so /labels waybills work
        syncParcelsToServer(updatedList);

        return updatedList;
      });
    } catch (err) {
      console.warn('[Cross-App Storage] Error handling storage change:', err);
    } finally {
      isSyncingStorageRef.current = false;
    }
  }, [syncParcelsToServer]);

  // Expose global window helper for direct parcel insertion
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.addExternalParcel = addExternalParcel;
      window.syncParcelsFromStorage = () => {
        handleManualStorageSync();
        return getLocalStorageParcels();
      };
      (window as any).expressLogisticsParcels = parcels;
    }
  }, [addExternalParcel, handleManualStorageSync, parcels]);

  // Setup Storage, BroadcastChannel, Custom Events, and Visibility Event Listeners
  useEffect(() => {
    // 1. Initial Load from server
    fetchParcels();

    // 2. Storage Event Listener (triggered across tabs)
    const onStorageEvent = (e: StorageEvent | Event) => {
      const storageEv = e as StorageEvent;
      if (!storageEv.key || storageEv.key === STORAGE_KEY) {
        handleStorageChange();
      }
    };
    window.addEventListener('storage', onStorageEvent);
    window.addEventListener('express_logistics_parcels_changed', handleStorageChange);

    // 3. Custom 'express_parcel_added' listener
    const onParcelAddedEvent = (e: Event) => {
      const customEv = e as CustomEvent;
      if (customEv.detail?.parcel) {
        addExternalParcel(customEv.detail.parcel);
      } else {
        handleStorageChange();
      }
    };
    window.addEventListener('express_parcel_added', onParcelAddedEvent);

    // 4. BroadcastChannel Listeners for instant Cross-App communication with Markitik
    const channels: BroadcastChannel[] = [];
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const channelNames = [BROADCAST_CHANNEL_NAME, ...ALT_BROADCAST_CHANNELS];
      channelNames.forEach((name) => {
        try {
          const bc = new BroadcastChannel(name);
          bc.onmessage = (event) => {
            if (
              event.data?.type === 'EXPRESS_LOGISTICS_PARCELS_UPDATED' ||
              event.data?.key === STORAGE_KEY ||
              event.data?.parcels
            ) {
              handleStorageChange();
            } else if (event.data?.type === 'EXPRESS_PARCEL_ADDED' && event.data?.parcel) {
              addExternalParcel(event.data.parcel);
            } else if (event.data?.type === 'SHIPMENT_CREATED' || event.data?.type === 'ORDER_SHIPPED') {
              if (event.data?.parcel) {
                addExternalParcel(event.data.parcel);
              } else {
                fetchParcels(false);
              }
            }
          };
          channels.push(bc);
        } catch {
          // Ignore
        }
      });
    }

    // 5. PostMessage listener for parent/iframe/cross-window interactions
    const onMessage = (event: MessageEvent) => {
      if (!event.data) return;
      if (
        event.data.type === 'EXPRESS_LOGISTICS_PARCELS_UPDATED' ||
        event.data.key === STORAGE_KEY ||
        event.data.type === 'REFRESH_PARCELS'
      ) {
        handleStorageChange();
      } else if (
        (event.data.type === 'EXPRESS_PARCEL_ADDED' ||
          event.data.type === 'SHIPMENT_CREATED' ||
          event.data.type === 'ORDER_SHIPPED') &&
        event.data.parcel
      ) {
        addExternalParcel(event.data.parcel);
      }
    };
    window.addEventListener('message', onMessage);

    // 6. Active Storage Poller (detects rapid same-origin/same-window localStorage writes every 500ms)
    const storagePollInterval = setInterval(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw && raw !== lastStorageRawRef.current) {
          handleStorageChange();
        }
      } catch {
        // Ignore
      }
    }, 500);

    // 7. Server Polling (every 3s)
    const serverPollInterval = setInterval(() => {
      fetchParcels(false);
    }, 3000);

    // 8. Focus & Visibility Sync
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        handleStorageChange();
        fetchParcels(false);
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      window.removeEventListener('storage', onStorageEvent);
      window.removeEventListener('express_logistics_parcels_changed', handleStorageChange);
      window.removeEventListener('express_parcel_added', onParcelAddedEvent);
      window.removeEventListener('message', onMessage);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      clearInterval(storagePollInterval);
      clearInterval(serverPollInterval);
      channels.forEach((c) => {
        try {
          c.close();
        } catch {
          // Ignore
        }
      });
    };
  }, [fetchParcels, handleStorageChange, addExternalParcel]);

  // Update status (Deliver or Return) -> Update Server, LocalStorage, Dispatch Storage & Broadcast Events
  const handleUpdateStatus = async (
    trackingNumber: string,
    status: 'DELIVERED' | 'RETURNED' | 'EN_TRANSIT',
    reason?: string
  ) => {
    try {
      // 1. Send status update to Server (which executes HTTP Webhook dispatch)
      const res = await fetch(`/api/carrier/parcels/${trackingNumber}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de la mise à jour');
      }

      const updatedParcel: Parcel = data.parcel;

      // 2. Update Local State immediately
      setParcels((prev) => {
        const updated = prev.map((p) =>
          p.trackingNumber === trackingNumber || p.orderId === trackingNumber
            ? { ...p, ...updatedParcel, status }
            : p
        );
        setStats(computeStats(updated));

        // 3. Update localStorage and notify Markitik
        saveParcelsToLocalStorage(updated);
        lastStorageRawRef.current = JSON.stringify(updated);

        return updated;
      });

      // 4. Dispatch specific single-status event and Storage event for Markitik
      broadcastSingleStatusChange(updatedParcel, status, reason);

      if (status === 'DELIVERED') {
        showToast(
          `Colis ${trackingNumber} marqué LIVRÉ & ENCAISSÉ (${updatedParcel.codAmount.toFixed(2)} DT). Webhook & LocalStorage synchronisés !`,
          'success'
        );
      } else if (status === 'RETURNED') {
        showToast(
          `Colis ${trackingNumber} marqué RETOURNÉ (${reason || 'Refus'}). Webhook & LocalStorage synchronisés !`,
          'success'
        );
      } else {
        showToast(`Colis ${trackingNumber} remis en transit.`, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de la mise à jour', 'error');
    }
  };

  // Handle shipment created via sandbox
  const handleShipmentCreated = (newParcel: Parcel) => {
    setParcels((prev) => {
      const updated = [newParcel, ...prev.filter((p) => p.trackingNumber !== newParcel.trackingNumber)];
      setStats(computeStats(updated));
      saveParcelsToLocalStorage(updated);
      lastStorageRawRef.current = JSON.stringify(updated);
      return updated;
    });

    fetchParcels(false);
    showToast(
      `Colis ${newParcel.trackingNumber} créé avec succès ! Synchronisé avec LocalStorage & Chauffeur.`,
      'success'
    );
  };

  const activeDeliveriesCount = stats?.enTransit || 0;

  return (
    <div className="min-h-screen bg-white text-black flex flex-col font-sans">
      {/* Global Header */}
      <Header activeDeliveriesCount={activeDeliveriesCount} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">
        {/* Toast feedback banner */}
        {toastMessage && (
          <div
            id="status-toast"
            className={`mb-4 p-3 rounded border text-xs sm:text-sm font-medium flex items-center justify-between ${
              toastMessage.type === 'success'
                ? 'bg-green-50 text-green-900 border-green-300'
                : 'bg-red-50 text-red-900 border-red-300'
            }`}
          >
            <span>{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="text-xs underline ml-4 font-normal"
            >
              Fermer
            </button>
          </div>
        )}

        {/* Real Orders Driver View */}
        <DriverView
          parcels={parcels}
          onUpdateStatus={handleUpdateStatus}
          onOpenWaybill={(parcel) => setSelectedWaybillParcel(parcel)}
          loading={loading}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-3 mt-auto text-center text-xs text-gray-500">
        Express Logistics — Portail Transporteur
      </footer>

      {/* Waybill Modal */}
      {selectedWaybillParcel && (
        <WaybillModal
          parcel={selectedWaybillParcel}
          onClose={() => setSelectedWaybillParcel(null)}
        />
      )}
    </div>
  );
}
