/*
# School application emails + privacy consent record

Plain-English summary: every new "List Your School" application is emailed to
info@bookaclass.gr by a Supabase Edge Function. This migration gives each application a
delivery status so a failed email is recorded (and can be resent), and records when the
applicant ticked the privacy policy box.

## New columns on pre_registrations
- email_status (text, required, default 'pending'): pending -> sending -> sent / failed.
  Old applications are set to 'skipped' so they never trigger an email.
- email_sent_at (timestamptz): when the email was sent
- email_error (text): the reason, if sending failed
- email_attempts (integer, default 0): how many times sending was tried
- privacy_acknowledged_at (timestamptz): when the applicant accepted the privacy policy

## Security
- The public form may only create applications in the 'pending' state, so nobody can
  mark their own application as already emailed. Everything else about the insert
  policy is unchanged. Visitors still cannot read applications.

## How to resend a failed email
In the Supabase Table Editor, set email_status of that application back to 'pending'.

## Notes
1. Safe to re-run (IF NOT EXISTS / DROP IF EXISTS). No data is removed.
*/

ALTER TABLE pre_registrations ADD COLUMN IF NOT EXISTS email_status text;
ALTER TABLE pre_registrations ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
ALTER TABLE pre_registrations ADD COLUMN IF NOT EXISTS email_error text;
ALTER TABLE pre_registrations ADD COLUMN IF NOT EXISTS email_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE pre_registrations ADD COLUMN IF NOT EXISTS privacy_acknowledged_at timestamptz;

-- Applications that already exist must never trigger an email
UPDATE pre_registrations SET email_status = 'skipped' WHERE email_status IS NULL;

ALTER TABLE pre_registrations ALTER COLUMN email_status SET DEFAULT 'pending';
ALTER TABLE pre_registrations ALTER COLUMN email_status SET NOT NULL;

ALTER TABLE pre_registrations DROP CONSTRAINT IF EXISTS pre_registrations_email_status_check;
ALTER TABLE pre_registrations ADD CONSTRAINT pre_registrations_email_status_check
  CHECK (email_status IN ('pending', 'sending', 'sent', 'failed', 'skipped'));

-- Public form can only create brand-new ('pending') applications
DROP POLICY IF EXISTS "public_insert_pre_registrations" ON pre_registrations;
CREATE POLICY "public_insert_pre_registrations"
  ON pre_registrations FOR INSERT
  TO anon, authenticated
  WITH CHECK (email_status = 'pending');
