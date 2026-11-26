begin;

alter table public.classes add column if not exists monthly_packages jsonb not null default '{}'::jsonb;
alter table public.bookings add column if not exists monthly_package text
  check (monthly_package in ('once','twice','three','unlimited'));

create or replace function public.valid_monthly_packages(packages jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item record;
begin
  if jsonb_typeof(packages) <> 'object' then return false; end if;
  for item in select * from jsonb_each(packages) loop
    if item.key not in ('once','twice','three','unlimited')
       or jsonb_typeof(item.value) <> 'number' then return false; end if;
    if item.value::numeric not between 0 and 99999.99
       or item.value::numeric <> round(item.value::numeric, 2) then return false; end if;
  end loop;
  return true;
end;
$$;

alter table public.classes add constraint classes_monthly_packages_check
  check (public.valid_monthly_packages(monthly_packages));

create or replace function public.apply_monthly_booking_package()
returns trigger language plpgsql security definer set search_path = '' as $$
declare packages jsonb;
begin
  if new.kind = 'trial' then
    new.monthly_package := null;
    return new;
  end if;

  select c.monthly_packages into packages from public.classes c
    where c.id = new.class_id for share;
  if packages = '{}'::jsonb then
    if new.monthly_package is not null then raise exception 'monthly_package_unavailable'; end if;
    return new;
  end if;

  if new.monthly_package is null then raise exception 'monthly_package_required'; end if;
  if not (packages ? new.monthly_package) then raise exception 'monthly_package_unavailable'; end if;
  new.first_month_price_eur := (packages ->> new.monthly_package)::numeric;
  return new;
end;
$$;

revoke execute on function public.apply_monthly_booking_package() from public, anon, authenticated;
-- Runs after prepare_booking_request, which initializes the request price.
create trigger zz_apply_monthly_booking_package before insert on public.bookings
  for each row execute function public.apply_monthly_booking_package();

notify pgrst, 'reload schema';
commit;
