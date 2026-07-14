/// <reference lib="deno.ns" />
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    return new Response('ok', { headers: corsHeaders });
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
    
    if (!/^\\d{13}$/.test(idNumber) || !luhnCheck(idNumber)) {
      throw new Error('Invalid SA ID Number format.');
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
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (insertError.code === '23505' && insertError.message.includes('email')) {
        // Silent re-verification
        await triggerVerification(PROJECT_URL, PROJECT_SERVICE_KEY, email, firstName);
        return new Response(JSON.stringify({ success: true, message: 'Member already exists, verification re-sent' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      throw new Error(insertError.message);
    }
    
    // Trigger verification
    await triggerVerification(PROJECT_URL, PROJECT_SERVICE_KEY, email, firstName);
    
    return new Response(JSON.stringify({ success: true, member: insertedMember }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('[register-member] Error:', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
