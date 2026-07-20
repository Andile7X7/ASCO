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

// ─── HMAC Token Helper ───────────────────────────────────────────────────────
async function generateUnsubscribeToken(memberId: string, campaignId: string, secret: string): Promise<string> {
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

// ─── Unsubscribe URL Builder ─────────────────────────────────────────────────
function buildUnsubscribeUrl(baseUrl: string, memberId: string, campaignId: string, token: string): string {
  return `${baseUrl}?action=unsubscribe&member_id=${memberId}&campaign_id=${campaignId}&token=${token}`;
}

// ─── HTML Email Template ────────────────────────────────────────────────────
function buildEmailHtml(campaign: {
  title: string;
  subject_line: string;
  preview_text?: string;
  text: string;
  sender_name?: string;
  banner_url?: string;
}, recipientName: string, unsubscribeUrl?: string): string {
  const bannerUrl = campaign.banner_url || 'https://asco.org.za/Assets/ASCOBANNER.png';
  const bannerHtml = `<img src="${bannerUrl}" alt="Campaign Banner" style="width:100%;max-width:600px;display:block;border-radius:8px 8px 0 0;" />`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <title>${campaign.subject_line}</title>
  ${campaign.preview_text ? `<span style="display:none;max-height:0;overflow:hidden;">${campaign.preview_text}&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌</span>` : ''}
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        
        <!-- Banner -->
        <tr><td style="padding:0;">${bannerHtml}</td></tr>

        <!-- Header Bar -->
        <tr><td style="background:#00450d;padding:16px 32px;display:flex;justify-content:space-between;align-items:center;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#acf4a4;font-size:18px;font-weight:700;letter-spacing:0.5px;">ASIHLANGANENI</td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px 40px 32px;">
          <h1 style="margin:0 0 24px;font-size:26px;font-weight:700;color:#1c1b1b;line-height:1.3;">${campaign.title}</h1>
          <p style="margin:0 0 16px;color:#41493e;font-size:15px;line-height:1.6;">Dear ${recipientName},</p>
          <div style="color:#41493e;font-size:15px;line-height:1.7;">
            ${campaign.text}
          </div>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:0 40px 40px;text-align:center;">
          <table role="presentation" cellpadding="0" cellspacing="0" align="center">
            <tr><td style="background:#00450d;border-radius:8px;">
              <a href="https://asco.org.za" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.5px;">Visit ASCO Website</a>
            </td></tr>
          </table>
        </td></tr>

        <!-- Divider -->
        <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #E0E0E0;margin:0;"/></td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 40px;text-align:center;background:#f9f9f9;">
          <p style="margin:0 0 8px;font-size:11px;color:#717a6d;line-height:1.6;">
            You are receiving this as a registered member of the ASCO Civic Movement.<br/>
            Kwaggafontein, Mpumalanga, South Africa
          </p>
          <p style="margin:0 0 12px;font-size:11px;color:#717a6d;">
            Sent by ${campaign.sender_name || 'ASIHLANGANENI CIVIC MOVEMENT'} via <strong>campaigns.asco.org.za</strong>
          </p>
          ${unsubscribeUrl ? `<p style="margin:0;font-size:11px;color:#717a6d;">
            <a href="${unsubscribeUrl}" style="color:#00450d;font-weight:600;text-decoration:underline;">Unsubscribe</a> from these emails
          </p>` : ''}
        </td></tr>

      </table>

      <!-- Post-card footer -->
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;padding:16px 0;">
        <tr><td style="text-align:center;font-size:11px;color:#bdbdbd;">
          © 2025 ASIHLANGANENI CIVIC MOVEMENT · Community · Accountability · Development
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Plain Text Version ─────────────────────────────────────────────────────
function buildEmailText(campaign: { title: string; text: string; sender_name?: string }, recipientName: string): string {
  // Strip basic HTML tags from body
  const plainBody = campaign.text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  return `${campaign.title}\n\n` +
    `Dear ${recipientName},\n\n` +
    `${plainBody}\n\n` +
    `---\n` +
    `Sent by ${campaign.sender_name || 'ASIHLANGANENI CIVIC MOVEMENT'}\n` +
    `You are receiving this as a registered member of the ASCO Civic Movement.\n` +
    `Kwaggafontein, Mpumalanga, South Africa\n` +
    `© 2025 ASIHLANGANENI CIVIC MOVEMENT`;
}

// ─── Main Handler ───────────────────────────────────────────────────────────
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  // Health check endpoint
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'connected', service: 'send-campaign' }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const PROJECT_URL = Deno.env.get('PROJECT_URL')!;
    const PROJECT_SERVICE_KEY = Deno.env.get('PROJECT_SERVICE_KEY')!;

    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured.');
    }

    // ── Auth: Verify JWT and admin role ──────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header.');

    const token = authHeader.replace('Bearer ', '');

    // Verify JWT by calling Supabase Auth API directly with service role
    const authRes = await fetch(`${PROJECT_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': PROJECT_SERVICE_KEY,
      },
    });

    if (!authRes.ok) throw new Error('Unauthorized: Invalid session.');
    const { id: userId, email: userEmail } = await authRes.json();
    if (!userId || !userEmail) throw new Error('Unauthorized: Invalid session.');

    // Use service role for all DB operations
    const db = createClient(PROJECT_URL, PROJECT_SERVICE_KEY);

    // Check admin role in members table
    const { data: member, error: memberError } = await db
      .from('members')
      .select('role, name, surname')
      .eq('email', userEmail)
      .maybeSingle();

    if (memberError || !member || member.role !== 'admin') {
      throw new Error('Forbidden: Only admins can send campaigns.');
    }

    // ── Parse Request Body ────────────────────────────────────────────────
    const body = await req.json();
    const { campaign_id, test_mode, test_email } = body;

    // ── Configuration ──────────────────────────────────────────────────────
    const UNSUBSCRIBE_SECRET = Deno.env.get('UNSUBSCRIBE_SECRET');
    // Resolve the base URL for the unsubscribe function
    const UNSUBSCRIBE_FN_URL = Deno.env.get('UNSUBSCRIBE_FN_URL') ||
      `${PROJECT_URL}/functions/v1/unsubscribe`;

    if (!UNSUBSCRIBE_SECRET) {
      throw new Error('UNSUBSCRIBE_SECRET is not configured.');
    }

    // ── Test Email Mode ───────────────────────────────────────────────────
    if (test_mode) {
      if (!test_email) throw new Error('test_email is required in test mode.');
      const { campaign_data } = body;
      if (!campaign_data) throw new Error('campaign_data is required in test mode.');

      // For test emails, use a placeholder member ID
      const testMemberId = '00000000-0000-0000-0000-000000000000';
      const testToken = await generateUnsubscribeToken(testMemberId, '00000000-0000-0000-0000-000000000000', UNSUBSCRIBE_SECRET);
      const testUnsubUrl = buildUnsubscribeUrl(UNSUBSCRIBE_FN_URL, testMemberId, '00000000-0000-0000-0000-000000000000', testToken);

      const html = buildEmailHtml(campaign_data, member.name || 'Admin', testUnsubUrl);
      const text = buildEmailText(campaign_data, member.name || 'Admin');

      const resendPayload = {
        from: `${campaign_data.sender_name || 'ASIHLANGANENI CIVIC MOVEMENT'} <${campaign_data.sender_email || 'noreply@campaigns.asco.org.za'}>`,
        to: [test_email],
        subject: `[TEST] ${campaign_data.subject_line || campaign_data.title}`,
        html,
        text,
        tags: [{ name: 'type', value: 'test' }],
      };

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(resendPayload),
      });

      const resendData = await resendRes.json();
      if (!resendRes.ok) throw new Error(`Resend error: ${resendData.message || JSON.stringify(resendData)}`);

      return new Response(JSON.stringify({ success: true, message: `Test email sent to ${test_email}`, resend_id: resendData.id }), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // ── Live Campaign Mode ────────────────────────────────────────────────
    if (!campaign_id) throw new Error('campaign_id is required.');

    // Fetch campaign
    const { data: campaign, error: campaignError } = await db
      .from('campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single();

    if (campaignError || !campaign) throw new Error('Campaign not found.');
    if (campaign.status === 'sent') throw new Error('Campaign has already been sent.');

    // Fetch targeting
    const { data: targets } = await db
      .from('campaign_targets')
      .select('*')
      .eq('campaign_id', campaign_id);

    const targetType = campaign.target_type || 'all';

    // Build member query
    let memberQuery = db
      .from('members')
      .select('id, email, name, surname, municipality')
      .eq('wants_emails', true)
      .eq('status', 'active')
      .not('email', 'is', null);

    // Apply municipality filter if not sending to all
    const skipFilter = targetType === 'all' || targetType === 'all_members';
    if (!skipFilter && targets && targets.length > 0) {
      // Extract municipality names directly from the targets array
      const municNames = targets
        .filter((t: any) => t.municipality)
        .map((t: any) => t.municipality)
        .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i); // deduplicate
      
      if (municNames.length > 0) {
        memberQuery = memberQuery.in('municipality', municNames);
      }
    }

    const { data: recipients, error: recipientsError } = await memberQuery;
    if (recipientsError) throw new Error(`Failed to fetch recipients: ${recipientsError.message}`);
    if (!recipients || recipients.length === 0) throw new Error('No eligible recipients found for this campaign.');

    // Update campaign to sending state
    await db.from('campaigns').update({ status: 'sending', updated_at: new Date().toISOString() }).eq('id', campaign_id);

    // Build Resend batch payload (max 100 per batch per Resend limits)
    const fromAddress = `${campaign.sender_name || 'ASIHLANGANENI CIVIC MOVEMENT'} <${campaign.sender_email || 'noreply@campaigns.asco.org.za'}>`;
    const scheduledAt = campaign.scheduled_for ? new Date(campaign.scheduled_for).toISOString() : undefined;

    // Send in batches of 50
    const BATCH_SIZE = 50;
    const allResendIds: string[] = [];
    let sentCount = 0;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      const emails = await Promise.all(batch.map(async (r: any) => {
        const token = await generateUnsubscribeToken(r.id, campaign_id, UNSUBSCRIBE_SECRET);
        const unsubUrl = buildUnsubscribeUrl(UNSUBSCRIBE_FN_URL, r.id, campaign_id, token);
        const html = buildEmailHtml(campaign, r.name || 'Member', unsubUrl);
        const text = buildEmailText(campaign, r.name || 'Member');
        const payload: any = {
          from: fromAddress,
          to: [r.email],
          subject: campaign.subject_line || campaign.title,
          html,
          text,
          tags: [
            { name: 'campaign_id', value: campaign_id },
            { name: 'member_id', value: r.id },
          ],
        };
        if (scheduledAt) payload.scheduled_at = scheduledAt;
        return payload;
      }));

      const resendRes = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(emails),
      });

      const resendData = await resendRes.json();
      if (!resendRes.ok) throw new Error(`Resend batch error: ${resendData.message || JSON.stringify(resendData)}`);

      // Collect resend IDs and create campaign_recipients rows
      const resendIds = Array.isArray(resendData) ? resendData : (resendData.data || []);
      const recipientRows = batch.map((r: any, idx: number) => ({
        campaign_id,
        member_id: r.id,
        status: scheduledAt ? 'scheduled' : 'sent',
        sent_at: scheduledAt ? null : new Date().toISOString(),
        open_count: 0,
        click_count: 0,
        resend_email_id: resendIds[idx]?.id || null,
      }));

      await db.from('campaign_recipients').insert(recipientRows);

      // Capture first batch resend ID for reference
      if (resendIds.length > 0) {
        allResendIds.push(resendIds[0].id);
      }
      sentCount += batch.length;
    }

    const finalStatus = scheduledAt ? 'scheduled' : 'sent';
    const now = new Date().toISOString();

    // Update campaign with final status
    await db.from('campaigns').update({
      status: finalStatus,
      sent_at: scheduledAt ? null : now,
      scheduled_for: campaign.scheduled_for || null,
      recipient_count: sentCount,
      resend_id: allResendIds[0] || null,
      updated_at: now,
    }).eq('id', campaign_id);

    // Log activity
    const { data: adminMember } = await db.from('members').select('id').eq('email', userEmail).maybeSingle();
    await db.from('activity_log').insert({
      action: scheduledAt ? 'Campaign Scheduled' : 'Campaign Sent',
      description: `"${campaign.title}" ${scheduledAt ? `scheduled for ${new Date(scheduledAt).toLocaleString('en-ZA')}` : `sent`} to ${sentCount} member${sentCount !== 1 ? 's' : ''}`,
      member_id: adminMember?.id || null,
      campaign_id,
      created_at: now,
    });

    return new Response(JSON.stringify({
      success: true,
      message: scheduledAt ? `Campaign scheduled for ${campaign.scheduled_for}` : `Campaign sent to ${sentCount} recipients`,
      recipient_count: sentCount,
      status: finalStatus,
    }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[send-campaign] Error:', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});