-- ──────────────────────────────────────────────────────────────────────────
-- Migration: Fix campaign_recipients status constraint + campaign status updates
-- Apply these ALTER statements in the Supabase SQL Editor.
-- ──────────────────────────────────────────────────────────────────────────

-- 1. Add 'resubscribed' to campaign_events CHECK constraint
ALTER TABLE public.campaign_events
  DROP CONSTRAINT IF EXISTS campaign_events_event_type_check;
ALTER TABLE public.campaign_events
  ADD CONSTRAINT campaign_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'sent', 'delivered', 'opened', 'clicked',
    'bounced', 'failed', 'complained',
    'unsubscribed', 'resubscribed'
  ]::text[]));

-- 2. Add 'sending' and 'archived' to campaigns CHECK constraint
ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_status_check
  CHECK (status = ANY (ARRAY[
    'draft', 'scheduled', 'sending', 'sent', 'failed', 'archived'
  ]::text[]));

-- 3. Fix campaign_recipients: first clean up any invalid statuses, then apply constraint

-- 3a. Set any rows with unsupported statuses (e.g. 'opened', 'clicked') to 'delivered'
--     These likely came from the webhook trying to set status directly
UPDATE public.campaign_recipients
SET status = 'delivered'
WHERE status NOT IN ('pending', 'scheduled', 'sent', 'delivered', 'bounced', 'failed');

-- 3b. Also fix NULL statuses (set to 'pending')
UPDATE public.campaign_recipients
SET status = 'pending'
WHERE status IS NULL;

-- 3c. Now apply the new constraint
ALTER TABLE public.campaign_recipients
  DROP CONSTRAINT IF EXISTS campaign_recipients_status_check;
ALTER TABLE public.campaign_recipients
  ADD CONSTRAINT campaign_recipients_status_check
  CHECK (status = ANY (ARRAY[
    'pending', 'scheduled', 'sent', 'delivered', 'bounced', 'failed'
  ]::text[]));