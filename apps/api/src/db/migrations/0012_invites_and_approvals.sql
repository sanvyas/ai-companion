-- 0012: invite-only sign-in codes and the approval queue for admin changes.

-- A person the founders have let in. While no SMS vendor is connected, the code the owner hands them is how they
-- sign in. Only a keyed hash of the phone and of the code is stored.
CREATE TABLE invited_logins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash      bytea NOT NULL UNIQUE,
  phone_last4     text NOT NULL,
  label           text NOT NULL DEFAULT '',
  code_hash       text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz,
  revoked_at      timestamptz
);
ALTER TABLE invited_logins ENABLE ROW LEVEL SECURITY;

-- A change an admin asked for that needs someone more senior to approve it before it reaches the app.
CREATE TABLE change_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary          text NOT NULL,
  permission       text NOT NULL,
  method           text NOT NULL,
  url              text NOT NULL,
  body             jsonb,
  requested_by     uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  requested_email  text NOT NULL,
  requested_role   text NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applying','applied','failed','rejected','withdrawn')),
  decided_by       uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  decided_email    text,
  decision_note    text,
  decided_at       timestamptz,
  result           jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX change_requests_status_idx ON change_requests (status, created_at DESC);
ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;
