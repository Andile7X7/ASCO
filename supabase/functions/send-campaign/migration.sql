-- ──────────────────────────────────────────────────────────────────────────
-- Migration: Add 'resubscribed' event type & 'sending' campaign status
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

-- 2. Add 'sending' to campaigns CHECK constraint (used by send-campaign code)
ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_status_check
  CHECK (status = ANY (ARRAY[
    'draft', 'scheduled', 'sending', 'sent', 'failed'
  ]::text[]));