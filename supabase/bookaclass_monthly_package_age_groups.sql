begin;
alter table public.bookings drop constraint bookings_monthly_package_check;
alter table public.bookings add constraint bookings_monthly_package_check
  check (monthly_package ~ '^((kids|adults)_)?(once|twice|three|four|unlimited)$');
create or replace function public.valid_monthly_packages(packages jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare item record;
begin
 if jsonb_typeof(packages) <> 'object' then return false; end if;
 for item in select * from jsonb_each(packages) loop
  if item.key !~ '^((kids|adults)_)?(once|twice|three|four|unlimited)$' or jsonb_typeof(item.value)<>'number' then return false; end if;
  if item.value::numeric not between 0 and 99999.99 or item.value::numeric <> round(item.value::numeric,2) then return false; end if;
 end loop;
 return true;
end;
$$;
create or replace function public.apply_monthly_booking_package()
returns trigger language plpgsql security definer set search_path='' as $$
declare packages jsonb;
declare age_prefix text;
begin
 if new.kind='trial' then new.monthly_package:=null; return new; end if;
 select c.monthly_packages into packages from public.classes c where c.id=new.class_id for share;
 if packages='{}'::jsonb then
  if new.monthly_package is not null then raise exception 'monthly_package_unavailable'; end if;
  return new;
 end if;
 if new.monthly_package is null then raise exception 'monthly_package_required'; end if;
 age_prefix:=case when new.participant_age<18 then 'kids_' else 'adults_' end;
 if not (packages ? new.monthly_package) or
    (case when exists(select 1 from jsonb_object_keys(packages) as p(key) where starts_with(p.key,age_prefix))
      then not starts_with(new.monthly_package,age_prefix)
      else strpos(new.monthly_package,'_')>0 end) then
  raise exception 'monthly_package_unavailable';
 end if;
 new.first_month_price_eur:=(packages ->> new.monthly_package)::numeric;
 return new;
end;
$$;
commit;
