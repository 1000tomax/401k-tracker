-- Add email_notifications table for tracking sent emails
-- Prevents duplicates, enables debugging, provides audit trail

CREATE TABLE IF NOT EXISTS email_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_type TEXT NOT NULL, -- 'transaction', 'weekly', 'monthly', 'quarterly'
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recipient TEXT NOT NULL,
  subject TEXT,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  metadata JSONB DEFAULT '{}', -- Store email content hash, transaction count, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_email_notifications_type ON email_notifications(email_type);
CREATE INDEX IF NOT EXISTS idx_email_notifications_sent_at ON email_notifications(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_notifications_success ON email_notifications(success);

-- Enable RLS for future multi-user support
ALTER TABLE email_notifications ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Allow service role all access on email_notifications" ON email_notifications
  FOR ALL USING (true) WITH CHECK (true);

-- Comment for documentation
COMMENT ON TABLE email_notifications IS 'Tracks all sent email notifications for audit trail and duplicate prevention';
COMMENT ON COLUMN email_notifications.email_type IS 'Type of email: transaction, weekly, monthly, or quarterly';
COMMENT ON COLUMN email_notifications.metadata IS 'Additional data like transaction count, date range, content hash';
