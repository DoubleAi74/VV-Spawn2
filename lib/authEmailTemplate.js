function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildAuthEmail({
  preheader,
  title,
  message,
  actionLabel,
  actionUrl,
  actionHint,
  expiryLabel,
  footer,
}) {
  const safePreheader = escapeHtml(preheader);
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeActionLabel = escapeHtml(actionLabel);
  const safeActionUrl = escapeHtml(actionUrl);
  const safeActionHint = actionHint ? escapeHtml(actionHint) : '';
  const safeExpiryLabel = expiryLabel ? escapeHtml(expiryLabel) : '';
  const safeFooter = escapeHtml(footer);

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#09090b;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
      ${safePreheader}
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#09090b;margin:0;padding:0;width:100%;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;width:100%;">
            <tr>
              <td style="padding:0 0 18px 0;text-align:center;">
                <div style="display:inline-block;padding:7px 14px;border:1px solid rgba(255,255,255,0.12);border-radius:999px;background-color:rgba(255,255,255,0.04);color:#d4d4d8;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;">
                  Volvox Works
                </div>
              </td>
            </tr>
            <tr>
              <td style="border:1px solid rgba(255,255,255,0.08);border-radius:14px;overflow:hidden;background:linear-gradient(180deg, rgba(39,39,42,0.92) 0%, rgba(9,9,11,0.98) 100%);box-shadow:0 24px 60px rgba(0,0,0,0.42);">
                <div style="height:10px;background-color:#406070;border-bottom:1px solid rgba(255,255,255,0.08);"></div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="padding:36px 36px 18px 36px;text-align:center;">
                      <div style="font-size:34px;line-height:1.1;font-weight:600;letter-spacing:-0.03em;color:#ffffff;">
                        Volvox Works
                      </div>
                      <div style="margin-top:14px;font-size:15px;line-height:1.7;color:#d4d4d8;">
                        ${safeTitle}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 36px 8px 36px;">
                      <div style="border:1px solid rgba(255,255,255,0.07);border-radius:10px;background-color:rgba(255,255,255,0.04);padding:20px 20px 18px 20px;">
                        <div style="font-size:15px;line-height:1.7;color:#e4e4e7;">
                          ${safeMessage}
                        </div>
                        ${safeExpiryLabel ? `<div style="margin-top:10px;font-size:13px;line-height:1.6;color:#a1a1aa;">${safeExpiryLabel}</div>` : ''}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding:28px 36px 10px 36px;">
                      <a href="${safeActionUrl}" style="display:inline-block;padding:14px 24px;border-radius:8px;background-color:#f4f4f5;border:1px solid rgba(255,255,255,0.18);color:#111214;font-size:14px;font-weight:700;letter-spacing:0.01em;text-decoration:none;">
                        ${safeActionLabel}
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 36px 6px 36px;text-align:center;">
                      <div style="font-size:12px;line-height:1.7;color:#a1a1aa;">
                        ${safeActionHint || 'If the button does not work, copy and paste this link into your browser:'}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 36px 18px 36px;text-align:center;">
                      <a href="${safeActionUrl}" style="font-size:12px;line-height:1.7;color:#d4d4d8;word-break:break-all;text-decoration:underline;">
                        ${safeActionUrl}
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 36px 32px 36px;text-align:center;">
                      <div style="font-size:12px;line-height:1.7;color:#71717a;">
                        ${safeFooter}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    'Volvox Works',
    '',
    title,
    '',
    message,
    expiryLabel || '',
    '',
    `${actionLabel}: ${actionUrl}`,
    '',
    footer,
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
}
