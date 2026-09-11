import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  RotateCw,
  Clock,
  Send,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Code
} from 'lucide-react';
import { WebhookLog } from '../types';

interface WebhookLogsViewProps {
  onRefresh: () => void;
}

export const WebhookLogsView: React.FC<WebhookLogsViewProps> = ({ onRefresh }) => {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/carrier/webhooks/history');
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (e) {
      console.error('Failed to fetch webhook logs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleResend = async (logId: string) => {
    setResendingId(logId);
    try {
      await fetch(`/api/carrier/webhooks/resend/${logId}`, { method: 'POST' });
      await fetchLogs();
    } catch (e) {
      console.error('Failed to resend webhook:', e);
    } finally {
      setResendingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-bold text-slate-900">Journal des Webhooks Sortants (Outbound Dispatcher)</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Chaque action chauffeur (« Encaisser & Livrer » ou « Refus / Annuler ») déclenche un appel HTTP POST vers l'endpoint configuré de la boutique.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg flex items-center gap-1.5 transition"
        >
          <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualiser</span>
        </button>
      </div>

      {/* Logs Table / List */}
      {logs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
          <Send className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-700">Aucun webhook envoyé pour l'instant</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            Modifiez le statut d'un colis depuis l'onglet Chauffeur pour observer l'envoi en temps réel.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {logs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            const isDelivered = log.status === 'DELIVERED';

            return (
              <div
                key={log.id}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs transition"
              >
                {/* Summary Row */}
                <div
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                  className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 gap-2"
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <button className="text-slate-400">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>

                    {/* Status Badge */}
                    {log.success ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        {log.statusCode || 200} OK
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        {log.statusCode ? `${log.statusCode} Error` : 'Échec / Timeout'}
                      </span>
                    )}

                    {/* Event Type */}
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        isDelivered
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-rose-100 text-rose-900'
                      }`}
                    >
                      {log.status}
                    </span>

                    {/* Tracking number */}
                    <span className="font-mono text-xs font-bold text-slate-800">
                      {log.trackingNumber}
                    </span>

                    {/* Target URL */}
                    <span className="text-xs text-slate-400 truncate hidden md:inline max-w-xs">
                      → {log.targetUrl}
                    </span>
                  </div>

                  <div className="flex items-center space-x-3 text-xs text-slate-400 shrink-0">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(log.timestamp).toLocaleTimeString('fr-FR')}
                    </span>
                    <span className="font-mono text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                      {log.durationMs}ms
                    </span>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="font-bold text-slate-700 mb-1">Détails de l'Appel :</div>
                        <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1 font-mono text-[11px]">
                          <div><strong>Method:</strong> POST</div>
                          <div><strong>URL:</strong> {log.targetUrl}</div>
                          <div><strong>ID Log:</strong> {log.id}</div>
                          <div><strong>Duration:</strong> {log.durationMs} ms</div>
                          {log.error && <div className="text-rose-600"><strong>Error:</strong> {log.error}</div>}
                        </div>
                      </div>

                      <div>
                        <div className="font-bold text-slate-700 mb-1">Réponse Reçue :</div>
                        <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-700 max-h-24 overflow-y-auto">
                          {log.responseBody || (log.success ? '(Réponse vide / 200 OK)' : 'Pas de réponse reçue')}
                        </div>
                      </div>
                    </div>

                    {/* Payload JSON */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          <Code className="w-3.5 h-3.5 text-slate-500" />
                          <span>Payload JSON Envoyé :</span>
                        </div>
                        <button
                          onClick={() => handleResend(log.id)}
                          disabled={resendingId === log.id}
                          className="px-2.5 py-1 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded flex items-center gap-1"
                        >
                          <RotateCw className={`w-3 h-3 ${resendingId === log.id ? 'animate-spin' : ''}`} />
                          <span>Renvoyer Webhook</span>
                        </button>
                      </div>
                      <pre className="bg-slate-900 text-amber-300 p-3 rounded-lg font-mono text-[11px] overflow-x-auto leading-relaxed border border-slate-800">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
