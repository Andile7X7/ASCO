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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const PROJECT_URL = Deno.env.get('PROJECT_URL')!;
    const PROJECT_SERVICE_KEY = Deno.env.get('PROJECT_SERVICE_KEY')!;
    const VERIFICATION_SECRET = Deno.env.get('VERIFICATION_SECRET');
    const BASE_URL = Deno.env.get('BASE_URL') || 'https://asco.org.za';

    if (!VERIFICATION_SECRET) throw new Error('VERIFICATION_SECRET is not configured.');
    if (!PROJECT_URL) throw new Error('PROJECT_URL is not configured.');
    if (!PROJECT_SERVICE_KEY) throw new Error('PROJECT_SERVICE_KEY is not configured.');

    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    const token = url.searchParams.get('token');

    if (!email || !token) {
      // Redirect to home with error
      return new Response(null, {
        status: 302,
        headers: { Location: `${BASE_URL}/index.html?verified=false&error=missing_params` },
      });
    }

    // Validate HMAC token
    const encoder = new TextEncoder();
    const keyData = encoder.encode(VERIFICATION_SECRET);
    const messageData = encoder.encode(email.toLowerCase().trim());
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const expectedToken = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (token !== expectedToken) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${BASE_URL}/index.html?verified=false&error=invalid_token` },
      });
    }

    // Update member: email_verified = true, status = 'active'
    const db = createClient(PROJECT_URL, PROJECT_SERVICE_KEY);

    const { data: member, error: findError } = await db
      .from('members')
      .select('id, email, email_verified, status')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (findError) {
      console.error('[verify-email] Find error:', findError.message);
      return new Response(null, {
        status: 302,
        headers: { Location: `${BASE_URL}/index.html?verified=false&error=db_error` },
      });
    }

    if (!member) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${BASE_URL}/index.html?verified=false&error=not_found` },
      });
    }

    if (member.email_verified && member.status === 'active') {
      // Already verified — still redirect with success
      return new Response(null, {
        status: 302,
        headers: { Location: `${BASE_URL}/index.html?verified=true&already=true` },
      });
    }

    const { error: updateError } = await db
      .from('members')
      .update({
        email_verified: true,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', member.id);

    if (updateError) {
      console.error('[verify-email] Update error:', updateError.message);
      return new Response(null, {
        status: 302,
        headers: { Location: `${BASE_URL}/index.html?verified=false&error=update_failed` },
      });
    }

    // Log activity
    await db.from('activity_log').insert({
      action: 'Email Verified',
      description: `Member ${member.email} verified their email address and membership activated.`,
      member_id: member.id,
      created_at: new Date().toISOString(),
    });

    // Redirect to home with success
    return new Response(null, {
      status: 302,
      headers: { Location: `${BASE_URL}/index.html?verified=true` },
    });

  } catch (err: any) {
    console.error('[verify-email] Error:', err.message);
    const BASE_URL = Deno.env.get('BASE_URL') || 'https://asco.org.za';
    return new Response(null, {
      status: 302,
      headers: { Location: `${BASE_URL}/index.html?verified=false&error=server_error` },
    });
  }
});