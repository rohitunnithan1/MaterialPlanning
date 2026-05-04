// Serverless function: proxies ERPNext Bin API to avoid CORS
// API key stored securely as Vercel environment variables

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const API_KEY    = process.env.ERP_API_KEY;
  const API_SECRET = process.env.ERP_API_SECRET;
  const ERP_URL    = process.env.ERP_URL || 'https://amidc.frappe.cloud';

  if (!API_KEY || !API_SECRET) {
    return res.status(500).json({ error: 'ERP credentials not configured in environment variables.' });
  }

  const { items } = req.query;
  if (!items) return res.status(400).json({ error: 'Missing items parameter' });

  const codes = items.split(',').filter(Boolean);
  const filters = encodeURIComponent(JSON.stringify([['item_code', 'in', codes]]));
  const url = `${ERP_URL}/api/resource/Bin?filters=${filters}&fields=["item_code","actual_qty"]&limit=600`;

  try {
    const resp = await fetch(url, {
      headers: {
        'Authorization': `token ${API_KEY}:${API_SECRET}`,
        'Content-Type': 'application/json'
      }
    });
    const data = await resp.json();
    // Aggregate by item_code (sum across warehouses)
    const stock = {};
    for (const row of (data.data || [])) {
      stock[row.item_code] = (stock[row.item_code] || 0) + (row.actual_qty || 0);
    }
    res.status(200).json({ stock });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
