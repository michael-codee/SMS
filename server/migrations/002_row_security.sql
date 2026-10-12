-- Defence in depth: even if application code forgot a "WHERE school_id = ..." filter,
-- the database only returns rows of the school bound to the current transaction.
-- Request handlers run as the non-owner role sms_app with app.school_id set (see server/db.js).

-- Creating the role needs CREATEROLE (or superuser). On hosts that refuse, the app still runs
-- (server/db.js detects the missing role and logs a warning), relying on its own school filters.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sms_app') THEN
    CREATE ROLE sms_app NOLOGIN;
  END IF;
  EXECUTE format('GRANT sms_app TO %I', current_user);
  GRANT USAGE ON SCHEMA public TO sms_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON
    schools, classes, subjects, teachers, pupils, users, parent_children, grades, report_comments,
    attendance, fees, payments, announcements, question_submissions, audit_log, snapshots, sessions
  TO sms_app;
  GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq, snapshots_id_seq TO sms_app;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Could not create or grant role sms_app (%). Row-level security will not be enforced by the database.', SQLERRM;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['classes','subjects','teachers','pupils','users','parent_children','grades',
                           'report_comments','attendance','fees','payments','announcements',
                           'question_submissions','audit_log','snapshots','sessions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY school_isolation ON %I
      USING (school_id = NULLIF(current_setting('app.school_id', true), '')::uuid)
      WITH CHECK (school_id = NULLIF(current_setting('app.school_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools FORCE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON schools
  USING (id = NULLIF(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.school_id', true), '')::uuid);

-- The table owner (used for sign-in, migrations and platform administration) is exempt.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['schools','classes','subjects','teachers','pupils','users','parent_children','grades',
                           'report_comments','attendance','fees','payments','announcements',
                           'question_submissions','audit_log','snapshots','sessions'] LOOP
    EXECUTE format($p$CREATE POLICY owner_all ON %I TO PUBLIC
      USING (current_user <> 'sms_app') WITH CHECK (current_user <> 'sms_app')$p$, t);
  END LOOP;
END $$;
