import React, { useState } from 'react';
import {
  Send,
  Code2,
  Copy,
  Check,
  Printer,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { CreateShipmentPayload, CreateShipmentResponse, Parcel } from '../types';

interface ShipmentSandboxProps {
  onShipmentCreated: (parcel: Parcel) => void;
  onOpenWaybill: (parcel: Parcel) => void;
}

const PRESET_TEMPLATES: { name: string; icon: string; data: CreateShipmentPayload }[] = [
  {
    name: 'Markitik Mode (Tunis)',
    icon: '👗',
    data: {
      storeName: 'Markitik Fashion Boutique',
      clientName: 'Nour El Houda',
      clientPhone: '+216 92 884 102',
      address: '22 Rue de Marseille, 4ème étage',
      governorate: 'Tunis',
      codAmount: 78.5,
      orderId: 'MKT-20491',
      webhookUrl: 'http://localhost:3000/api/webhooks/shipping'
    }
  },
  {
    name: 'High-Tech (Ariana)',
    icon: '🎧',
    data: {
      storeName: 'TechZone Tunisia',
      clientName: 'Wassim Mahjoub',
      clientPhone: '+216 54 119 883',
      address: 'Résidence Les Palmiers, Borj Louzir',
      governorate: 'Ariana',
      codAmount: 185.0,
      orderId: 'MKT-20492',
      webhookUrl: 'http://localhost:3000/api/webhooks/shipping'
    }
  },
  {
    name: 'Cosmetics (Sousse)',
    icon: '💄',
    data: {
      storeName: 'BioCosmetics Carthage',
      clientName: 'Meriem Cherif',
      clientPhone: '+216 26 774 331',
      address: 'Avenue 14 Janvier, Khezama',
      governorate: 'Sousse',
      codAmount: 52.0,
      orderId: 'MKT-20493',
      webhookUrl: 'http://localhost:3000/api/webhooks/shipping'
    }
  }
];

export const ShipmentSandbox: React.FC<ShipmentSandboxProps> = ({
  onShipmentCreated,
  onOpenWaybill
}) => {
  const [formData, setFormData] = useState<CreateShipmentPayload>({
    storeName: 'Markitik Store',
    clientName: 'Amine Ben Salah',
    clientPhone: '+216 98 765 432',
    address: '15 Rue de Palestine, Lafayette',
    governorate: 'Tunis',
    codAmount: 95.0,
    orderId: `MKT-${Math.floor(10000 + Math.random() * 90000)}`,
    webhookUrl: 'http://localhost:3000/api/webhooks/shipping'
  });

  const [loading, setLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState<CreateShipmentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const applyTemplate = (tpl: typeof PRESET_TEMPLATES[0]) => {
    setFormData({
      ...tpl.data,
      orderId: `MKT-${Math.floor(10000 + Math.random() * 90000)}`
    });
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setLastResponse(null);

    try {
      const res = await fetch('/api/carrier/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          codAmount: Number(formData.codAmount)
        })
      });

      const data: CreateShipmentResponse = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || (data as any).error || 'Erreur lors de la création');
      }

      setLastResponse(data);
      if (data.parcel) {
        onShipmentCreated(data.parcel);
      }
    } catch (err: any) {
      setError(err.message || 'Échec de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const curlCommand = `curl -X POST "${window.location.origin}/api/carrier/ship" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(formData, null, 2)}'`;

  const copyCurl = () => {
    navigator.clipboard.writeText(curlCommand);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Form & Presets */}
      <div className="lg:col-span-7 space-y-4">
        {/* Preset quick buttons */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Exemples de commandes prêtes :</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {PRESET_TEMPLATES.map((tpl) => (
              <button
                key={tpl.name}
                type="button"
                onClick={() => applyTemplate(tpl)}
                className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 text-left transition flex items-center gap-2"
              >
                <span className="text-lg">{tpl.icon}</span>
                <div className="truncate">
                  <div className="text-xs font-bold text-slate-800 truncate">{tpl.name}</div>
                  <div className="text-[11px] text-slate-500">{tpl.data.codAmount} DT</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* API Form */}
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-xs font-bold">
                POST
              </span>
              <span className="font-mono text-xs font-bold text-slate-800">/api/carrier/ship</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Simule l'envoi d'une commande depuis Markitik vers le transporteur Express Logistics.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nom de la Boutique (storeName)
              </label>
              <input
                type="text"
                required
                value={formData.storeName}
                onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Réf Commande (orderId)
              </label>
              <input
                type="text"
                value={formData.orderId}
                onChange={(e) => setFormData({ ...formData, orderId: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nom du Client (clientName) *
              </label>
              <input
                type="text"
                required
                value={formData.clientName}
                onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Téléphone Client (clientPhone) *
              </label>
              <input
                type="text"
                required
                value={formData.clientPhone}
                onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Adresse Complète (address) *
              </label>
              <input
                type="text"
                required
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Gouvernorat (governorate) *
              </label>
              <select
                value={formData.governorate}
                onChange={(e) => setFormData({ ...formData, governorate: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
              >
                {[
                  'Tunis', 'Ariana', 'Ben Arous', 'Manouba', 'Nabeul', 'Zaghouan', 'Bizerte',
                  'Béja', 'Jendouba', 'Le Kef', 'Siliana', 'Sousse', 'Monastir', 'Mahdia',
                  'Sfax', 'Kairouan', 'Kasserine', 'Sidi Bouzid', 'Gabès', 'Médenine',
                  'Tataouine', 'Gafsa', 'Tozeur', 'Kébili'
                ].map((gov) => (
                  <option key={gov} value={gov}>
                    {gov}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Montant C.O.D (codAmount DT) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  required
                  value={formData.codAmount}
                  onChange={(e) => setFormData({ ...formData, codAmount: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-bold"
                />
                <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">DT</span>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                URL de Notification Webhook (webhookUrl)
              </label>
              <input
                type="text"
                value={formData.webhookUrl}
                onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                placeholder="http://localhost:3000/api/webhooks/shipping"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Le transporteur enverra les événements DELIVERED / RETURNED à cette URL.
              </span>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            id="btn-submit-shipment"
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <Send className="w-4 h-4 text-amber-400" />
                <span>Expédier vers Transporteur (POST /api/carrier/ship)</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Right Column: Response & cURL */}
      <div className="lg:col-span-5 space-y-4">
        {/* Result Card when response arrives */}
        {lastResponse && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center gap-2 text-emerald-900 font-black text-sm mb-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>Colis Créé avec Succès (201 Created)</span>
            </div>

            <div className="bg-white rounded-xl p-3 border border-emerald-200 space-y-2 text-xs mb-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">N° de Suivi :</span>
                <span className="font-mono font-black text-slate-900 text-sm bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                  {lastResponse.trackingNumber}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Statut Initial :</span>
                <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  EN_TRANSIT
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Lien Bordereau :</span>
                <span className="font-mono text-slate-700 text-[11px] truncate max-w-[180px]">
                  {lastResponse.waybillUrl}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => lastResponse.parcel && onOpenWaybill(lastResponse.parcel)}
                className="py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Printer className="w-3.5 h-3.5 text-amber-400" />
                <span>Voir Bordereau A6</span>
              </button>

              <a
                href={lastResponse.waybillUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Imprimer (Direct)</span>
              </a>
            </div>
          </div>
        )}

        {/* cURL & Code Example */}
        <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold">Exemple d'Intégration cURL</span>
            </div>
            <button
              onClick={copyCurl}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 bg-slate-800 px-2.5 py-1 rounded-md border border-slate-700 transition"
            >
              {copiedCurl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">Copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copier</span>
                </>
              )}
            </button>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl font-mono text-[11px] text-amber-300 overflow-x-auto leading-relaxed border border-slate-800">
            <pre>{curlCommand}</pre>
          </div>

          <div className="text-[11px] text-slate-400 pt-1 space-y-1">
            <div>
              ⚡ <strong className="text-slate-200">Génération automatique</strong> du bordereau A6 accessible via{' '}
              <code className="text-amber-400">/labels/:trackingNumber</code>.
            </div>
            <div>
              🔄 <strong className="text-slate-200">Webhook instantané</strong> envoyé lors de la livraison ou du retour.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
