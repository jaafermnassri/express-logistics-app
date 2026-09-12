import React, { useState } from 'react';
import { Parcel, ParcelStatus } from '../types';

interface DriverViewProps {
  parcels: Parcel[];
  onUpdateStatus: (trackingNumber: string, status: 'DELIVERED' | 'RETURNED', reason?: string) => Promise<void>;
  onOpenWaybill: (parcel: Parcel) => void;
  loading: boolean;
}

export const DriverView: React.FC<DriverViewProps> = ({
  parcels,
  onUpdateStatus,
  onOpenWaybill,
  loading
}) => {
  const [actionLoading, setActionLoading] = useState<{ [key: string]: boolean }>({});
  const [returnModalParcel, setReturnModalParcel] = useState<Parcel | null>(null);
  const [returnReason, setReturnReason] = useState<string>('Refus client / Non joignable');

  const handleDeliver = async (parcel: Parcel) => {
    setActionLoading((prev) => ({ ...prev, [parcel.trackingNumber]: true }));
    try {
      await onUpdateStatus(parcel.trackingNumber, 'DELIVERED');
    } finally {
      setActionLoading((prev) => ({ ...prev, [parcel.trackingNumber]: false }));
    }
  };

  const handleConfirmReturn = async () => {
    if (!returnModalParcel) return;
    const tracking = returnModalParcel.trackingNumber;
    setActionLoading((prev) => ({ ...prev, [tracking]: true }));
    try {
      await onUpdateStatus(tracking, 'RETURNED', returnReason);
      setReturnModalParcel(null);
    } finally {
      setActionLoading((prev) => ({ ...prev, [tracking]: false }));
    }
  };

  const getStatusDisplay = (status: ParcelStatus) => {
    switch (status) {
      case 'EN_TRANSIT':
      case 'EXPEDIE':
      case 'DISPATCHED':
      case 'SHIPPED':
        return (
          <span className="text-xs font-bold px-2.5 py-1 rounded bg-[#673ab7]/10 text-[#673ab7] border border-[#673ab7]/20">
            {status === 'EXPEDIE' || status === 'DISPATCHED' || status === 'SHIPPED' ? 'Expédié' : 'En Transit'}
          </span>
        );
      case 'EN_ATTENTE':
      case 'PENDING':
      case 'CONFIRMED':
        return (
          <span className="text-xs font-bold px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200">
            {status === 'CONFIRMED' ? 'Confirmé' : 'En Attente'}
          </span>
        );
      case 'DELIVERED':
        return (
          <span className="text-xs font-bold px-2.5 py-1 rounded bg-green-50 text-green-700 border border-green-200">
            Livré & Encaissé
          </span>
        );
      case 'RETURNED':
        return (
          <span className="text-xs font-bold px-2.5 py-1 rounded bg-red-50 text-red-700 border border-red-200">
            Retourné / Refus
          </span>
        );
      default:
        return (
          <span className="text-xs font-bold px-2.5 py-1 rounded bg-gray-100 text-gray-800">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Title & Total count */}
      <div className="flex items-center justify-between py-2 border-b border-gray-200">
        <h2 className="text-lg font-bold text-black">
          Commandes à livrer ({parcels.length})
        </h2>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="py-16 text-center text-gray-500">
          <p className="text-sm font-medium">Chargement des commandes...</p>
        </div>
      ) : parcels.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <h3 className="text-base font-bold text-black mb-1">Aucune commande pour le moment</h3>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            Les commandes réelles transmises par Markitik s'afficheront ici automatiquement dès leur enregistrement.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {parcels.map((parcel) => {
            const isLoadingThis = actionLoading[parcel.trackingNumber];

            return (
              <div
                key={parcel.id || parcel.trackingNumber}
                id={`parcel-card-${parcel.trackingNumber}`}
                className="bg-white rounded-lg border border-gray-200 flex flex-col justify-between overflow-hidden shadow-xs"
              >
                {/* Card Top: Tracking, Ref & Status */}
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono font-bold text-sm text-black">
                      {parcel.trackingNumber}
                    </span>
                    {getStatusDisplay(parcel.status)}
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>{parcel.storeName}</span>
                    {parcel.orderId && (
                      <span className="font-mono font-medium text-black">
                        Ref: {parcel.orderId}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Body: Client Data & COD */}
                <div className="p-4 space-y-3 flex-1 text-sm">
                  {/* Client Info */}
                  <div>
                    <div className="text-xs uppercase font-medium text-gray-500">Destinataire</div>
                    <div className="font-bold text-black text-base">{parcel.clientName}</div>
                    <div className="text-gray-700 font-medium">{parcel.clientPhone}</div>
                  </div>

                  {/* Address */}
                  <div>
                    <div className="text-xs uppercase font-medium text-gray-500">Adresse de livraison</div>
                    <div className="text-gray-900 font-medium">{parcel.address}</div>
                    <div className="font-bold text-black">{parcel.governorate}</div>
                  </div>

                  {/* COD Amount Box */}
                  <div className="p-3 bg-white rounded-lg border-2 border-black flex items-center justify-between">
                    <div className="text-xs uppercase font-bold text-gray-600">
                      Montant à encaisser (COD)
                    </div>
                    <div className="text-lg font-bold text-black">
                      {Number(parcel.codAmount || 0).toFixed(3)} DT
                    </div>
                  </div>

                  {/* Status Note if Finished */}
                  {parcel.status === 'DELIVERED' && (
                    <div className="text-xs text-green-800 bg-green-50 p-2 rounded border border-green-200 font-medium">
                      Livré avec succès
                      {parcel.deliveredAt && ` le ${new Date(parcel.deliveredAt).toLocaleTimeString('fr-FR')}`}
                    </div>
                  )}

                  {parcel.status === 'RETURNED' && (
                    <div className="text-xs text-red-800 bg-red-50 p-2 rounded border border-red-200 font-medium">
                      Retourné: {parcel.returnReason || 'Refus client'}
                    </div>
                  )}
                </div>

                {/* Card Footer: Only the requested 3 buttons */}
                <div className="p-3 bg-gray-50 border-t border-gray-100 space-y-2">
                  {(['EN_TRANSIT', 'EXPEDIE', 'EN_ATTENTE', 'PENDING', 'DISPATCHED', 'SHIPPED', 'CONFIRMED'].includes(parcel.status)) && (
                    <div className="grid grid-cols-2 gap-2">
                      {/* Button: Encaisser & Livrer (Green) */}
                      <button
                        id={`btn-deliver-${parcel.trackingNumber}`}
                        onClick={() => handleDeliver(parcel)}
                        disabled={isLoadingThis}
                        className="w-full py-2 px-3 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded transition disabled:opacity-50"
                      >
                        Encaisser & Livrer
                      </button>

                      {/* Button: Refus / Annuler (Red) */}
                      <button
                        id={`btn-return-${parcel.trackingNumber}`}
                        onClick={() => setReturnModalParcel(parcel)}
                        disabled={isLoadingThis}
                        className="w-full py-2 px-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded transition disabled:opacity-50"
                      >
                        Refus / Annuler
                      </button>
                    </div>
                  )}

                  {/* Button: Bordereau (#673ab7 with white text) */}
                  <button
                    id={`btn-waybill-${parcel.trackingNumber}`}
                    onClick={() => onOpenWaybill(parcel)}
                    className="w-full py-2 px-3 bg-[#673ab7] hover:bg-[#5e35b1] text-white font-bold text-xs rounded transition"
                  >
                    Bordereau
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Return Reason Confirmation Modal */}
      {returnModalParcel && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl border border-gray-200">
            <h3 className="font-bold text-base text-black mb-1">
              Refus / Annuler le colis
            </h3>
            <p className="text-xs text-gray-600 mb-4">
              N° de suivi: <span className="font-mono font-bold text-black">{returnModalParcel.trackingNumber}</span> ({returnModalParcel.clientName})
            </p>

            <div className="space-y-2 mb-5">
              {[
                'Refus client / Non joignable',
                'Client injoignable après plusieurs appels',
                'Refus du client (Changement d\'avis)',
                'Refus du montant COD (Montant contesté)',
                'Adresse introuvable / Erronée',
                'Colis endommagé lors du transport'
              ].map((reason) => (
                <label
                  key={reason}
                  className={`flex items-center p-2 rounded border text-xs cursor-pointer ${
                    returnReason === reason
                      ? 'bg-red-50 border-red-300 text-red-900 font-bold'
                      : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="return_reason"
                    value={reason}
                    checked={returnReason === reason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="mr-2 text-red-600 focus:ring-red-500"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-gray-200">
              <button
                onClick={() => setReturnModalParcel(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded"
              >
                Annuler
              </button>
              <button
                id="btn-confirm-return"
                onClick={handleConfirmReturn}
                className="px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Confirmer le Retour
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
