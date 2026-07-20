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

// --- Rate Limiting ---
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (rateLimitStore.size > 1000) {
    for (const [key, val] of rateLimitStore) {
      if (val.resetAt <= now) rateLimitStore.delete(key);
    }
  }

  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfterSec };
  }

  return { allowed: true, retryAfterSec: 0 };
}

function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}

function hexToArrayBuffer(hex: string) {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes.buffer;
}

function base64ToArrayBuffer(base64: string) {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

async function decryptIdNumber(encryptedBase64: string, ivBase64: string, hexKey: string) {
  const keyBuffer = hexToArrayBuffer(hexKey);
  const ivBuffer = base64ToArrayBuffer(ivBase64);
  const ciphertextBuffer = base64ToArrayBuffer(encryptedBase64);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  
  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer },
    cryptoKey,
    ciphertextBuffer
  );
  
  return new TextDecoder().decode(plaintextBuffer);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  // Rate limiting
  const clientIp = getClientIp(req);
  const { allowed, retryAfterSec } = checkRateLimit(clientIp);
  if (!allowed) {
    return new Response(JSON.stringify({ success: false, error: 'Too many requests.' }), {
      status: 429,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json', 'Retry-After': String(retryAfterSec) },
    });
  }

  try {
    const PROJECT_URL = Deno.env.get('PROJECT_URL');
    const PROJECT_SERVICE_KEY = Deno.env.get('PROJECT_SERVICE_KEY');
    const ID_ENCRYPTION_KEY = Deno.env.get('ID_ENCRYPTION_KEY');
    
    if (!PROJECT_URL || !PROJECT_SERVICE_KEY || !ID_ENCRYPTION_KEY) {
      throw new Error('Server configuration error.');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const db = createClient(PROJECT_URL, PROJECT_SERVICE_KEY);
    
    // Verify JWT and get user
    const { data: { user }, error: userError } = await db.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
      });
    }

    // Verify admin role by checking the members table based on user.email
    // Note: The members table has a role column
    const { data: adminMember, error: adminError } = await db
      .from('members')
      .select('id, role')
      .eq('email', user.email)
      .maybeSingle();

    if (adminError || !adminMember || adminMember.role !== 'admin') {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
        status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { member_id } = body;
    if (!member_id) {
      return new Response(JSON.stringify({ success: false, error: 'Missing member_id' }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
      });
    }

    // Fetch the target member's encrypted ID
    const { data: targetMember, error: targetError } = await db
      .from('members')
      .select('id, id_number_encrypted, id_number_iv')
      .eq('id', member_id)
      .maybeSingle();

    if (targetError || !targetMember) {
      return new Response(JSON.stringify({ success: false, error: 'Member not found' }), {
        status: 404, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
      });
    }

    if (!targetMember.id_number_encrypted || !targetMember.id_number_iv) {
      return new Response(JSON.stringify({ success: false, error: 'ID number not available for this member' }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
      });
    }

    const plaintextId = await decryptIdNumber(targetMember.id_number_encrypted, targetMember.id_number_iv, ID_ENCRYPTION_KEY);

    // Audit log
    await db.from('activity_log').insert({
      action: 'id_number_decrypted',
      description: `Admin [${user.email}] viewed ID number for member [${member_id}]`,
      member_id: member_id,
    });

    return new Response(JSON.stringify({ success: true, id_number: plaintextId }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('[decrypt-id] Error:', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
    });
  }
});
