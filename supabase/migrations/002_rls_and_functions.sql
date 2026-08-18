-- ====================================================================
-- Complete Unified SQL Migration for Supabase
-- Project: https://supabase.com/dashboard/project/jelclpesgtcfgngmudoj
-- Safe to run in Supabase SQL Editor (handles existing tables & clean policy drops)
-- ====================================================================

-- 1. Ensure `licenses` table has all necessary columns
CREATE TABLE IF NOT EXISTS public.licenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key           TEXT UNIQUE NOT NULL,
  plan_id       UUID,
  reseller_id   UUID,
  status        TEXT NOT NULL DEFAULT 'active',
  max_devices   INTEGER NOT NULL DEFAULT 1,
  activated_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- In case licenses already existed, ensure 'key' has a UNIQUE constraint & index
CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_key_unique ON public.licenses(key);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON public.licenses(status);

-- 2. Ensure `devices` table exists referencing licenses(id)
CREATE TABLE IF NOT EXISTS public.devices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id   UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  device_id    TEXT NOT NULL,
  user_agent   TEXT,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(license_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_devices_license_id ON public.devices(license_id);
CREATE INDEX IF NOT EXISTS idx_devices_device_id ON public.devices(device_id);

-- 3. Notifications table for in-extension announcements
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'info',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Extension Versions table for OTA updates
CREATE TABLE IF NOT EXISTS public.extension_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version             TEXT NOT NULL,
  changelog           TEXT,
  file_path           TEXT,
  original_file_name  TEXT,
  is_alert_active     BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Settings table for extension branding
CREATE TABLE IF NOT EXISTS public.settings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_url           TEXT,
  logo_size          INTEGER NOT NULL DEFAULT 48,
  show_sidepanel_btn BOOLEAN NOT NULL DEFAULT true,
  show_history_btn   BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default settings and versions if table is empty
INSERT INTO public.settings (logo_url, logo_size, show_sidepanel_btn, show_history_btn)
SELECT null, 48, true, false
WHERE NOT EXISTS (SELECT 1 FROM public.settings);

INSERT INTO public.extension_versions (version, changelog, file_path, original_file_name, is_alert_active)
SELECT '17.5', 'Initial release', 'extensions/Loveable-Unlimited-Extension.zip', 'Loveable-Unlimited-Extension.zip', false
WHERE NOT EXISTS (SELECT 1 FROM public.extension_versions);

INSERT INTO public.notifications (title, body, type, is_active)
SELECT 'Welcome!', 'Your Loveable Unlimited extension is active and ready to use.', 'success', true
WHERE NOT EXISTS (SELECT 1 FROM public.notifications);

-- ====================================================================
-- ROW LEVEL SECURITY (Clean Drop & Create)
-- ====================================================================

-- Enable RLS
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extension_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Drop old policies to avoid duplicate errors
DROP POLICY IF EXISTS "Allow read licenses" ON public.licenses;
DROP POLICY IF EXISTS "Allow insert licenses" ON public.licenses;
DROP POLICY IF EXISTS "Allow update licenses" ON public.licenses;
DROP POLICY IF EXISTS "Allow delete licenses" ON public.licenses;

DROP POLICY IF EXISTS "Allow read devices" ON public.devices;
DROP POLICY IF EXISTS "Allow insert devices" ON public.devices;
DROP POLICY IF EXISTS "Allow update devices" ON public.devices;
DROP POLICY IF EXISTS "Allow delete devices" ON public.devices;

DROP POLICY IF EXISTS "Allow read notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow update notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow delete notifications" ON public.notifications;

DROP POLICY IF EXISTS "Allow read extension_versions" ON public.extension_versions;
DROP POLICY IF EXISTS "Allow read settings" ON public.settings;

-- Create Policies for Licenses
CREATE POLICY "Allow read licenses" ON public.licenses
  FOR SELECT USING (true);

CREATE POLICY "Allow insert licenses" ON public.licenses
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update licenses" ON public.licenses
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete licenses" ON public.licenses
  FOR DELETE USING (true);

-- Create Policies for Devices
CREATE POLICY "Allow read devices" ON public.devices
  FOR SELECT USING (true);

CREATE POLICY "Allow insert devices" ON public.devices
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update devices" ON public.devices
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete devices" ON public.devices
  FOR DELETE USING (true);

-- Create Policies for Notifications
CREATE POLICY "Allow read notifications" ON public.notifications
  FOR SELECT USING (true);

CREATE POLICY "Allow insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update notifications" ON public.notifications
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete notifications" ON public.notifications
  FOR DELETE USING (true);

-- Create Policies for Extension Versions & Settings
CREATE POLICY "Allow read extension_versions" ON public.extension_versions
  FOR SELECT USING (true);

CREATE POLICY "Allow read settings" ON public.settings
  FOR SELECT USING (true);

-- ====================================================================
-- HELPER DATABASE FUNCTION: activate_license_rpc
-- ====================================================================
CREATE OR REPLACE FUNCTION public.activate_license_rpc(
  p_license_key TEXT,
  p_device_id TEXT,
  p_user_agent TEXT DEFAULT 'Loveable Extension'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_license RECORD;
  v_device_count INT;
  v_is_known_device BOOLEAN;
  v_session_id UUID := gen_random_uuid();
  v_clean_key TEXT := upper(trim(p_license_key));
BEGIN
  -- 1. Find license by key
  SELECT * INTO v_license
  FROM public.licenses
  WHERE upper(trim(key)) = v_clean_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'status', 'invalid', 'error', 'Invalid license key');
  END IF;

  -- 2. Check revoked status
  IF v_license.status = 'revoked' THEN
    RETURN jsonb_build_object('valid', false, 'status', 'revoked', 'error', 'License revoked');
  END IF;

  -- 3. Check expiration
  IF v_license.expires_at IS NOT NULL AND v_license.expires_at < now() THEN
    UPDATE public.licenses SET status = 'expired' WHERE id = v_license.id;
    RETURN jsonb_build_object('valid', false, 'status', 'expired', 'error', 'License expired', 'expires_at', v_license.expires_at);
  END IF;

  -- 4. Check device limit and registration
  SELECT count(*), bool_or(device_id = p_device_id)
  INTO v_device_count, v_is_known_device
  FROM public.devices
  WHERE license_id = v_license.id;

  v_device_count := COALESCE(v_device_count, 0);
  v_is_known_device := COALESCE(v_is_known_device, false);

  IF NOT v_is_known_device AND p_device_id IS NOT NULL AND p_device_id <> '' THEN
    IF v_device_count >= COALESCE(v_license.max_devices, 1) THEN
      RETURN jsonb_build_object('valid', false, 'status', 'device_limit', 'error', 'Device limit reached');
    END IF;

    INSERT INTO public.devices (license_id, device_id, user_agent, activated_at)
    VALUES (v_license.id, p_device_id, p_user_agent, now())
    ON CONFLICT (license_id, device_id) DO NOTHING;

    IF v_license.activated_at IS NULL THEN
      UPDATE public.licenses SET activated_at = now(), status = 'active' WHERE id = v_license.id;
    END IF;
  END IF;

  -- 5. Return success payload matching extension verification
  RETURN jsonb_build_object(
    'valid', true,
    'status', COALESCE(v_license.status, 'active'),
    'session_id', v_session_id::text,
    'user_name', COALESCE(v_license.notes, ''),
    'expires_at', v_license.expires_at,
    'activated_at', COALESCE(v_license.activated_at, now())
  );
END;
$$;
