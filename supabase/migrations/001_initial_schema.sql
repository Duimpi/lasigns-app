-- ============================================================
-- LA SIGNS & GRAPHICS CC — COMPLETE DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── PROFILES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── CLIENTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  company TEXT,
  address TEXT,
  vat_number TEXT,
  notes TEXT,
  is_retail BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_phones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  label TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS client_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  label TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE
);

-- ─── APP SETTINGS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default settings
INSERT INTO app_settings (key, value)
VALUES
  ('quote_counter', '0'),
  ('job_counter', '0'),
  ('retail_job_counter', '449'),
  ('vat_rate', '15')
ON CONFLICT (key) DO NOTHING;

-- ─── QUOTES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_number TEXT NOT NULL UNIQUE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  client_address TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','approved','in_production','completed','cancelled')),
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 15,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  valid_until DATE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  is_retail BOOLEAN NOT NULL DEFAULT FALSE,
  linked_job_card_id UUID,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quote_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  size TEXT,
  sort_order INT NOT NULL DEFAULT 0
);

-- ─── JOB CARDS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  notes TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','designing','printing','installation','completed','delivered')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  assigned_worker TEXT
    CHECK (assigned_worker IN ('Nicole','Geraldo','Bets-Mari')),
  due_date DATE,
  linked_quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  store TEXT,
  branch TEXT,
  is_retail BOOLEAN NOT NULL DEFAULT FALSE,
  sales_rep TEXT,
  date_completed DATE,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 15,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_card_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_card_id UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  size TEXT,
  sort_order INT NOT NULL DEFAULT 0
);

