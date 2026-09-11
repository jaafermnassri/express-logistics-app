import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { generateBarcodeSVG } from './src/utils/barcode';

interface Parcel {
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
  status: 'EN_TRANSIT' | 'DELIVERED' | 'RETURNED' | 'PENDING' | 'EN_ATTENTE' | 'EXPEDIE';
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
  returnedAt?: string;
  returnReason?: string;
  driverNotes?: string;
  codCollected?: number;
}

interface WebhookLog {
  id: string;
  timestamp: string;
  trackingNumber: string;
  orderId: string;
  status: string;
  targetUrl: string;
  payload: Record<string, unknown>;
  statusCode?: number;
  responseBody?: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

const FAKE_TRACKINGS = new Set(['TRK-748291', 'TRK-392014', 'TRK-582103', 'TRK-109482', 'TRK-892110']);
const FAKE_CLIENT_NAMES = new Set(['Sarra Ben Ali', 'Karim Mansour', 'Ines Trabelsi', 'Mohamed Dridi', 'Yassine Belhadj']);

// In-Memory Data Store (empty by default; real orders are received from Markitik)
const parcels: Map<string, Parcel> = new Map();
const webhookLogs: WebhookLog[] = [];

// Seed initial packages - DISABLED (real orders only)
function initializeSeeds() {
  // Empty: no fake clients
}

// Generate unique tracking number TRK-XXXXXX
function generateTrackingNumber(): string {
  let trk = '';
  do {
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    trk = `TRK-${randomDigits}`;
  } while (parcels.has(trk));
  return trk;
}

// Outbound Webhook Dispatcher
async function dispatchWebhook(parcel: Parcel, status: 'DELIVERED' | 'RETURNED', reason?: string): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const rawWebhookUrl = (parcel.webhookUrl || '').trim();
  let targetUrl: string;

  if (!rawWebhookUrl) {
    targetUrl = 'http://localhost:3000/api/webhooks/shipping';
  } else if (rawWebhookUrl.startsWith('/')) {
    targetUrl = `http://localhost:3000${rawWebhookUrl}`;
  } else {
    targetUrl = rawWebhookUrl;
  }

  const startTime = Date.now();

  const finalReason = status === 'RETURNED' ? (reason || 'Refus client / Non joignable') : null;

  // Standard Webhook Payload according to Markitik Carrier contract
  const payload = {
    trackingNumber: parcel.trackingNumber,
    orderId: parcel.orderId,
    status: status,
    codCollected: status === 'DELIVERED' ? Number(parcel.codAmount || 0) : 0,
    reason: finalReason
  };

  const webhookLog: WebhookLog = {
    id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    trackingNumber: parcel.trackingNumber,
    orderId: parcel.orderId,
    status: status,
    targetUrl: targetUrl,
    payload: payload,
    success: false,
    durationMs: 0
  };

  try {
    console.log(`[Carrier Webhook] Dispatching ${status} to ${targetUrl} for ${parcel.trackingNumber}`);
    
    // We use native fetch (available in Node 18+) with 6s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Express-Logistics-Webhook/1.0',
        'X-Carrier-Event': `shipment.${status.toLowerCase()}`,
        'X-Carrier-Signature': `sig_${Date.now()}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;
    const responseText = await response.text();

    webhookLog.statusCode = response.status;
    webhookLog.responseBody = responseText.slice(0, 500);
    webhookLog.success = response.ok;
    webhookLog.durationMs = durationMs;

    webhookLogs.unshift(webhookLog);
    if (webhookLogs.length > 100) webhookLogs.pop();

    return { success: response.ok, statusCode: response.status };
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[Carrier Webhook] Failed to deliver to ${targetUrl}: ${errorMsg}`);

    webhookLog.success = false;
    webhookLog.durationMs = durationMs;
    webhookLog.error = errorMsg;
    webhookLogs.unshift(webhookLog);
    if (webhookLogs.length > 100) webhookLogs.pop();

    return { success: false, error: errorMsg };
  }
}

