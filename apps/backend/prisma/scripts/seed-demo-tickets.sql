WITH tier_slots AS (
  SELECT 'cmo6opger0004wwzbccn9an88'::text AS tier_id, generate_series(1,1) AS n
  UNION ALL SELECT 'cmo6opgfj000awwzb5j92k42u', generate_series(1,3)
  UNION ALL SELECT 'cmo6opgfu000gwwzb9nznwawk', generate_series(1,10)
  UNION ALL SELECT 'cmo6opgg4000mwwzb7t59fk2k', generate_series(1,30)
  UNION ALL SELECT 'cmo6opggd000swwzbn17zo6ff', generate_series(1,1)
), shuffled AS (
  SELECT tier_id, ROW_NUMBER() OVER (ORDER BY random()) AS position FROM tier_slots
)
INSERT INTO "Ticket" (id, "kujiEventId", position, "prizeTierId", status, "createdAt", "updatedAt")
SELECT 'tk_' || substr(md5(random()::text || position::text), 1, 24),
       'cmo6opgeh0002wwzb4r645xlg', position, tier_id, 'AVAILABLE', NOW(), NOW()
  FROM shuffled;
SELECT COUNT(*) AS ticket_rows FROM "Ticket" WHERE "kujiEventId" = 'cmo6opgeh0002wwzb4r645xlg';
