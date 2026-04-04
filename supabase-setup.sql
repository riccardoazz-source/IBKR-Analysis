-- ============================================================
-- IBKR Monitor — Supabase table setup
-- Run this once in your Supabase SQL editor.
-- It uses the prefix "ibkr_" so it won't clash with other apps.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ibkr_portfolios (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name             text        NOT NULL,
  file_name        text        NOT NULL,
  xml_data         text        NOT NULL,      -- full Flex XML (can be several MB)
  account_id       text,
  account_alias    text,
  account_currency text,
  from_date        text,
  to_date          text,
  nav_ending       numeric,
  created_at       timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.ibkr_portfolios ENABLE ROW LEVEL SECURITY;

-- Allow full public access (personal-use app, no auth)
-- If you later add Supabase Auth, replace this with user-scoped policies.
CREATE POLICY "ibkr_allow_all"
  ON public.ibkr_portfolios
  FOR ALL
  USING (true)
  WITH CHECK (true);
