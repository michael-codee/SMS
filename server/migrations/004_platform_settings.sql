-- Platform-wide settings (system and security), more than one platform administrator,
-- and the new default colours.
CREATE TABLE platform_settings (
  id         boolean PRIMARY KEY DEFAULT true CHECK (id),   -- exactly one row
  settings   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform_settings (id) VALUES (true);

DO $$
BEGIN
  ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE platform_settings FORCE ROW LEVEL SECURITY;
  EXECUTE format('CREATE POLICY owner_all ON platform_settings TO %I USING (true) WITH CHECK (true)', current_user);
END $$;

ALTER TABLE platform_admins
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN last_login_at timestamptz;

-- Schools still on the old default colours move to the new ones; schools that chose their own keep them.
UPDATE schools
   SET settings = jsonb_set(settings, '{colors}', '{"primary": "#12355B", "accent": "#E9A23B", "banner": "#1E5BB8"}'::jsonb),
       rev = rev + 1
 WHERE settings->'colors' = '{"primary": "#1B3A2E", "accent": "#B98A2C", "banner": "#003399"}'::jsonb;
