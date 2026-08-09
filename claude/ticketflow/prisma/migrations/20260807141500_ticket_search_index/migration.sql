-- Full-text search over ticket subject + message bodies.
--
-- Prisma has no expression-index syntax, so this migration is hand-written.
-- `src/lib/search.ts` issues the matching
-- `to_tsvector('english', ...) @@ websearch_to_tsquery('english', ...)`
-- predicate so the planner can use these indexes.
--
-- Only *expression* indexes belong here. A GIN index on a bare column would be
-- seen as drift by `prisma migrate dev` and generated away on the next run.

CREATE INDEX "Ticket_subject_fts_idx"
  ON "Ticket"
  USING GIN (to_tsvector('english', "subject"));

CREATE INDEX "Message_body_fts_idx"
  ON "Message"
  USING GIN (to_tsvector('english', "body"));
