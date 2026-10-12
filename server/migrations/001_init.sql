-- Initial schema for the multi-school School Management System.
-- Every school-owned table carries school_id. Row-level security (see 002) makes
-- the database itself refuse to return another school's rows.

CREATE TABLE schools (
  id          uuid PRIMARY KEY,
  code        text NOT NULL,
  name        text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  logo        text,                       -- data: URL of the school crest, or NULL
  rev         bigint NOT NULL DEFAULT 1,  -- bumped on every change, lets browsers skip unchanged reloads
  next_admission_seq integer NOT NULL DEFAULT 1,
  next_receipt_seq   integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX schools_code_uq ON schools (lower(code));

-- Platform administrators manage schools; they belong to no school.
CREATE TABLE platform_admins (
  id              uuid PRIMARY KEY,
  username        text NOT NULL,
  name            text NOT NULL,
  password_hash   text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked          boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX platform_admins_username_uq ON platform_admins (lower(username));

CREATE TABLE classes (
  id         text PRIMARY KEY,
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name       text NOT NULL,
  sort       integer NOT NULL DEFAULT 0
);
CREATE INDEX classes_school ON classes (school_id);

CREATE TABLE subjects (
  id         text PRIMARY KEY,
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name       text NOT NULL,
  sort       integer NOT NULL DEFAULT 0
);
CREATE INDEX subjects_school ON subjects (school_id);
CREATE UNIQUE INDEX subjects_name_uq ON subjects (school_id, lower(name));

CREATE TABLE teachers (
  id             text PRIMARY KEY,
  school_id      uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name           text NOT NULL,
  class_id       text REFERENCES classes(id) ON DELETE SET NULL,
  subjects       text[] NOT NULL DEFAULT '{}',
  address        text NOT NULL DEFAULT '',
  telephone      text NOT NULL DEFAULT '',
  dob            text NOT NULL DEFAULT '',
  place_of_birth text NOT NULL DEFAULT '',
  qualifications text NOT NULL DEFAULT '',
  photo          text,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX teachers_school ON teachers (school_id);

CREATE TABLE pupils (
  id             text PRIMARY KEY,
  school_id      uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name           text NOT NULL,
  admission_no   text NOT NULL,
  class_id       text REFERENCES classes(id) ON DELETE SET NULL,
  parent_name    text NOT NULL DEFAULT '',
  address        text NOT NULL DEFAULT '',
  telephone      text NOT NULL DEFAULT '',
  dob            text NOT NULL DEFAULT '',
  place_of_birth text NOT NULL DEFAULT '',
  photo          text,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pupils_school ON pupils (school_id);
CREATE UNIQUE INDEX pupils_admission_uq ON pupils (school_id, admission_no);

CREATE TABLE users (
  id                   text PRIMARY KEY,
  school_id            uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  username             text NOT NULL,
  password_hash        text NOT NULL,
  role                 text NOT NULL CHECK (role IN ('proprietor','principal','bursar','teacher','pupil','parent','examofficer')),
  name                 text NOT NULL,
  title                text NOT NULL DEFAULT '',
  teacher_id           text REFERENCES teachers(id) ON DELETE SET NULL,
  pupil_id             text REFERENCES pupils(id) ON DELETE SET NULL,
  active               boolean NOT NULL DEFAULT true,
  locked               boolean NOT NULL DEFAULT false,
  failed_attempts      integer NOT NULL DEFAULT 0,
  must_change_password boolean NOT NULL DEFAULT true,
  last_login_at        timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_uq ON users (school_id, lower(username));

CREATE TABLE parent_children (
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pupil_id   text NOT NULL REFERENCES pupils(id) ON DELETE CASCADE,
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, pupil_id)
);

CREATE TABLE sessions (
  token_hash   text PRIMARY KEY,           -- sha256 of the cookie value; the raw token is never stored
  kind         text NOT NULL CHECK (kind IN ('school','platform')),
  school_id    uuid REFERENCES schools(id) ON DELETE CASCADE,
  user_id      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  ip           text NOT NULL DEFAULT '',
  user_agent   text NOT NULL DEFAULT ''
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE grades (
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  pupil_id   text NOT NULL REFERENCES pupils(id) ON DELETE CASCADE,
  subject    text NOT NULL,
  term       text NOT NULL,
  year       text NOT NULL,
  scores     jsonb NOT NULL,
  updated_by text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pupil_id, subject, term, year)
);
CREATE INDEX grades_school_year ON grades (school_id, year);

CREATE TABLE report_comments (
  school_id         uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  pupil_id          text NOT NULL REFERENCES pupils(id) ON DELETE CASCADE,
  term              text NOT NULL,        -- a term name, or 'combined' for the end-of-year card
  year              text NOT NULL,
  teacher_comment   text NOT NULL DEFAULT '',
  principal_comment text NOT NULL DEFAULT '',
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pupil_id, term, year)
);

CREATE TABLE attendance (
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  pupil_id   text NOT NULL REFERENCES pupils(id) ON DELETE CASCADE,
  class_id   text,
  date       date NOT NULL,
  year       text NOT NULL,
  present    boolean NOT NULL,
  marked_by  text NOT NULL DEFAULT '',
  PRIMARY KEY (pupil_id, date)
);
CREATE INDEX attendance_school_year ON attendance (school_id, year);

CREATE TABLE fees (
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  pupil_id   text NOT NULL REFERENCES pupils(id) ON DELETE CASCADE,
  term       text NOT NULL,
  year       text NOT NULL,
  amount     numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  PRIMARY KEY (pupil_id, term, year)
);

CREATE TABLE payments (
  id          text PRIMARY KEY,
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  pupil_id    text NOT NULL REFERENCES pupils(id) ON DELETE CASCADE,
  amount      numeric(14,2) NOT NULL CHECK (amount > 0),
  term        text NOT NULL,
  year        text NOT NULL,
  date        date NOT NULL DEFAULT CURRENT_DATE,
  note        text NOT NULL DEFAULT '',
  receipt_no  text NOT NULL,
  recorded_by text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_school ON payments (school_id, year, term);

CREATE TABLE announcements (
  id         text PRIMARY KEY,
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  author     text NOT NULL,
  text       text NOT NULL,
  date       date NOT NULL DEFAULT CURRENT_DATE,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX announcements_school ON announcements (school_id, created_at DESC);

CREATE TABLE question_submissions (
  id           text PRIMARY KEY,
  school_id    uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id   text,
  teacher_name text NOT NULL,
  class_id     text,
  subject      text NOT NULL,
  term         text NOT NULL,
  year         text NOT NULL,
  title        text NOT NULL,
  content      text NOT NULL,
  marks        integer NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Reviewed','Approved','Rejected')),
  comment      text NOT NULL DEFAULT '',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by  text NOT NULL DEFAULT '',
  reviewed_at  timestamptz
);
CREATE INDEX questions_school ON question_submissions (school_id);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  school_id  uuid REFERENCES schools(id) ON DELETE CASCADE,  -- NULL = platform-level event
  at         timestamptz NOT NULL DEFAULT now(),
  actor      text NOT NULL,
  action     text NOT NULL,
  details    text NOT NULL DEFAULT '',
  ip         text NOT NULL DEFAULT ''
);
CREATE INDEX audit_school_at ON audit_log (school_id, at DESC);

-- Daily (and pre-restore) copies of each school's data, kept inside the database.
CREATE TABLE snapshots (
  id         bigserial PRIMARY KEY,
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  reason     text NOT NULL,
  data       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX snapshots_school ON snapshots (school_id, created_at DESC);
