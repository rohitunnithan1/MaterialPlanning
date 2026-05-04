// Increase Vercel function timeout to 60s (needed for scanning many open POs)
export const config = { maxDuration: 60 };

// Fetches open Purchase Orders (last 3 months) and returns pending qty + schedule date per item
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const API_KEY    = process.env.ERP_API_KEY;
  const API_SECRET = process.env.ERP_API_SECRET;
  const ERP_URL    = process.env.ERP_URL || 'https://amidc.frappe.cloud';

  if (!API_KEY || !API_SECRET) {
    return res.status(500).json({ error: 'ERP credentials not configured.' });
  }

  const headers = {
    'Authorization': `token ${API_KEY}:${API_SECRET}`,
    'Content-Type': 'application/json'
  };

  try {
    // Step 1: Get open POs from last 6 months only (keeps count manageable)
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 3);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const filters = encodeURIComponent(JSON.stringify([
      ['status', 'in', ['To Receive and Bill', 'Partially Received']],
      ['transaction_date', '>=', cutoffStr]
    ]));
    const poListUrl = `${ERP_URL}/api/resource/Purchase Order?filters=${filters}&fields=["name","supplier","transaction_date","status"]&limit=500`;
    const poListResp = await fetch(poListUrl, { headers });
    const poListData = await poListResp.json();
    const openPOs = poListData.data || [];

    // Step 2: Fetch each PO in parallel batches of 20
    const BATCH = 30;
    const incoming = {}; // { item_code: { qty_pending, earliest_date, supplier, po, po_count } }

    for (let i = 0; i < openPOs.length; i += BATCH) {
      const batch = openPOs.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(po =>
        fetch(`${ERP_URL}/api/method/frappe.client.get?doctype=Purchase Order&name=${po.name}`, { headers })
          .then(r => r.json())
          .then(d => ({ po, doc: d.message }))
          .catch(() => null)
      ));

      for (const result of results) {
        if (!result?.doc?.items) continue;
        for (const item of result.doc.items) {
          const pending = (item.qty || 0) - (item.received_qty || 0);
          if (pending <= 0) continue;
          const code = item.item_code;
          if (!incoming[code]) {
            incoming[code] = { qty_pending: 0, earliest_date: null, supplier: result.po.supplier, po: result.po.name, po_count: 0 };
          }
          incoming[code].qty_pending += pending;
          incoming[code].po_count++;
          // Track earliest expected date
          if (item.schedule_date) {
            if (!incoming[code].earliest_date || item.schedule_date < incoming[code].earliest_date) {
              incoming[code].earliest_date = item.schedule_date;
            }
          }
        }
      }
    }

    res.status(200).json({ incoming, open_po_count: openPOs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
