-- ============================================================
-- Migration 11 — exam_scores: enforce score <= max_score
-- ============================================================
-- The "C2" guardrail: a paper-exam score may never exceed its max_score.
-- This was applied to the live DB on 2026-05-30 via the SQL editor but was
-- never captured in a migration file or in schema.sql (drift). Recorded here
-- for reproducibility. Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE exam_scores DROP CONSTRAINT IF EXISTS score_within_max;
ALTER TABLE exam_scores ADD  CONSTRAINT score_within_max CHECK (score <= max_score);
