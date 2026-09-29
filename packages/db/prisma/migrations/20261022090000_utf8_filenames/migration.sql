-- Uploaded files' names read as Latin-1 when they were UTF-8 (issue #130):
-- "même" stored as "mÃªme". Each such name is re-read as UTF-8; one that
-- doesn't read as UTF-8 that way (a name really spelt with "Ã") is left alone.
DO $$
DECLARE
  row RECORD;
  fixed TEXT;
BEGIN
  FOR row IN SELECT id, filename FROM "Attachment" WHERE filename ~ '[\u00C2-\u00F4][\u0080-\u00BF]' LOOP
    BEGIN
      fixed := convert_from(convert_to(row.filename, 'LATIN1'), 'UTF8');
      UPDATE "Attachment" SET filename = fixed WHERE id = row.id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;
