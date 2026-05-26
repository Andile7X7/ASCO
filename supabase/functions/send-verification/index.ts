/// <reference lib="deno.ns" />
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const VERIFICATION_SECRET = Deno.env.get('VERIFICATION_SECRET');
    const PROJECT_URL = Deno.env.get('PROJECT_URL');
    const BASE_URL = Deno.env.get('BASE_URL') || 'https://asco.org.za';

    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured.');
    if (!VERIFICATION_SECRET) throw new Error('VERIFICATION_SECRET is not configured.');
    if (!PROJECT_URL) throw new Error('PROJECT_URL is not configured.');

    const { email, name } = await req.json();
    if (!email) throw new Error('email is required.');
    if (!name) throw new Error('name is required.');

    // Generate HMAC-SHA256 token
    const encoder = new TextEncoder();
    const keyData = encoder.encode(VERIFICATION_SECRET);
    const messageData = encoder.encode(email.toLowerCase().trim());
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const token = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const verifyUrl = `${PROJECT_URL}/functions/v1/verify-email?email=${encodeURIComponent(email)}&token=${token}`;

    // Build HTML email
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Verify your email - ASCO</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr><td style="background:#00450d;padding:32px 40px;text-align:center;">
          <span style="color:#acf4a4;font-size:20px;font-weight:700;letter-spacing:1px;">ASIHLANGANENI CIVIC MOVEMENT</span>
        </td></tr>
        <tr><td style="padding:40px 40px 32px;">
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1c1b1b;">Verify Your Email</h1>
          <p style="margin:0 0 24px;color:#41493e;font-size:15px;line-height:1.6;">Hello ${name},</p>
          <p style="margin:0 0 24px;color:#41493e;font-size:15px;line-height:1.6;">
            Thank you for joining the ASCO Civic Movement! Please verify your email address by clicking the button below to activate your membership.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:32px 0;">
            <tr><td style="background:#00450d;border-radius:8px;padding:14px 36px;text-align:center;">
              <a href="${verifyUrl}" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;display:inline-block;">Verify Email Address</a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:12px;color:#717a6d;line-height:1.6;">
            If the button does not work, copy and paste the following link into your browser:
          </p>
          <p style="margin:4px 0 0;font-size:11px;color:#717a6d;word-break:break-all;">${verifyUrl}</p>
        </td></tr>
        <tr><td style="padding:0 40px 40px;text-align:center;">
          <hr style="border:none;border-top:1px solid #E0E0E0;margin:0 0 16px;" />
          <p style="margin:0;font-size:11px;color:#717a6d;line-height:1.6;">
            This email was sent because you signed up at asco.org.za.<br />
            If you did not request this, please ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = `Verify Your Email\n\nHello ${name},\n\nThank you for joining the ASCO Civic Movement! Please verify your email address by clicking the link below to activate your membership.\n\n${verifyUrl}\n\nIf you did not request this, please ignore this email.`;

    // Send via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'ASIHLANGANENI CIVIC MOVEMENT <noreply@campaigns.asco.org.za>',
        to: [email],
        subject: 'Verify your email – ASCO Civic Movement',
        html,
        text,
        tags: [{ name: 'type', value: 'verification' }],
      }),
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      throw new Error(`Resend error: ${resendData.message || JSON.stringify(resendData)}`);
    }

    return new Response(JSON.stringify({ success: true, message: 'Verification email sent', id: resendData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[send-verification] Error:', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});