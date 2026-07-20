/// <reference lib="deno.ns" />
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://asco.org.za', 'https://www.asco.org.za', 'http://127.0.0.1:5500', 'http://localhost:5500'];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

// ─── HMAC Token Helpers ───────────────────────────────────────────────────────
async function generateToken(memberId: string, campaignId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const data = new TextEncoder().encode(`${memberId}:${campaignId}`);
  const signature = await crypto.subtle.sign('HMAC', key, data);
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex;
}

async function verifyToken(
  memberId: string,
  campaignId: string,
  token: string,
  secret: string,
): Promise<boolean> {
  const expected = await generateToken(memberId, campaignId, secret);
  // Constant-time comparison
  if (expected.length !== token.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return result === 0;
}

// ─── HTML Confirmation Page (with injection of dynamic values) ────────────────
function buildConfirmationPage(
  action: 'unsubscribed' | 'resubscribed',
  resubscribeUrl?: string,
): string {
  const isUnsub = action === 'unsubscribed';

  const toastIcon = isUnsub ? '✕' : '✓';
  const toastBg = isUnsub ? '#d32f2f' : '#2e7d32';
  const toastTitle = isUnsub
    ? 'You have been unsubscribed'
    : 'You have been re-subscribed';
  const toastMessage = isUnsub
    ? 'You will no longer receive email communications from ASIHLANGANENI CIVIC MOVEMENT.'
    : 'You will now receive email communications from ASIHLANGANENI CIVIC MOVEMENT again.';

  const actionLink = isUnsub && resubscribeUrl
    ? `<a href="${resubscribeUrl}" style="display:inline-block;margin-top:16px;padding:10px 24px;background:#ffffff;color:#00450d;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;border:2px solid #00450d;">Re-subscribe</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${isUnsub ? 'Unsubscribed' : 'Re-subscribed'} — ASCO</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .toast {
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: ${toastBg};
      color: #ffffff;
      padding: 16px 32px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 15px;
      font-weight: 600;
      z-index: 100;
      animation: slideDown 0.5s ease-out;
    }
    @keyframes slideDown {
      from { transform: translateX(-50%) translateY(-100px); opacity: 0; }
      to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
    .toast-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: rgba(255,255,255,0.2);
      font-size: 16px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .card {
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      max-width: 480px;
      width: 100%;
      overflow: hidden;
      text-align: center;
    }
    .card-header {
      background: linear-gradient(135deg, #00450d, #1b5e20);
      padding: 40px 32px 24px;
    }
    .card-header h1 {
      color: #acf4a4;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .card-header .sub {
      color: rgba(172, 244, 164, 0.7);
      font-size: 11px;
      letter-spacing: 1px;
      margin-top: 4px;
      text-transform: uppercase;
    }
    .card-body {
      padding: 40px 32px;
    }
    .card-body h2 {
      font-size: 22px;
      font-weight: 700;
      color: #1c1b1b;
      margin-bottom: 12px;
    }
    .card-body p {
      font-size: 15px;
      color: #41493e;
      line-height: 1.7;
      margin-bottom: 8px;
    }
    .card-footer {
      padding: 24px 32px;
      background: #f9f9f9;
      border-top: 1px solid #e0e0e0;
    }
    .btn-primary {
      display: inline-block;
      padding: 14px 32px;
      background: #00450d;
      color: #ffffff;
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
      border-radius: 8px;
      letter-spacing: 0.5px;
      transition: background 0.2s;
    }
    .btn-primary:hover { background: #1b5e20; }
    .footer-text {
      font-size: 11px;
      color: #bdbdbd;
      margin-top: 24px;
      text-align: center;
    }
    .mt-16 { margin-top: 16px; }
  </style>
</head>
<body>
  <div class="toast">
    <span class="toast-icon">${toastIcon}</span>
    ${toastTitle}
  </div>

  <div class="card">
    <div class="card-header">
      <h1>ASIHLANGANENI</h1>
      <div class="sub">CIVIC MOVEMENT</div>
    </div>
    <div class="card-body">
      <h2>${isUnsub ? 'Unsubscribed' : 'Welcome Back'}</h2>
      <p>${toastMessage}</p>
      ${actionLink}
    </div>
    <div class="card-footer">
      <a href="https://asco.org.za" class="btn-primary" target="_blank">Visit ASCO Website</a>
      <p class="mt-16" style="font-size:13px;color:#717a6d;">
        Community · Accountability · Development
      </p>
    </div>
  </div>

  <p class="footer-text">
    © 2025 ASIHLANGANENI CIVIC MOVEMENT · Kwaggafontein, Mpumalanga, South Africa
  </p>
</body>
</html>`;
}

// ─── Main Handler ───────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const UNSUBSCRIBE_SECRET = Deno.env.get('UNSUBSCRIBE_SECRET');
    const PROJECT_URL = Deno.env.get('PROJECT_URL')!;
    const PROJECT_SERVICE_KEY = Deno.env.get('PROJECT_SERVICE_KEY')!;

    if (!UNSUBSCRIBE_SECRET) {
      throw new Error('UNSUBSCRIBE_SECRET is not configured.');
    }

    const db = createClient(PROJECT_URL, PROJECT_SERVICE_KEY);

    // ── Parse query parameters ────────────────────────────────────────────
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'unsubscribe';
    const memberId = url.searchParams.get('member_id');
    const campaignId = url.searchParams.get('campaign_id');
    const token = url.searchParams.get('token');

    if (!memberId || !token) {
      return new Response(buildErrorPage('Missing required parameters.'), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Use a placeholder campaign ID for resubscribe tokens (which don't originate from a specific campaign)
    const campaignIdForToken = campaignId || '00000000-0000-0000-0000-000000000000';

    // ── Verify HMAC token ─────────────────────────────────────────────────
    const isValid = await verifyToken(memberId, campaignIdForToken, token, UNSUBSCRIBE_SECRET);
    if (!isValid) {
      return new Response(buildErrorPage('Invalid or expired link. Please contact support.'), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // ── Look up member ────────────────────────────────────────────────────
    const { data: member, error: memberError } = await db
      .from('members')
      .select('id, email, name, wants_emails')
      .eq('id', memberId)
      .maybeSingle();

    if (memberError || !member) {
      return new Response(buildErrorPage('Member not found.'), {
        status: 404,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // ── Unsubscribe Action ────────────────────────────────────────────────
    if (action === 'unsubscribe' || action === 'unsubscribed') {
      const alreadyDone = !member.wants_emails;

      if (!alreadyDone) {
        const { error: updateError } = await db
          .from('members')
          .update({ wants_emails: false, updated_at: new Date().toISOString() })
          .eq('id', member.id);

        if (updateError) throw new Error(`Failed to unsubscribe: ${updateError.message}`);

        // Log event
        if (campaignId) {
          const { data: recipient } = await db
            .from('campaign_recipients')
            .select('id')
            .eq('campaign_id', campaignId)
            .eq('member_id', member.id)
            .maybeSingle();

          if (recipient) {
            await db.from('campaign_events').insert({
              campaign_recipient_id: recipient.id,
              event_type: 'unsubscribed',
              metadata: { source: 'magic_link', action: 'unsubscribed' },
              created_at: new Date().toISOString(),
            }).maybeSingle();
          }
        }
      }

      // Generate resubscribe URL for the confirmation page
      const placeholderCampaignId = '00000000-0000-0000-0000-000000000000';
      const resubToken = await generateToken(member.id, placeholderCampaignId, UNSUBSCRIBE_SECRET);
      const functionUrl = `${url.origin}${url.pathname}`;
      const resubscribeUrl = `${functionUrl}?action=resubscribe&member_id=${member.id}&campaign_id=${placeholderCampaignId}&token=${resubToken}`;

      const html = buildConfirmationPage('unsubscribed', resubscribeUrl);

      if (alreadyDone) {
        const withToast = html.replace(
          /<div class="toast">[\s\S]*?<\/div>/,
          `<div class="toast" style="background:#757575;">
            <span class="toast-icon">i</span>
            You were already unsubscribed.
          </div>`,
        );
        return new Response(withToast, {
          status: 200,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      return new Response(html, {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // ── Resubscribe Action ────────────────────────────────────────────────
    if (action === 'resubscribe' || action === 'resubscribed') {
      const alreadyDone = member.wants_emails;

      if (!alreadyDone) {
        const { error: updateError } = await db
          .from('members')
          .update({ wants_emails: true, updated_at: new Date().toISOString() })
          .eq('id', member.id);

        if (updateError) throw new Error(`Failed to resubscribe: ${updateError.message}`);

        // Log event
        const { data: latestRecipient } = await db
          .from('campaign_recipients')
          .select('id')
          .eq('member_id', member.id)
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestRecipient) {
          await db.from('campaign_events').insert({
            campaign_recipient_id: latestRecipient.id,
            event_type: 'resubscribed',
            metadata: { source: 'magic_link', action: 'resubscribed' },
            created_at: new Date().toISOString(),
          }).maybeSingle();
        }
      }

      const html = buildConfirmationPage('resubscribed');

      if (alreadyDone) {
        const withToast = html.replace(
          /<div class="toast">[\s\S]*?<\/div>/,
          `<div class="toast" style="background:#757575;">
            <span class="toast-icon">i</span>
            You are already subscribed.
          </div>`,
        );
        return new Response(withToast, {
          status: 200,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      return new Response(html, {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // ── Invalid Action ────────────────────────────────────────────────────
    return new Response(buildErrorPage('Invalid action specified.'), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err: any) {
    console.error('[unsubscribe] Error:', err.message);
    return new Response(buildErrorPage('An error occurred. Please try again later.'), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
});

// ─── Helper: Build Error Page ────────────────────────────────────────────────
function buildErrorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Error — ASCO</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      max-width: 420px;
      width: 100%;
      overflow: hidden;
      text-align: center;
    }
    .card-header {
      background: linear-gradient(135deg, #b71c1c, #c62828);
      padding: 32px;
    }
    .card-header h1 { color: #ffffff; font-size: 18px; font-weight: 700; letter-spacing: 2px; }
    .card-body { padding: 32px; }
    .card-body p { font-size: 15px; color: #41493e; line-height: 1.7; }
    .card-footer { padding: 24px; background: #f9f9f9; border-top: 1px solid #e0e0e0; }
    .btn { display:inline-block; padding:12px 28px; background:#00450d; color:#fff; font-size:14px; font-weight:700; text-decoration:none; border-radius:8px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="card-header"><h1>ASIHLANGANENI CIVIC MOVEMENT</h1></div>
    <div class="card-body">
      <p>${message}</p>
    </div>
    <div class="card-footer">
      <a href="https://asco.org.za" class="btn">Visit ASCO Website</a>
    </div>
  </div>
</body>
</html>`;
}