// Generate Printable A6 Shipping Bordereau HTML
function renderA6WaybillHTML(parcel: Parcel, autoPrint = true): string {
  const barcodeSvg = generateBarcodeSVG(parcel.trackingNumber, 320, 68);
  const formattedCod = Number(parcel.codAmount || 0).toFixed(3);
  const dateFormatted = new Date(parcel.createdAt).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bordereau de Livraison - ${parcel.trackingNumber}</title>
  <style>
    @page {
      size: 105mm 148mm; /* Standard A6 */
      margin: 0;
    }
    *, *:before, *:after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
    }
    
    /* On-screen toolbar */
    .screen-toolbar {
      width: 100%;
      max-width: 440px;
      padding: 12px 16px;
      margin: 16px auto 8px auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    .btn {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-primary {
      background: #0f172a;
      color: #ffffff;
    }
    .btn-secondary {
      background: #e2e8f0;
      color: #334155;
    }
    .btn:hover {
      opacity: 0.9;
    }

    /* A6 Sticker Container */
    .waybill-container {
      width: 105mm;
      min-height: 148mm;
      height: 148mm;
      background: #ffffff;
      margin: 8px auto 24px auto;
      padding: 5mm;
      border: 2px solid #000000;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
    }

    .header-table {
      width: 100%;
      border-collapse: collapse;
      border-bottom: 2px solid #000;
      padding-bottom: 4px;
      margin-bottom: 4px;
    }
    .header-logo {
      font-size: 15px;
      font-weight: 900;
      letter-spacing: -0.5px;
      text-transform: uppercase;
    }
    .header-sub {
      font-size: 8px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
    }
    .header-type {
      text-align: right;
      font-size: 11px;
      font-weight: 800;
      background: #000;
      color: #fff;
      padding: 2px 6px;
      border-radius: 2px;
      display: inline-block;
    }

    .barcode-section {
      text-align: center;
      padding: 4px 0;
      border-bottom: 1.5px solid #000;
      background: #fafafa;
    }

    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      margin: 4px 0;
    }

    .box {
      border: 1px solid #000;
      padding: 4px 6px;
      border-radius: 2px;
      background: #fff;
    }
    .box-title {
      font-size: 8px;
      font-weight: 800;
      text-transform: uppercase;
      color: #475569;
      margin-bottom: 2px;
      border-bottom: 0.5px solid #cbd5e1;
      padding-bottom: 1px;
    }
    .box-content {
      font-size: 10px;
      line-height: 1.25;
    }
    .box-content strong {
      font-size: 11px;
      display: block;
      color: #000;
    }

    .recipient-box {
      border: 1.5px solid #000;
      padding: 6px;
      margin: 4px 0;
      background: #fff;
    }
    .recipient-name {
      font-size: 13px;
      font-weight: 800;
      color: #000;
    }
    .recipient-phone {
      font-size: 12px;
      font-weight: 800;
      color: #000;
      margin: 2px 0;
    }
    .recipient-address {
      font-size: 10px;
      color: #1e293b;
      margin-top: 2px;
    }
    .recipient-gov {
      display: inline-block;
      margin-top: 4px;
      background: #000;
      color: #fff;
      font-size: 10px;
      font-weight: 800;
      padding: 1px 6px;
      border-radius: 2px;
      text-transform: uppercase;
    }

    /* COD BOX - Most prominent */
    .cod-box {
      border: 2.5px solid #000000;
      background: #ffffff;
      padding: 6px 8px;
      margin: 5px 0;
      text-align: center;
    }
    .cod-title {
      font-size: 9px;
      font-weight: 900;
      letter-spacing: 0.5px;
      color: #000000;
      text-transform: uppercase;
    }
    .cod-amount {
      font-size: 20px;
      font-weight: 900;
      color: #000000;
      letter-spacing: -0.5px;
      margin: 2px 0;
    }

    .footer-meta {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-top: 1px solid #000;
      padding-top: 3px;
      font-size: 7.5px;
      color: #334155;
    }
    .signature-zone {
      border: 1px dashed #94a3b8;
      width: 32mm;
      height: 12mm;
      padding: 2px;
      font-size: 7px;
      color: #64748b;
      text-align: center;
    }

    @media print {
      body {
        background: none !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .screen-toolbar {
        display: none !important;
      }
      .waybill-container {
        margin: 0 !important;
        box-shadow: none !important;
        border: 2px solid #000 !important;
        page-break-after: always;
      }
    }
  </style>
</head>
<body>

  <div class="screen-toolbar">
    <div>
      <strong style="font-size: 13px;">Bordereau A6</strong>
      <span style="font-size: 12px; color: #64748b; margin-left: 6px;">(${parcel.trackingNumber})</span>
    </div>
    <div style="display: flex; gap: 8px;">
      <a href="/driver" class="btn btn-secondary">← Retour Driver</a>
      <button onclick="window.print()" class="btn btn-primary">🖨️ Imprimer A6</button>
    </div>
  </div>

  <div class="waybill-container">
    <!-- Header -->
    <table class="header-table">
      <tr>
        <td>
          <div class="header-logo">⚡ EXPRESS LOGISTICS</div>
          <div class="header-sub">Réseau National de Livraison Rapide</div>
        </td>
        <td style="text-align: right;">
          <span class="header-type">BORDEREAU DE LIVRAISON</span>
          <div style="font-size: 8px; font-weight: bold; margin-top: 2px;">STANDARD COD A6</div>
        </td>
      </tr>
    </table>

    <!-- Barcode -->
    <div class="barcode-section">
      ${barcodeSvg}
    </div>

    <!-- Sender & Order Details -->
    <div class="info-grid">
      <div class="box">
        <div class="box-title">EXPÉDITEUR (BOUTIQUE)</div>
        <div class="box-content">
          <strong>${parcel.storeName || 'Boutique Partenaire'}</strong>
          <span>Réf Commande: ${parcel.orderId || 'N/A'}</span>
        </div>
      </div>
      <div class="box">
        <div class="box-title">INFO COLIS & DATE</div>
        <div class="box-content">
          <strong>Service 24H / Express</strong>
          <span>Créé: ${dateFormatted}</span>
        </div>
      </div>
    </div>

    <!-- Recipient -->
    <div class="recipient-box">
      <div class="box-title" style="margin-bottom: 4px;">DESTINATAIRE (CLIENT)</div>
      <div class="recipient-name">${parcel.clientName}</div>
      <div class="recipient-phone">📞 ${parcel.clientPhone}</div>
      <div class="recipient-address">📍 ${parcel.address}</div>
      <span class="recipient-gov">${parcel.governorate}</span>
    </div>

    <!-- COD AMOUNT (Prominent Box) -->
    <div class="cod-box">
      <div class="cod-title">MONTANT TOTAL À ENCAISSER (C.O.D)</div>
      <div class="cod-amount">${formattedCod} DT</div>
      <div style="font-size: 8px; font-weight: 600; color: #334155;">(Espèces à la livraison obligatoire)</div>
    </div>

    <!-- Footer & Driver signature zone -->
    <div class="footer-meta">
      <div>
        <div><strong>Express Carrier Simulator</strong></div>
        <div>Tracking: ${parcel.trackingNumber} | Ord: ${parcel.orderId}</div>
        <div>Conserver ce récépissé en cas de réclamation</div>
      </div>
      <div class="signature-zone">
        Signature & Cachet Client
      </div>
    </div>
  </div>

  ${autoPrint ? `<script>
    window.onload = function() {
      // Print automatically if not disabled in url
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('autoprint') !== 'false' && urlParams.get('noprint') !== '1') {
        setTimeout(function() {
          window.print();
        }, 400);
      }
    };
  </script>` : ''}
</body>
</html>`;
}

// Determine server port by inspecting process.argv and process.env.PORT, defaulting to 4000
function determinePort(): number {
  // Check process.argv for port parameters (e.g. --port 4000 or --port=4000)
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--port' || arg === '-p') {
      const nextVal = parseInt(process.argv[i + 1], 10);
      if (!isNaN(nextVal) && nextVal > 0) return nextVal;
    } else if (arg.startsWith('--port=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val) && val > 0) return val;
    } else if (arg.startsWith('-p=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val) && val > 0) return val;
    }
  }

  // Check process.env.PORT
  if (process.env.PORT) {
    const envPort = parseInt(process.env.PORT, 10);
    if (!isNaN(envPort) && envPort > 0) {
      return envPort;
    }
  }

  // Default to port 4000 if neither is explicitly passed (process.env.PORT || 4000)
  return Number(process.env.PORT) || 4000;
}

const app = express();
const PORT: number = determinePort();

// Enable CORS on all express endpoints using cors() so Markitik can trigger dispatch webhooks across domains
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Fallback explicit CORS headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Express Delivery Driver Portal', parcelsCount: parcels.size });
});

  // ==========================================
  // 1. DISPATCH WEBHOOK ENDPOINT FOR MARKITIK
  // POST /api/express-logistics/dispatch
  // Accepts: { storeName, orderId, clientName, clientPhone, address, governorate, codAmount, webhookUrl }
  // Returns: 200 OK with { success: true, trackingNumber: '...' }
  // ==========================================
  app.post('/api/express-logistics/dispatch', (req, res) => {
    try {
      const body = req.body || {};
      const storeName = body.storeName || body.store_name || body.shopName || body.shop_name || body.store || 'Markitik Store';
      const orderId = body.orderId || body.order_id || body.orderNumber || body.order_number || body.orderRef || body.order_ref || `MKT-${Math.floor(10000 + Math.random() * 90000)}`;
      const clientName = body.clientName || body.client_name || body.customerName || body.customer_name || body.recipientName || body.name || body.client || 'Client Destinataire';
      const clientPhone = body.clientPhone || body.client_phone || body.customerPhone || body.customer_phone || body.phone || body.telephone || body.tel || '+216 98 000 000';
      const address = body.address || body.shippingAddress || body.shipping_address || body.destination || body.street || 'Adresse de livraison';
      const governorate = body.governorate || body.city || body.ville || body.state || body.region || body.gov || 'Tunis';
      const rawCod = body.codAmount ?? body.cod_amount ?? body.cod ?? body.totalAmount ?? body.total_amount ?? body.amount ?? body.total ?? 0;
      const parsedCod = typeof rawCod === 'string' ? parseFloat(rawCod) || 0 : Number(rawCod) || 0;
      const webhookUrl = body.webhookUrl || body.webhook_url || body.callbackUrl || body.callback_url || 'http://localhost:3000/api/webhooks/shipping';

      const trackingNumber = body.trackingNumber || generateTrackingNumber();
      const now = new Date().toISOString();

      const newParcel: Parcel = {
        id: `parcel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        trackingNumber: trackingNumber,
        storeName: String(storeName).trim(),
        orderId: String(orderId).trim(),
        clientName: String(clientName).trim(),
        clientPhone: String(clientPhone).trim(),
        address: String(address).trim(),
        governorate: String(governorate).trim(),
        codAmount: parsedCod,
        webhookUrl: String(webhookUrl).trim(),
        status: 'EXPEDIE',
        createdAt: now,
        updatedAt: now
      };

      // Save this record into the backend storage/database so it renders immediately on the Driver Portal
      parcels.set(trackingNumber, newParcel);

      console.log(`[Express Logistics Dispatch] Received order ${newParcel.orderId} -> assigned ${trackingNumber}, Client: ${newParcel.clientName}, COD: ${parsedCod} DT, Webhook: ${newParcel.webhookUrl}`);

      return res.status(200).json({
        success: true,
        trackingNumber: newParcel.trackingNumber,
        orderId: newParcel.orderId,
        waybillUrl: `/labels/${trackingNumber}`,
        parcel: newParcel,
        message: 'Expédition enregistrée avec succès'
      });
    } catch (err: unknown) {
      console.error('[Express Logistics Dispatch] Error:', err);
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Internal server error processing dispatch'
      });
    }
  });

  // ==========================================
  // 1B. LEGACY/COMPATIBLE SHIPMENT RECEPTION ROUTE
  // POST /api/carrier/ship
  // ==========================================
  app.post('/api/carrier/ship', (req, res) => {
    try {
      const body = req.body || {};
      const storeName = body.storeName || body.store_name || body.shopName || body.shop_name || body.store || 'Markitik Store';
      const orderId = body.orderId || body.order_id || body.orderNumber || body.order_number || body.orderRef || body.order_ref || `MKT-${Math.floor(10000 + Math.random() * 90000)}`;
      const clientName = body.clientName || body.client_name || body.customerName || body.customer_name || body.recipientName || body.name || body.client || 'Client Destinataire';
      const clientPhone = body.clientPhone || body.client_phone || body.customerPhone || body.customer_phone || body.phone || body.telephone || body.tel || '+216 98 000 000';
      const address = body.address || body.shippingAddress || body.shipping_address || body.destination || body.street || 'Adresse de livraison';
      const governorate = body.governorate || body.city || body.ville || body.state || body.region || body.gov || 'Tunis';
      const rawCod = body.codAmount ?? body.cod_amount ?? body.cod ?? body.totalAmount ?? body.total_amount ?? body.amount ?? body.total ?? 0;
      const parsedCod = typeof rawCod === 'string' ? parseFloat(rawCod) || 0 : Number(rawCod) || 0;
      const webhookUrl = body.webhookUrl || body.webhook_url || body.callbackUrl || body.callback_url || 'http://localhost:3000/api/webhooks/shipping';

      const trackingNumber = generateTrackingNumber();
      const now = new Date().toISOString();

      const newParcel: Parcel = {
        id: `parcel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        trackingNumber: trackingNumber,
        storeName: String(storeName).trim(),
        orderId: String(orderId).trim(),
        clientName: String(clientName).trim(),
        clientPhone: String(clientPhone).trim(),
        address: String(address).trim(),
        governorate: String(governorate).trim(),
        codAmount: parsedCod,
        webhookUrl: String(webhookUrl).trim(),
        status: 'EN_TRANSIT',
        createdAt: now,
        updatedAt: now
      };

      // Store incoming order details into the active parcels database under "En Transit"
      parcels.set(trackingNumber, newParcel);

      console.log(`[Carrier API] New Shipment registered from Markitik: ${trackingNumber} for ${newParcel.clientName} (${newParcel.governorate}), Order: ${newParcel.orderId}, COD: ${parsedCod} DT. Status: EN_TRANSIT.`);

      return res.status(200).json({
        success: true,
        trackingNumber: newParcel.trackingNumber,
        orderId: newParcel.orderId,
        waybillUrl: `/labels/${trackingNumber}`,
        parcel: newParcel,
        message: 'Colis enregistré'
      });
    } catch (err: unknown) {
      console.error('[Carrier API] Error creating shipment:', err);
      return res.status(500).json({
        success: false,
        error: 'Internal server error processing shipment'
      });
    }
  });

  // Batch sync route for cross-app localStorage integration
  app.post('/api/carrier/sync-parcels', (req, res) => {
    try {
      const incoming: Parcel[] = Array.isArray(req.body?.parcels) ? req.body.parcels : [];
      let updatedCount = 0;
      incoming.forEach((p) => {
        if (!p || !p.trackingNumber) return;
        if (FAKE_TRACKINGS.has(p.trackingNumber) || FAKE_CLIENT_NAMES.has(p.clientName)) {
          return;
        }
        const key = p.trackingNumber.toUpperCase();
        const existing = parcels.get(key) || parcels.get(p.trackingNumber);
        if (!existing) {
          parcels.set(p.trackingNumber, { ...p, status: p.status || 'EN_TRANSIT' });
          updatedCount++;
        } else {
          // If incoming status is different or newer, preserve or merge
          if (p.updatedAt && (!existing.updatedAt || new Date(p.updatedAt) > new Date(existing.updatedAt))) {
            parcels.set(p.trackingNumber, { ...existing, ...p });
            updatedCount++;
          }
        }
      });
      return res.json({ success: true, count: parcels.size, updatedCount });
    } catch (err) {
      console.error('[Carrier API] Error syncing parcels:', err);
      return res.status(500).json({ success: false, error: 'Sync failed' });
    }
  });

  // ==========================================
  // 2. REAL A6 BORDEREAU / WAYBILL GENERATOR
  // GET /labels/:trackingNumber
  // ==========================================
  app.get('/labels/:trackingNumber', (req, res) => {
    const { trackingNumber } = req.params;
    const parcel = parcels.get(trackingNumber.toUpperCase()) || parcels.get(trackingNumber);

    if (!parcel) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Bordereau Non Trouvé</title></head>
        <body style="font-family:sans-serif;padding:40px;text-align:center;">
          <h2>❌ Bordereau non trouvé pour "${trackingNumber}"</h2>
          <p>Ce numéro de colis n'existe pas dans le système Express Logistics.</p>
          <p><a href="/driver">← Retour au portail chauffeur</a></p>
        </body>
        </html>
      `);
    }

    const autoPrint = req.query.autoprint !== 'false' && req.query.noprint !== '1';
    const html = renderA6WaybillHTML(parcel, autoPrint);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  });

  // ==========================================
  // 3. PARCEL MANAGEMENT APIS (FOR DRIVER UI & PORTAL)
  // ==========================================
  app.get('/api/carrier/parcels', (req, res) => {
    const { status, search } = req.query;
    let list = Array.from(parcels.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    if (status && typeof status === 'string' && status !== 'ALL') {
      list = list.filter((p) => p.status === status);
    }

    if (search && typeof search === 'string') {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.trackingNumber.toLowerCase().includes(q) ||
          p.clientName.toLowerCase().includes(q) ||
          p.clientPhone.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q) ||
          p.governorate.toLowerCase().includes(q) ||
          p.storeName.toLowerCase().includes(q) ||
          p.orderId.toLowerCase().includes(q)
      );
    }

    // Compute stats
    const all = Array.from(parcels.values());
    const isActive = (s: string) => ['EN_TRANSIT', 'EXPEDIE', 'EN_ATTENTE', 'PENDING'].includes(s);
    const stats = {
      total: all.length,
      enTransit: all.filter((p) => isActive(p.status)).length,
      delivered: all.filter((p) => p.status === 'DELIVERED').length,
      returned: all.filter((p) => p.status === 'RETURNED').length,
      totalCodCollected: all
        .filter((p) => p.status === 'DELIVERED')
        .reduce((sum, p) => sum + (p.codCollected || p.codAmount || 0), 0),
      totalCodPending: all
        .filter((p) => isActive(p.status))
        .reduce((sum, p) => sum + (p.codAmount || 0), 0)
    };

    res.json({ parcels: list, stats });
  });

  app.get('/api/carrier/parcels/:trackingNumber', (req, res) => {
    const { trackingNumber } = req.params;
    const parcel = parcels.get(trackingNumber.toUpperCase()) || parcels.get(trackingNumber);

    if (!parcel) {
      return res.status(404).json({ error: 'Parcel not found' });
    }
    res.json({ parcel });
  });

  // Driver action: Update status (DELIVERED or RETURNED) and trigger outbound webhook
  app.post('/api/carrier/parcels/:trackingNumber/status', async (req, res) => {
    const { trackingNumber } = req.params;
    let { status, reason, driverNotes } = req.body || {};

    const normalizedStatus = String(status || '').toUpperCase().trim();
    let targetStatus: 'DELIVERED' | 'RETURNED' | 'EN_TRANSIT';

    if (['DELIVERED', 'LIVRE', 'LIVRÉ', 'DELIVER'].includes(normalizedStatus)) {
      targetStatus = 'DELIVERED';
    } else if (['RETURNED', 'RETOURNE', 'RETOURNÉ', 'RETURN', 'CANCELLED', 'REFUSED', 'REFUS'].includes(normalizedStatus)) {
      targetStatus = 'RETURNED';
    } else if (['EN_TRANSIT', 'TRANSIT', 'EXPEDIE', 'EXPÉDIÉ', 'EN_ATTENTE', 'PENDING'].includes(normalizedStatus)) {
      targetStatus = 'EN_TRANSIT';
    } else {
      return res.status(400).json({ error: 'Invalid status. Must be DELIVERED (LIVRÉ), RETURNED (RETOURNÉ), or EN_TRANSIT' });
    }

    const parcel = parcels.get(trackingNumber.toUpperCase()) || parcels.get(trackingNumber);
    if (!parcel) {
      return res.status(404).json({ error: 'Parcel not found' });
    }

    const now = new Date().toISOString();
    parcel.status = targetStatus;
    parcel.updatedAt = now;
    if (driverNotes) parcel.driverNotes = driverNotes;

    if (targetStatus === 'DELIVERED') {
      parcel.deliveredAt = now;
      parcel.codCollected = parcel.codAmount;
      parcel.returnReason = undefined;
    } else if (targetStatus === 'RETURNED') {
      parcel.returnedAt = now;
      parcel.returnReason = reason || 'Refus client / Non joignable';
      parcel.codCollected = 0;
    }

    parcels.set(parcel.trackingNumber, parcel);

    // Trigger Outbound Webhook dispatch (Requirement 4)
    let webhookResult = null;
    if (targetStatus === 'DELIVERED' || targetStatus === 'RETURNED') {
      webhookResult = await dispatchWebhook(parcel, targetStatus, reason || (targetStatus === 'RETURNED' ? 'Refus client / Non joignable' : undefined));
    }

    res.json({
      success: true,
      parcel,
      webhookResult
    });
  });

  // ==========================================
  // 4. WEBHOOK LOGS & TESTING APIS
  // ==========================================
  app.get('/api/carrier/webhooks/history', (req, res) => {
    res.json({ logs: webhookLogs });
  });

  // Re-dispatch a webhook
  app.post('/api/carrier/webhooks/resend/:id', async (req, res) => {
    const { id } = req.params;
    const log = webhookLogs.find((l) => l.id === id);
    if (!log) {
      return res.status(404).json({ error: 'Webhook log not found' });
    }

    const parcel = parcels.get(log.trackingNumber);
    if (!parcel) {
      return res.status(404).json({ error: 'Associated parcel not found' });
    }

    const result = await dispatchWebhook(parcel, log.status as 'DELIVERED' | 'RETURNED');
    res.json({ success: true, result });
  });

  // Built-in webhook receiver simulator endpoint (so tests succeed locally even if Markitik is configured on localhost:3000)
  app.post('/api/webhooks/shipping', (req, res) => {
    console.log('[Markitik Webhook Receiver Simulator] Received update:', req.body);
    res.json({
      received: true,
      timestamp: new Date().toISOString(),
      status: 'acknowledged',
      message: `Markitik synchronized order ${req.body.orderId || req.body.trackingNumber} with status ${req.body.status}`
    });
  });

  // Reset demo seeds (clears all)
  app.post('/api/carrier/reset-seeds', (req, res) => {
    parcels.clear();
    res.json({ success: true, message: 'All parcels cleared', count: 0 });
  });

  // ==========================================
  // 5. VITE SPA INTEGRATION & SERVER LISTENER
  // ==========================================
  async function startServer() {
    if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa'
      });
      app.use(vite.middlewares);
    } else if (!process.env.VERCEL) {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    if (!process.env.VERCEL) {
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`Express Delivery Driver Portal running on http://localhost:${PORT}`);
      });
    }
  }

  startServer();

  export default app;
