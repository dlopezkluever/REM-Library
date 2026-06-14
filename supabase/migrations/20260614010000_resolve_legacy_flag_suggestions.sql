-- Flag claims and entities are now routed to content_flags / admin flags queue.
-- Mark any unresolved legacy flag_claim / flag_entity suggestion rows as resolved
-- so they no longer appear as pending work in /admin/suggestions.
UPDATE suggestions
SET status = 'resolved'
WHERE type IN ('flag_claim', 'flag_entity')
  AND status = 'pending';
