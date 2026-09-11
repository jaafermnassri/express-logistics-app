import React from 'react';
import { X, Printer } from 'lucide-react';
import { Parcel } from '../types';
import { generateBarcodeSVG } from '../utils/barcode';

interface WaybillModalProps {
  parcel: Parcel | null;
  onClose: () => void;
}

export const WaybillModal: React.FC<WaybillModalProps> = ({ parcel, onClose }) => {
  if (!parcel) return null;

  const barcodeSvg = generateBarcodeSVG(parcel.trackingNumber, 320, 68);
  const formattedCod = Number(parcel.codAmount || 0).toFixed(3);
  const dateFormatted = new Date(parcel.createdAt).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const handlePrint = () => {
    const printWindow = window.open(`/labels/${parcel.trackingNumber}?autoprint=true`, '_blank');
    if (printWindow) {
      printWindow.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-lg max-w-md w-full p-5 shadow-xl border border-gray-200 relative my-6">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
          <div>
            <h3 className="text-base font-bold text-black flex items-center gap-2">
              <span>Bordereau A6</span>
              <span className="font-mono text-xs bg-gray-100 text-black px-2 py-0.5 rounded font-bold">
                {parcel.trackingNumber}
              </span>
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-[#673ab7] hover:bg-[#5e35b1] text-white font-bold text-xs rounded flex items-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded text-gray-500 hover:text-black hover:bg-gray-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable A6 Container Preview */}
        <div className="bg-white p-4 rounded border-2 border-black space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between border-b-2 border-black pb-2">
            <div>
              <div className="font-black text-sm text-black tracking-tight">EXPRESS LOGISTICS</div>
              <div className="text-[9px] font-bold text-gray-600 uppercase">Livraison Rapide</div>
            </div>
            <div className="text-right">
              <span className="bg-black text-white text-[10px] font-bold px-2 py-0.5 rounded">
                BORDEREAU A6
              </span>
            </div>
          </div>

          {/* Barcode */}
          <div
            className="p-2 border border-gray-200 text-center flex justify-center"
            dangerouslySetInnerHTML={{ __html: barcodeSvg }}
          />

          {/* Sender & Order */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 border border-black rounded">
              <div className="font-bold text-gray-500 text-[9px] uppercase">EXPÉDITEUR</div>
              <div className="font-bold text-black truncate">{parcel.storeName}</div>
              <div className="text-gray-600 text-[11px]">Ref: {parcel.orderId || 'N/A'}</div>
            </div>
            <div className="p-2 border border-black rounded">
              <div className="font-bold text-gray-500 text-[9px] uppercase">DATE</div>
              <div className="font-bold text-black">{dateFormatted}</div>
            </div>
          </div>

          {/* Recipient */}
          <div className="p-3 border-2 border-black rounded">
            <div className="font-bold text-gray-500 text-[9px] uppercase mb-1">DESTINATAIRE</div>
            <div className="font-bold text-sm text-black">{parcel.clientName}</div>
            <div className="text-xs text-black font-semibold mt-0.5">{parcel.clientPhone}</div>
            <div className="text-xs text-gray-800 mt-1">{parcel.address}</div>
            <span className="inline-block mt-2 bg-black text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">
              {parcel.governorate}
            </span>
          </div>

          {/* COD BOX */}
          <div className="p-3 border-2 border-black text-center rounded">
            <div className="font-bold text-[10px] uppercase tracking-wider text-gray-700">
              MONTANT À ENCAISSER (COD)
            </div>
            <div className="text-2xl font-black text-black my-1">
              {formattedCod} DT
            </div>
          </div>

          {/* Footer & Signature */}
          <div className="flex items-end justify-between pt-2 border-t border-gray-300 text-[9px] text-gray-500">
            <div>
              <div>{parcel.trackingNumber} | {parcel.orderId}</div>
            </div>
            <div className="border border-dashed border-gray-400 p-2 text-center text-[8px] text-gray-500 w-24">
              Signature Client
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="mt-4 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-black text-xs font-semibold rounded transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
