// Proxies BOM info and version checks from ERPNext
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const API_KEY    = process.env.ERP_API_KEY;
  const API_SECRET = process.env.ERP_API_SECRET;
  const ERP_URL    = process.env.ERP_URL || 'https://amidc.frappe.cloud';
  const headers    = { 'Authorization': `token ${API_KEY}:${API_SECRET}` };

  const { action, bom, item } = req.query;

  try {
    if (action === 'info') {
      // Fetch single BOM details
      const r = await fetch(`${ERP_URL}/api/resource/BOM/${bom}?fields=["name","modified","modified_by","is_active","is_default","docstatus","workflow_state"]`, { headers });
      const d = await r.json();
      return res.status(200).json(d.data || {});
    }

    if (action === 'latest') {
      // Find all BOMs for item, return newest version
      const f = encodeURIComponent(JSON.stringify([['item', '=', item]]));
      const r = await fetch(`${ERP_URL}/api/resource/BOM?filters=${f}&fields=["name","docstatus","is_active","is_default"]&limit=50`, { headers });
      const d = await r.json();
      return res.status(200).json({ boms: d.data || [] });
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
