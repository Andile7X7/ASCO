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
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  // Clean up expired entries periodically
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

// --- Crypto Helpers ---
function hexToArrayBuffer(hex: string) {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function generateIdHash(idNumber: string, hexKey: string) {
  const keyBuffer = hexToArrayBuffer(hexKey);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(idNumber)
  );
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function encryptIdNumber(idNumber: string, hexKey: string) {
  const keyBuffer = hexToArrayBuffer(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    new TextEncoder().encode(idNumber)
  );
  
  return {
    encrypted: arrayBufferToBase64(ciphertextBuffer),
    iv: arrayBufferToBase64(iv.buffer)
  };
}

function luhnCheck(id: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = id.length - 1; i >= 0; i--) {
    let n = parseInt(id[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n = (n % 10) + 1;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  // Rate limiting
  const clientIp = getClientIp(req);
  const { allowed, retryAfterSec } = checkRateLimit(clientIp);
  if (!allowed) {
    return new Response(JSON.stringify({ success: false, error: 'Too many requests. Please try again later.' }), {
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

    const body = await req.json();
    const {
      firstName, lastName, email, phone, idNumber,
      municipality, ward, branch, language, gender,
      residentialAddress, postalAddress, wantsEmails
    } = body;

    if (!firstName || !lastName || !email || !phone || !idNumber || !municipality || !ward) {
      throw new Error('Missing required fields.');
    }
    
    // if (!/^\\d{13}$/.test(idNumber) || !luhnCheck(idNumber)) {
    //   throw new Error('Invalid SA ID Number format.');
    // }
    function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function validateSAID(id: string): { valid: boolean; reason?: string } {
  if (!/^\d{13}$/.test(id)) {
    return { valid: false, reason: 'Must be exactly 13 digits' };
  }

  const yy = parseInt(id.substring(0, 2), 10);
  const mm = parseInt(id.substring(2, 4), 10);
  const dd = parseInt(id.substring(4, 6), 10);
  const fullYear = yy >= 50 ? 1900 + yy : 2000 + yy;

  if (mm < 1 || mm > 12) {
    return { valid: false, reason: `Invalid month: ${mm}` };
  }

  const daysInMonth = [31, isLeapYear(fullYear) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (dd < 1 || dd > daysInMonth[mm - 1]) {
    return { valid: false, reason: `Invalid day ${dd} for month ${mm}` };
  }

  const citizenship = parseInt(id[10], 10);
  if (citizenship !== 0 && citizenship !== 1) {
    return { valid: false, reason: `Citizenship digit must be 0 or 1` };
  }

  const raceDigit = parseInt(id[11], 10);
  if (raceDigit !== 8 && raceDigit !== 9) {
    return { valid: false, reason: `12th digit must be 8 or 9` };
  }

  if (!luhnCheck(id)) {
    return { valid: false, reason: 'Luhn checksum failed' };
  }

  return { valid: true };
}

// Then use it:
const idCheck = validateSAID(idNumber);
if (!idCheck.valid) {
  throw new Error(`Invalid SA ID: ${idCheck.reason}`);
}

    const validMunicipalities = [
      'Dr JS Moroka', 'Thembisile Hani', 'Victor Kanye', 'Emalahleni', 
      'Steve Tshwete', 'Emakhazeni', 'Elias Motswaledi', 'Ephraim Mogale', 
      'Makhuduthamaga', 'Fetakgomo Tubatse'
    ];
    if (!validMunicipalities.includes(municipality)) {
      throw new Error('Invalid municipality.');
    }

    const id_number_hash = await generateIdHash(idNumber, ID_ENCRYPTION_KEY);
    const { encrypted, iv } = await encryptIdNumber(idNumber, ID_ENCRYPTION_KEY);
    
    const db = createClient(PROJECT_URL, PROJECT_SERVICE_KEY);
    
    const { data: insertedMember, error: insertError } = await db.from('members').insert({
      name: firstName,
      surname: lastName,
      email,
      phone,
      id_number_encrypted: encrypted,
      id_number_iv: iv,
      id_number_hash,
      municipality,
      ward,
      branch,
      language,
      gender,
      residential_address: residentialAddress,
      postal_address: postalAddress,
      wants_emails: wantsEmails === true
    }).select().maybeSingle();

    if (insertError) {
      if (insertError.code === '23505' && insertError.message.includes('id_number_hash')) {
        return new Response(JSON.stringify({ success: false, error: 'This ID number is already registered' }), {
          status: 409, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
        });
      }
      if (insertError.code === '23505' && insertError.message.includes('email')) {
        // Silent re-verification
        await triggerVerification(PROJECT_URL, PROJECT_SERVICE_KEY, email, firstName);
        return new Response(JSON.stringify({ success: true, message: 'Member already exists, verification re-sent' }), {
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
        });
      }
      console.error('[register-member] DB insert error:', insertError.message, insertError.code);
      throw new Error('Failed to register. Please try again later.');
    }
    
    // Trigger verification
    await triggerVerification(PROJECT_URL, PROJECT_SERVICE_KEY, email, firstName);
    
    return new Response(JSON.stringify({ success: true, member: insertedMember }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('[register-member] Error:', err.message);
    const safeMessage = err.message?.startsWith('Missing required') 
      || err.message?.startsWith('Invalid')
      || err.message?.startsWith('Server configuration')
      ? err.message 
      : 'An unexpected error occurred. Please try again later.';
    return new Response(JSON.stringify({ success: false, error: safeMessage }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
    });
  }
});

async function triggerVerification(projectUrl: string, serviceKey: string, email: string, name: string) {
  try {
    await fetch(`${projectUrl}/functions/v1/send-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ email, name })
    });
  } catch(e) {
    console.error('Failed to trigger verification', e);
  }
}
