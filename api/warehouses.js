// Serverless function: fetches live warehouse breakdown for a single item
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const API_KEY    = process.env.ERP_API_KEY;
  const API_SECRET = process.env.ERP_API_SECRET;
  const ERP_URL    = process.env.ERP_URL || 'https://amidc.frappe.cloud';

  if (!API_KEY || !API_SECRET) {
    return res.status(500).json({ error: 'ERP credentials not configured.' });
  }

  const { item } = req.query;
  if (!item) return res.status(400).json({ error: 'Missing item parameter' });

  const filters = encodeURIComponent(JSON.stringify([['item_code', '=', item]]));
  const url = `${ERP_URL}/api/resource/Bin?filters=${filters}&fields=["warehouse","actual_qty"]&limit=50`;

  try {
    const resp = await fetch(url, {
      headers: {
        'Authorization': `token ${API_KEY}:${API_SECRET}`,
        'Content-Type': 'application/json'
      }
    });
    const data = await resp.json();
    const warehouses = (data.data || [])
      .filter(r => r.actual_qty > 0)
      .map(r => ({ wh: r.warehouse.split(' - ')[0], qty: r.actual_qty }))
      .sort((a, b) => b.qty - a.qty);
    res.status(200).json({ warehouses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
