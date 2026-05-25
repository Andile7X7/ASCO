-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.activity_log (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  action text NOT NULL,
  description text,
  member_id uuid,
  campaign_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT activity_log_pkey PRIMARY KEY (id),
  CONSTRAINT activity_log_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id),
  CONSTRAINT activity_log_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id)
);
CREATE TABLE public.blog_images (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  blog_id uuid NOT NULL,
  image_url text NOT NULL,
  alt_text text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT blog_images_pkey PRIMARY KEY (id),
  CONSTRAINT blog_images_blog_id_fkey FOREIGN KEY (blog_id) REFERENCES public.blogs(id)
);
CREATE TABLE public.blogs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  subtitle text NOT NULL,
  slug text UNIQUE,
  paragraph1 text NOT NULL,
  featured_image text NOT NULL,
  published boolean DEFAULT false,
  published_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  tagline text,
  category text,
  img2Label text,
  img3Label text,
  paragraph2 text,
  CONSTRAINT blogs_pkey PRIMARY KEY (id),
  CONSTRAINT blogs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.members(id)
);
CREATE TABLE public.campaign_events (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  campaign_recipient_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type = ANY (ARRAY['sent'::text, 'delivered'::text, 'opened'::text, 'clicked'::text, 'bounced'::text, 'failed'::text, 'complained'::text, 'unsubscribed'::text])),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_events_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_events_campaign_recipient_id_fkey FOREIGN KEY (campaign_recipient_id) REFERENCES public.campaign_recipients(id)
);
CREATE TABLE public.campaign_recipients (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  campaign_id uuid NOT NULL,
  member_id uuid NOT NULL,
  sent_at timestamp with time zone,
  opened_at timestamp with time zone,
  clicked_at timestamp with time zone,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'bounced'::text, 'failed'::text])),
  delivered_at timestamp with time zone,
  failed_reason text,
  open_count integer NOT NULL DEFAULT 0,
  click_count integer NOT NULL DEFAULT 0,
  resend_email_id text,
  CONSTRAINT campaign_recipients_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id),
  CONSTRAINT campaign_recipients_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id)
);
CREATE TABLE public.campaign_targets (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  campaign_id uuid NOT NULL,
  ward_id uuid,
  branch_id uuid,
  target_type text NOT NULL CHECK (target_type = ANY (ARRAY['ward'::text, 'branch'::text, 'custom'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  municipality text,
  CONSTRAINT campaign_targets_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_targets_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id)
);
CREATE TABLE public.campaigns (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  subtitle text,
  subject_line text,
  text text NOT NULL,
  images ARRAY DEFAULT '{}'::text[],
  recipient_count integer DEFAULT 0,
  sent_at timestamp with time zone,
  status text DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sent'::text, 'failed'::text])),
  resend_id text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  campaign_type text DEFAULT 'announcement'::text CHECK (campaign_type = ANY (ARRAY['announcement'::text, 'event'::text, 'volunteer'::text, 'fundraising'::text])),
  scheduled_for timestamp with time zone,
  sender_name text,
  sender_email text,
  preview_text text,
  target_type text DEFAULT 'custom'::text CHECK (target_type = ANY (ARRAY['all_members'::text, 'ward'::text, 'custom'::text, 'event_attendees'::text])),
  html_content text,
  plain_text_content text,
  banner_url text,
  CONSTRAINT campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.members(id)
);
CREATE TABLE public.members (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  surname text NOT NULL,
  municipality text,
  phone text,
  wants_emails boolean DEFAULT true,
  email_verified boolean DEFAULT false,
  status text DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'unconfirmed'::text])),
  source text DEFAULT 'website'::text,
  role text DEFAULT 'member'::text CHECK (role = ANY (ARRAY['member'::text, 'admin'::text, 'volunteer'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT members_pkey PRIMARY KEY (id)
);
CREATE TABLE public.settings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  key text NOT NULL UNIQUE,
  value text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT settings_pkey PRIMARY KEY (id)
);