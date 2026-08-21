// Table-based layout on purpose -- flexbox/grid gets stripped by enough
// email clients (Outlook, some Gmail rendering paths) that it's not worth
// the risk for a report that has to look right the first time a vendor
// opens it.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function money(n) {
  return `$${Number(n ?? 0).toFixed(2)}`
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function buildVendorReportHtml(vendorName, rows) {
  const totals = rows.reduce(
    (acc, r) => ({
      unlocks: acc.unlocks + (r.unlocks ?? 0),
      redemptions: acc.redemptions + (r.redemptions ?? 0),
      attributed_sales: acc.attributed_sales + Number(r.attributed_sales ?? 0),
    }),
    { unlocks: 0, redemptions: 0, attributed_sales: 0 }
  )

  const rowsHtml =
    rows
      .map(
        (r) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #2a2a2a;">${escapeHtml(r.campaign_name || r.headline || 'Campaign')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #2a2a2a;">${fmtDate(r.starts_at)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #2a2a2a;text-align:right;">${r.views ?? 0}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #2a2a2a;text-align:right;">${r.unlocks ?? 0}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #2a2a2a;text-align:right;">${r.redemptions ?? 0}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #2a2a2a;text-align:right;">${money(r.attributed_sales)}</td>
      </tr>`
      )
      .join('') || `<tr><td colspan="6" style="padding:12px 10px;color:#999;">No campaigns yet.</td></tr>`

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#161616;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#f5f5f5;">
        <tr><td style="padding:24px 24px 4px;">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#ff3d1a;font-weight:bold;">Hot Hand Buys</div>
          <div style="font-size:20px;font-weight:bold;margin-top:4px;">${escapeHtml(vendorName)}'s Report</div>
        </td></tr>
        <tr><td style="padding:16px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right:20px;">
                <div style="font-size:26px;font-weight:bold;">${totals.unlocks}</div>
                <div style="font-size:11px;color:#999;text-transform:uppercase;">Unlocks</div>
              </td>
              <td style="padding-right:20px;">
                <div style="font-size:26px;font-weight:bold;">${totals.redemptions}</div>
                <div style="font-size:11px;color:#999;text-transform:uppercase;">Redemptions</div>
              </td>
              <td>
                <div style="font-size:26px;font-weight:bold;">${money(totals.attributed_sales)}</div>
                <div style="font-size:11px;color:#999;text-transform:uppercase;">Attributed sales</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 24px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse;">
            <thead>
              <tr style="color:#999;text-align:left;">
                <th style="padding:8px 10px;font-weight:normal;">Campaign</th>
                <th style="padding:8px 10px;font-weight:normal;">Date</th>
                <th style="padding:8px 10px;font-weight:normal;text-align:right;">Views</th>
                <th style="padding:8px 10px;font-weight:normal;text-align:right;">Unlocks</th>
                <th style="padding:8px 10px;font-weight:normal;text-align:right;">Redeemed</th>
                <th style="padding:8px 10px;font-weight:normal;text-align:right;">Sales</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </td></tr>
        <tr><td style="padding:0 24px 24px;color:#666;font-size:11px;">
          Questions about these numbers? Just reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>`
}
