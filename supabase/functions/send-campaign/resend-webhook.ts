// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-resend-signature',
};

// ─── Main Handler ───────────────────────────────────────────────────────────
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const PROJECT_URL = Deno.env.get('PROJECT_URL')!;
    const PROJECT_SERVICE_KEY = Deno.env.get('PROJECT_SERVICE_KEY')!;
    const db = createClient(PROJECT_URL, PROJECT_SERVICE_KEY);

    const payload = await req.json();
    const eventType = payload.type;
    const data = payload.data || {};

    // Log incoming webhook for debugging
    console.log('[resend-webhook] Received event:', eventType, 'for email:', data.to);

    // Resend sends events like: email.delivered, email.opened, email.clicked, email.bounced, email.complained
    if (!eventType || !eventType.startsWith('email.')) {
      return new Response(JSON.stringify({ success: false, message: 'Ignored non-email event' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendEmailId = data.email_id;
    const recipientEmail = data.to;
    const eventTimestamp = data.created_at || new Date().toISOString();

    if (!resendEmailId) {
      console.warn('[resend-webhook] Missing email_id in payload');
      return new Response(JSON.stringify({ success: false, error: 'Missing email_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the campaign_recipient by resend_email_id
    const { data: recipientRow, error: findError } = await db
      .from('campaign_recipients')
      .select('id, campaign_id, member_id, open_count, click_count, status')
      .eq('resend_email_id', resendEmailId)
      .maybeSingle();

    if (findError) {
      console.error('[resend-webhook] Find error:', findError.message);
      throw new Error(`Database find error: ${findError.message}`);
    }

    if (!recipientRow) {
      // Recipient not found — might be a test email or orphaned
      console.warn('[resend-webhook] No recipient found for resend_email_id:', resendEmailId);
      return new Response(JSON.stringify({ success: false, message: 'Recipient not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize event type: Resend sends "email.opened", DB expects "opened"
    const normalizedEventType = (eventType || '').replace('email.', '');

    // Build update based on event type
    const updateData = {};
    const eventLog = {
      campaign_recipient_id: recipientRow.id,
      event_type: normalizedEventType,
      metadata: {
        resend_email_id: resendEmailId,
        recipient_email: recipientEmail,
        timestamp: eventTimestamp,
      },
      created_at: eventTimestamp,
    };

    switch (normalizedEventType) {
      case 'delivered':
        updateData.status = 'delivered';
        updateData.delivered_at = eventTimestamp;
        break;

      case 'opened':
        updateData.open_count = (recipientRow.open_count || 0) + 1;
        updateData.opened_at = eventTimestamp;
        // Don't set status - DB constraint only allows: pending, sent, delivered, bounced, failed
        break;

      case 'clicked':
        updateData.click_count = (recipientRow.click_count || 0) + 1;
        updateData.clicked_at = eventTimestamp;
        // Don't set status - DB constraint only allows: pending, sent, delivered, bounced, failed
        break;

      case 'bounced':
        updateData.status = 'bounced';
        updateData.failed_reason = data.bounce_type || 'bounced';
        eventLog.metadata.bounce_type = data.bounce_type;
        eventLog.metadata.bounce_message = data.bounce_message;
        break;

      case 'complained':
        // Don't set status - DB constraint only allows: pending, sent, delivered, bounced, failed
        eventLog.metadata.complaint_type = data.complaint_type;
        break;

      default:
        console.log('[resend-webhook] Unhandled event type:', eventType);
    }

    // Update campaign_recipients
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await db
        .from('campaign_recipients')
        .update(updateData)
        .eq('id', recipientRow.id);

      if (updateError) {
        console.error('[resend-webhook] Update error:', updateError.message);
        throw new Error(`Database update error: ${updateError.message}`);
      }
      console.log('[resend-webhook] Updated recipient:', recipientRow.id, 'with:', updateData);
    }

    // Insert campaign_events log
    const { error: logError } = await db
      .from('campaign_events')
      .insert(eventLog);

    if (logError) {
      console.error('[resend-webhook] Event log error:', logError.message);
      // Don't throw — event log is non-critical
    }

    return new Response(JSON.stringify({ success: true, event: eventType, recipient_id: recipientRow.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[resend-webhook] Error:', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});