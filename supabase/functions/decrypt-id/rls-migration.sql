-- ──────────────────────────────────────────────────────────────────────────
-- Migration: Enable RLS on all tables
-- Apply in Supabase SQL Editor.
-- ──────────────────────────────────────────────────────────────────────────

-- ══════════════════════════════════════════════════════════════════════════
-- MEMBERS TABLE (contains encrypted ID numbers — highest priority)
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- Drop any pre-existing policies to avoid conflicts
DROP POLICY IF EXISTS "Members are viewable by authenticated users" ON public.members;
DROP POLICY IF EXISTS "Members insert via edge function" ON public.members;
DROP POLICY IF EXISTS "Admins can update members" ON public.members;

-- Authenticated users (admin sessions) can SELECT members
-- (id_number_encrypted/iv are safe: encrypted at rest, only decryptable via Edge Function)
CREATE POLICY "Authenticated users can read members"
  ON public.members FOR SELECT TO authenticated USING (true);

-- Authenticated users (admins) can UPDATE members (status changes, etc.)
CREATE POLICY "Authenticated users can update members"
  ON public.members FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- No SELECT/INSERT policy for anon → anonymous visitors cannot read or write members
-- Registration goes through register-member Edge Function (service_role bypasses RLS)

-- ══════════════════════════════════════════════════════════════════════════
-- ACTIVITY LOG
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read activity logs"
  ON public.activity_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert activity logs"
  ON public.activity_log FOR INSERT TO authenticated WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════
-- CAMPAIGNS
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage campaigns"
  ON public.campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════
-- CAMPAIGN TARGETS
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.campaign_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage campaign targets"
  ON public.campaign_targets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════
-- CAMPAIGN RECIPIENTS
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage campaign recipients"
  ON public.campaign_recipients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════
-- CAMPAIGN EVENTS
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.campaign_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage campaign events"
  ON public.campaign_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════
-- SETTINGS
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read settings"
  ON public.settings FOR SELECT TO authenticated USING (true);

-- ══════════════════════════════════════════════════════════════════════════
-- BLOGS + BLOG_IMAGES (public read for published, admin write)
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.blogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read published blogs"
  ON public.blogs FOR SELECT USING (published = true);

CREATE POLICY "Authenticated users can manage blogs"
  ON public.blogs FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.blog_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read blog images for published blogs"
  ON public.blog_images FOR SELECT
  USING (blog_id IN (SELECT id FROM public.blogs WHERE published = true));

CREATE POLICY "Authenticated users can manage blog images"
  ON public.blog_images FOR ALL TO authenticated USING (true) WITH CHECK (true);
