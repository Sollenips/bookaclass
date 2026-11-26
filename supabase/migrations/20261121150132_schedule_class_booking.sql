BEGIN;

ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS schedule_key text;
CREATE UNIQUE INDEX IF NOT EXISTS classes_store_schedule_key
  ON public.classes (store_id, schedule_key);

CREATE OR REPLACE FUNCTION public.resolve_scheduled_class(
  school_id uuid,
  lesson_title text,
  lesson_ages text,
  lesson_cost text,
  lesson_availability text
)
RETURNS SETOF public.classes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  school public.stores%ROWTYPE;
  schedule jsonb;
  matching_rows jsonb;
  age_values text[];
  min_age integer;
  max_age integer;
  price numeric;
  seats integer;
  duration integer;
  schedule_label text;
  identity_key text;
BEGIN
  SELECT * INTO school
  FROM public.stores
  WHERE id = school_id AND published_at IS NOT NULL
  FOR SHARE;

  IF NOT FOUND OR nullif(btrim(lesson_title), '') IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    schedule := school.weekly_schedule::jsonb;
    IF jsonb_typeof(schedule) = 'string' THEN
      schedule := (schedule #>> '{}')::jsonb;
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    schedule := NULL;
  END;

  IF jsonb_typeof(schedule) = 'object' THEN
    schedule := schedule -> 'rows';
  END IF;

  IF jsonb_typeof(schedule) IS DISTINCT FROM 'array' THEN
    -- Historical schedules have one lesson per line, with labelled fields.
    SELECT jsonb_agg(jsonb_build_object(
      'lesson', btrim(split_part(line, ' — ', 1)),
      'day', CASE WHEN part ~ '^[^0-9]+$' THEN btrim(part)
                  ELSE btrim(regexp_replace(part, '[0-9]{1,2}:[0-9]{2}$', '')) END,
      'time', substring(part FROM '[0-9]{1,2}:[0-9]{2}$'),
      'ages', substring(line FROM '(?i)(?:Eligible ages|Ages|Ηλικίες συμμετοχής|Ηλικίες|Ηλικία):[[:space:]]*([^—]+)'),
      'cost', substring(line FROM '(?i)(?:Cost|Κόστος):[[:space:]]*([^—]+)'),
      'availability', substring(line FROM '(?i)(?:Availability|Διαθεσιμότητα):[[:space:]]*([^—]+)')
    ))
    INTO schedule
    FROM regexp_split_to_table(school.weekly_schedule, E'\\r?\\n') AS lines(line)
    CROSS JOIN LATERAL (SELECT btrim(split_part(line, ' — ', 2)) AS part) AS fields
    WHERE part <> '' AND part !~ ':.*:';
  END IF;

  SELECT jsonb_agg(row_data)
  INTO matching_rows
  FROM jsonb_array_elements(coalesce(schedule, '[]'::jsonb)) AS rows(row_data)
  WHERE lower(btrim(row_data ->> 'lesson')) = lower(btrim(lesson_title))
    AND btrim(coalesce(row_data ->> 'ages', '')) = lesson_ages
    AND btrim(coalesce(row_data ->> 'cost', '')) = lesson_cost
    AND btrim(coalesce(row_data ->> 'availability', '')) = lesson_availability;

  IF matching_rows IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(hit[1]) INTO age_values
  FROM regexp_matches(lesson_ages, '[0-9]{1,2}', 'g') AS matches(hit);
  min_age := coalesce(age_values[1]::integer, 4);
  max_age := age_values[2]::integer;
  IF max_age < min_age THEN
    min_age := age_values[2]::integer;
    max_age := age_values[1]::integer;
  END IF;
  price := least(999999.99, coalesce(replace(substring(lesson_cost FROM '[0-9]{1,6}(?:[.,][0-9]{1,2})?'), ',', '.')::numeric, 0));
  seats := coalesce(substring(lesson_availability FROM '[0-9]{1,8}')::integer,
    CASE WHEN lower(lesson_availability) ~ 'full|sold[[:space:]]*out|πλήρ|γεμάτ|γεματ' THEN 0 ELSE 10 END);
  duration := coalesce(substring(matching_rows -> 0 ->> 'duration' FROM '[1-9][0-9]{0,2}')::integer, 60);

  SELECT string_agg(DISTINCT session, ', ' ORDER BY session)
  INTO schedule_label
  FROM (
    SELECT btrim(concat_ws(' ', nullif(row_data ->> 'day', ''), nullif(row_data ->> 'time', ''))) AS session
    FROM jsonb_array_elements(matching_rows) AS rows(row_data)
  ) AS sessions
  WHERE session <> '';

  identity_key := md5(jsonb_build_array(lower(btrim(lesson_title)), lesson_ages, lesson_cost)::text);

  RETURN QUERY
  INSERT INTO public.classes AS cls (
    store_id, schedule_key, title, description, category, instructor, age_min, age_max,
    price_eur, duration_minutes, capacity, weekly_schedule, image_url
  )
  VALUES (
    school.id, identity_key, btrim(matching_rows -> 0 ->> 'lesson'),
    coalesce(nullif(school.description, ''), btrim(lesson_title)),
    school.category, school.name, min_age, max_age, price, duration, seats,
    coalesce(schedule_label, '-'), school.image_url
  )
  ON CONFLICT (store_id, schedule_key) DO UPDATE
  SET capacity = EXCLUDED.capacity, weekly_schedule = EXCLUDED.weekly_schedule
  RETURNING cls.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_scheduled_class(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_scheduled_class(uuid, text, text, text, text) TO anon, authenticated;

COMMIT;
