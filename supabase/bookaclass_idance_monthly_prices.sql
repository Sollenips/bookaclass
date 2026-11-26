-- Apply after the monthly package and age-group migrations.
-- The published iDance tariffs shown in the dashboard apply to its other classes.
begin;
update public.classes as lesson
set monthly_packages = '{"kids_once":30,"kids_twice":50,"kids_three":60,"kids_unlimited":70,"adults_once":40,"adults_twice":70,"adults_three":85,"adults_four":95,"adults_unlimited":100}'::jsonb
from public.stores as school
where school.id = lesson.store_id
  and lower(btrim(school.name)) = 'idance'
  and school.address like 'Βουτζά 12,%'
  and lesson.monthly_packages = '{}'::jsonb;
commit;
