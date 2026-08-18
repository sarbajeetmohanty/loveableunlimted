-- Migration: 003_accounts_and_dual_auth.sql
-- Enables Email + Password authentication alongside License Keys

-- 1. Create accounts table
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'pending')),
    max_devices INT NOT NULL DEFAULT 5,
    activated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Add account_id column to devices table if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'devices' 
        AND column_name = 'account_id'
    ) THEN
        ALTER TABLE public.devices ADD COLUMN account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3. RLS for accounts
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read accounts" ON public.accounts;
CREATE POLICY "Allow read accounts" ON public.accounts
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all for authenticated/anon on accounts" ON public.accounts;
CREATE POLICY "Allow all for authenticated/anon on accounts" ON public.accounts
    FOR ALL USING (true) WITH CHECK (true);

-- 4. Create index for fast email lookups
CREATE INDEX IF NOT EXISTS idx_accounts_email ON public.accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON public.accounts(status);

-- 5. Insert default test account (if not exists)
-- Email: admin@bundlee.in | Password: password123
INSERT INTO public.accounts (email, password_hash, plan_id, status, max_devices, expires_at, notes)
SELECT 
    'admin@bundlee.in', 
    'password123', 
    id, 
    'active', 
    999, 
    NOW() + INTERVAL '2 years', 
    'Default Admin Account'
FROM public.plans 
WHERE name ILIKE '%Monthly%' OR name ILIKE '%Pro%' 
LIMIT 1
ON CONFLICT (email) DO NOTHING;
