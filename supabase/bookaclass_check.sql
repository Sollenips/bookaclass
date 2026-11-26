/*
  BookaClass - READ-ONLY health check (changes nothing).
  Paste in Supabase SQL Editor, press Run, and read the "result" column.
  Every line should say OK. Send me the lines that say MISSING.
*/
SELECT check_name, result FROM (
  SELECT 1 AS n, 'Admin account registered (app_admins)' AS check_name,
    CASE WHEN EXISTS (SELECT 1 FROM public.app_admins) THEN 'OK' ELSE 'MISSING' END AS result
  UNION ALL SELECT 2, 'Admin is YOUR login email',
    CASE WHEN EXISTS (SELECT 1 FROM public.app_admins a JOIN auth.users u ON u.id = a.user_id
                      WHERE lower(u.email) = lower('nikoskarado@gmail.com')) THEN 'OK' ELSE 'MISSING' END
  UNION ALL SELECT 3, 'Function is_admin()',
    CASE WHEN to_regprocedure('public.is_admin()') IS NOT NULL THEN 'OK' ELSE 'MISSING' END
  UNION ALL SELECT 4, 'Policy: admin can add schools',
    CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stores' AND policyname='admin_insert_stores') THEN 'OK' ELSE 'MISSING' END
  UNION ALL SELECT 5, 'Policy: admin can add classes',
    CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='classes' AND policyname='admin_insert_classes') THEN 'OK' ELSE 'MISSING' END
  UNION ALL SELECT 6, 'Photo bucket "studio-images" exists and is public',
    CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id='studio-images' AND public) THEN 'OK' ELSE 'MISSING' END
  UNION ALL SELECT 7, 'Policy: photo upload',
    CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='public_upload_studio_images') THEN 'OK' ELSE 'MISSING' END
  UNION ALL SELECT 8, 'Schools table has all columns',
    CASE WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='stores'
               AND column_name IN ('photo_url_1','photo_url_2','school_manager','disability_access','accessibility_info',
                                   'rate_info','weekly_schedule','latitude','longitude','geocoded_at','image_url')) = 11
         THEN 'OK' ELSE 'MISSING' END
  UNION ALL SELECT 9, 'Trial times table (class_slots)',
    CASE WHEN to_regclass('public.class_slots') IS NOT NULL THEN 'OK' ELSE 'MISSING (run bookaclass_free_trial_enrollment.sql)' END
  UNION ALL SELECT 10, 'Requests columns on bookings (kind, preferred_time)',
    CASE WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings'
               AND column_name IN ('kind','preferred_time','first_month_price_eur')) = 3
         THEN 'OK' ELSE 'MISSING (run bookaclass_free_trial_enrollment.sql)' END
) c ORDER BY n;
