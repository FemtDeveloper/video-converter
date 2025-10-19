-- Add a column to persist generated subtitle artifacts
ALTER TABLE "Job" ADD COLUMN "resultSubtitlePath" TEXT;

-- Extend the job type enum with caption jobs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'JobType' AND e.enumlabel = 'VIDEO_CAPTION'
  ) THEN
    ALTER TYPE "JobType" ADD VALUE 'VIDEO_CAPTION';
  END IF;
END $$;