-- ─── COMMENTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_card_id UUID REFERENCES job_cards(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── UPLOADS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_card_id UUID REFERENCES job_cards(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  uploaded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ACTIVITY LOGS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('client','quote','job_card','retail_job','chat')),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  details JSONB,
  performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── CHATS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,
  type TEXT NOT NULL DEFAULT 'direct'
    CHECK (type IN ('direct','group','job')),
  job_card_id UUID REFERENCES job_cards(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,
  UNIQUE(chat_id, profile_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text','image','file','system')),
  file_url TEXT,
  file_name TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── DAILY UPDATES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker TEXT NOT NULL CHECK (worker IN ('Nicole','Geraldo','Bets-Mari')),
  job_card_id UUID REFERENCES job_cards(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── RETAIL BRANCHES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retail_branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store TEXT NOT NULL CHECK (store IN ('Shoprite','Checkers','Usave')),
  name TEXT NOT NULL,
  is_liquor BOOLEAN NOT NULL DEFAULT FALSE
);

-- Seed retail branches
INSERT INTO retail_branches (store, name, is_liquor) VALUES
  -- Shoprite branches
  ('Shoprite', 'Shoprite Katutura', false),
  ('Shoprite', 'Shoprite Wernhil', false),
  ('Shoprite', 'Shoprite Maerua', false),
  ('Shoprite', 'Shoprite Klein Windhoek', false),
  ('Shoprite', 'Shoprite Khomasdal', false),
  ('Shoprite', 'Shoprite Oshakati', false),
  ('Shoprite', 'Shoprite Ondangwa', false),
  ('Shoprite', 'Shoprite Rundu', false),
  ('Shoprite', 'Shoprite Katima Mulilo', false),
  ('Shoprite', 'Shoprite Swakopmund', false),
  ('Shoprite', 'Shoprite Walvis Bay', false),
  ('Shoprite', 'Shoprite Lüderitz', false),
  ('Shoprite', 'Shoprite Keetmanshoop', false),
  ('Shoprite', 'Shoprite Gobabis', false),
  ('Shoprite', 'Shoprite Otjiwarongo', false),
  ('Shoprite', 'Shoprite Okahandja', false),
  ('Shoprite', 'Shoprite Liquor Katutura', true),
  ('Shoprite', 'Shoprite Liquor Wernhil', true),
  ('Shoprite', 'Shoprite Liquor Maerua', true),
  ('Shoprite', 'Shoprite Liquor Oshakati', true),
  -- Checkers branches
  ('Checkers', 'Checkers Grove Mall', false),
  ('Checkers', 'Checkers Maerua Mall', false),
  ('Checkers', 'Checkers Wernhil', false),
  ('Checkers', 'Checkers Eros', false),
  ('Checkers', 'Checkers Liquor Grove', true),
  ('Checkers', 'Checkers Liquor Maerua', true),
  ('Checkers', 'Checkers Liquor Wernhil', true),
  -- Usave branches
  ('Usave', 'Usave Katutura', false),
  ('Usave', 'Usave Khomasdal', false),
  ('Usave', 'Usave Oshakati', false),
  ('Usave', 'Usave Ondangwa', false),
  ('Usave', 'Usave Rundu', false),
  ('Usave', 'Usave Swakopmund', false),
  ('Usave', 'Usave Walvis Bay', false)
ON CONFLICT DO NOTHING;

-- ─── INDEXES ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_company ON clients USING gin(company gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_client_phones_phone ON client_phones(phone);
CREATE INDEX IF NOT EXISTS idx_client_emails_email ON client_emails(email);
CREATE INDEX IF NOT EXISTS idx_quotes_client_id ON quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_is_retail ON quotes(is_retail);
CREATE INDEX IF NOT EXISTS idx_job_cards_client_id ON job_cards(client_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_status ON job_cards(status);
CREATE INDEX IF NOT EXISTS idx_job_cards_is_retail ON job_cards(is_retail);
CREATE INDEX IF NOT EXISTS idx_job_cards_assigned_worker ON job_cards(assigned_worker);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);

-- ─── FUNCTIONS ──────────────────────────────────────────────

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Normalize phone number for search
CREATE OR REPLACE FUNCTION normalize_phone(p TEXT)
RETURNS TEXT AS $$
DECLARE
  cleaned TEXT;
BEGIN
  -- Remove all non-digit characters except leading +
  cleaned := regexp_replace(p, '[^\d]', '', 'g');
  -- If starts with 264, replace with 0
  IF LEFT(cleaned, 3) = '264' THEN
    cleaned := '0' || SUBSTRING(cleaned FROM 4);
  END IF;
  RETURN cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Next quote number
CREATE OR REPLACE FUNCTION get_next_quote_number()
RETURNS TEXT AS $$
DECLARE
  counter INT;
BEGIN
  UPDATE app_settings
  SET value = (value::INT + 1)::TEXT
  WHERE key = 'quote_counter'
  RETURNING value::INT INTO counter;
  RETURN 'LA-Q' || LPAD(counter::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Next job card number
CREATE OR REPLACE FUNCTION get_next_job_number()
RETURNS TEXT AS $$
DECLARE
  counter INT;
BEGIN
  UPDATE app_settings
  SET value = (value::INT + 1)::TEXT
  WHERE key = 'job_counter'
  RETURNING value::INT INTO counter;
  RETURN 'LA-J' || LPAD(counter::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Next retail job number
CREATE OR REPLACE FUNCTION get_next_retail_job_number()
RETURNS TEXT AS $$
DECLARE
  counter INT;
  yr TEXT;
BEGIN
  UPDATE app_settings
  SET value = (value::INT + 1)::TEXT
  WHERE key = 'retail_job_counter'
  RETURNING value::INT INTO counter;
  yr := EXTRACT(YEAR FROM NOW())::TEXT;
  RETURN counter::TEXT || '-' || yr;
END;
$$ LANGUAGE plpgsql;

-- Auto-create profile on auth user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'staff')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── TRIGGERS ───────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_quotes_updated_at ON quotes;
CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_job_cards_updated_at ON job_cards;
CREATE TRIGGER trg_job_cards_updated_at
  BEFORE UPDATE ON job_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_comments_updated_at ON comments;
CREATE TRIGGER trg_comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_chats_updated_at ON chats;
CREATE TRIGGER trg_chats_updated_at
  BEFORE UPDATE ON chats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_chat_messages_updated_at ON chat_messages;
CREATE TRIGGER trg_chat_messages_updated_at
  BEFORE UPDATE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_card_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_branches ENABLE ROW LEVEL SECURITY;

-- Profiles: all authenticated users can view, own profile update
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Clients: all authenticated users
CREATE POLICY "clients_select" ON clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "clients_insert" ON clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clients_update" ON clients FOR UPDATE TO authenticated USING (true);
CREATE POLICY "clients_delete" ON clients FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "client_phones_all" ON client_phones FOR ALL TO authenticated USING (true);
CREATE POLICY "client_emails_all" ON client_emails FOR ALL TO authenticated USING (true);

-- Quotes
CREATE POLICY "quotes_select" ON quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "quotes_insert" ON quotes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "quotes_update" ON quotes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "quotes_delete" ON quotes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "quote_items_all" ON quote_items FOR ALL TO authenticated USING (true);

-- Job Cards
CREATE POLICY "job_cards_select" ON job_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "job_cards_insert" ON job_cards FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "job_cards_update" ON job_cards FOR UPDATE TO authenticated USING (true);
CREATE POLICY "job_cards_delete" ON job_cards FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "job_card_items_all" ON job_card_items FOR ALL TO authenticated USING (true);

-- Comments
CREATE POLICY "comments_select" ON comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "comments_insert" ON comments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "comments_update" ON comments FOR UPDATE TO authenticated USING (author_id = auth.uid());
CREATE POLICY "comments_delete" ON comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Uploads
CREATE POLICY "uploads_all" ON uploads FOR ALL TO authenticated USING (true);

-- Activity logs: all see, insert; nobody updates/deletes
CREATE POLICY "activity_logs_select" ON activity_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "activity_logs_insert" ON activity_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Chats and messages
CREATE POLICY "chats_select" ON chats FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM chat_members cm WHERE cm.chat_id = id AND cm.profile_id = auth.uid())
);
CREATE POLICY "chats_insert" ON chats FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "chats_delete" ON chats FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "chat_members_all" ON chat_members FOR ALL TO authenticated USING (true);

CREATE POLICY "chat_messages_select" ON chat_messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM chat_members cm WHERE cm.chat_id = chat_id AND cm.profile_id = auth.uid())
);
CREATE POLICY "chat_messages_insert" ON chat_messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());
CREATE POLICY "chat_messages_update" ON chat_messages FOR UPDATE TO authenticated USING (sender_id = auth.uid());

-- Daily updates
CREATE POLICY "daily_updates_select" ON daily_updates FOR SELECT TO authenticated USING (true);
CREATE POLICY "daily_updates_insert" ON daily_updates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "daily_updates_delete" ON daily_updates FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- App settings: all read, admin write
CREATE POLICY "app_settings_select" ON app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_settings_update" ON app_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "app_settings_insert_fn" ON app_settings FOR INSERT TO authenticated WITH CHECK (true);

-- Retail branches: all read
CREATE POLICY "retail_branches_select" ON retail_branches FOR SELECT TO authenticated USING (true);

-- ─── REALTIME ───────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE job_cards;
ALTER PUBLICATION supabase_realtime ADD TABLE job_card_items;
ALTER PUBLICATION supabase_realtime ADD TABLE quotes;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chats;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_members;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE daily_updates;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;
