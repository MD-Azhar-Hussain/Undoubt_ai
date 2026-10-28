CREATE SCHEMA IF NOT EXISTS undoubt;
REVOKE ALL ON SCHEMA undoubt FROM PUBLIC;

CREATE TABLE IF NOT EXISTS undoubt.rooms (
  room_id text PRIMARY KEY,
  host_id text NOT NULL,
  host_email text NOT NULL,
  topic text NOT NULL DEFAULT '' CHECK (length(topic) <= 200),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS rooms_host_created ON undoubt.rooms(host_id, created_at DESC);
CREATE TABLE IF NOT EXISTS undoubt.platform_admins (
  user_id text PRIMARY KEY,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS undoubt.organisations (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS undoubt.organisation_members (
  organisation_id uuid NOT NULL REFERENCES undoubt.organisations(id),
  email text NOT NULL CHECK (email = lower(email) AND length(email) <= 254),
  user_id text,
  role text NOT NULL CHECK (role IN ('admin','host','member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id,email)
);
CREATE UNIQUE INDEX IF NOT EXISTS organisation_member_identity ON undoubt.organisation_members(organisation_id,user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS organisation_members_user ON undoubt.organisation_members(user_id,organisation_id);
CREATE INDEX IF NOT EXISTS organisation_members_pending_email ON undoubt.organisation_members(email) WHERE user_id IS NULL AND status='active';
ALTER TABLE undoubt.rooms ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES undoubt.organisations(id);
CREATE INDEX IF NOT EXISTS rooms_organisation_id ON undoubt.rooms(organisation_id,room_id);
CREATE TABLE IF NOT EXISTS undoubt.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organisation_id uuid REFERENCES undoubt.organisations(id),
  actor_id text NOT NULL,
  action text NOT NULL,
  target text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_organisation_id ON undoubt.audit_events(organisation_id,id DESC);
CREATE TABLE IF NOT EXISTS undoubt.questions (
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id uuid PRIMARY KEY,
  room_id text NOT NULL REFERENCES undoubt.rooms(room_id),
  text text NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 2000),
  user_id text NOT NULL,
  user_email text NOT NULL,
  upvotes integer NOT NULL DEFAULT 0 CHECK (upvotes >= 0),
  revision integer NOT NULL DEFAULT 0,
  answered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS questions_room_sequence ON undoubt.questions(room_id, sequence DESC);
ALTER TABLE undoubt.questions ADD COLUMN IF NOT EXISTS answer text NOT NULL DEFAULT '' CHECK (length(answer) <= 5000);
ALTER TABLE undoubt.questions ADD COLUMN IF NOT EXISTS answered_at timestamptz;
CREATE TABLE IF NOT EXISTS undoubt.room_members (
  room_id text NOT NULL REFERENCES undoubt.rooms(room_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_visited_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS members_user_visited ON undoubt.room_members(user_id, last_visited_at DESC);
-- Recover historical participation where a saved question provides evidence.
INSERT INTO undoubt.room_members(room_id, user_id, joined_at, last_visited_at)
SELECT room_id, user_id, min(created_at), max(created_at) FROM undoubt.questions GROUP BY room_id, user_id
ON CONFLICT (room_id, user_id) DO NOTHING;
CREATE TABLE IF NOT EXISTS undoubt.votes (
  question_id uuid NOT NULL REFERENCES undoubt.questions(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  PRIMARY KEY(question_id, user_id)
);
-- No browser/Data API access. The trusted backend uses the database owner connection.
ALTER TABLE undoubt.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE undoubt.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE undoubt.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE undoubt.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE undoubt.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE undoubt.organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE undoubt.organisation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE undoubt.audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA undoubt FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA undoubt FROM PUBLIC;

ALTER TABLE undoubt.organisation_members ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE undoubt.organisations DROP CONSTRAINT IF EXISTS organisations_status_check;
ALTER TABLE undoubt.organisations ADD CONSTRAINT organisations_status_check CHECK(status IN ('active','suspended','deleted'));
