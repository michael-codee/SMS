-- Tighten 002: the "owner_all" exemption applied to every database role except sms_app.
-- On hosts that expose tables to other roles (Supabase's public API uses "anon" and
-- "authenticated"), those roles must see nothing. Exemptions now name the owner role only,
-- school rules apply to sms_app only, and tables without rules get them too.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['schools','classes','subjects','teachers','pupils','users','parent_children','grades',
                           'report_comments','attendance','fees','payments','announcements',
                           'question_submissions','audit_log','snapshots','sessions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS owner_all ON %I', t);
    EXECUTE format('CREATE POLICY owner_all ON %I TO %I USING (true) WITH CHECK (true)', t, current_user);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sms_app') THEN
      EXECUTE format('ALTER POLICY school_isolation ON %I TO sms_app', t);
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['platform_admins','schema_migrations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY owner_all ON %I TO %I USING (true) WITH CHECK (true)', t, current_user);
  END LOOP;
END $$;
