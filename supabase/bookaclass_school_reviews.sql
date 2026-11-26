begin;
create table public.school_review_invites (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at timestamptz
);
create table public.school_reviews (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  author_name text not null,
  rating integer not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 600),
  created_at timestamptz not null default now(),
  hidden boolean not null default false
);
create index school_reviews_store_idx on public.school_reviews(store_id, created_at desc);
alter table public.school_review_invites enable row level security;
alter table public.school_reviews enable row level security;
revoke all on public.school_review_invites, public.school_reviews from public, anon, authenticated;
grant select on public.school_reviews to anon, authenticated;
grant update(hidden) on public.school_reviews to authenticated;
create policy review_public_read on public.school_reviews for select to anon, authenticated
  using (not hidden and exists (select 1 from public.stores s where s.id=store_id and s.published_at is not null));
create policy review_admin_read on public.school_reviews for select to authenticated using(public.is_admin());
create policy review_admin_update on public.school_reviews for update to authenticated using(public.is_admin()) with check(public.is_admin());

create function public.issue_school_review_invite(target_booking uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare code uuid:=gen_random_uuid();
begin
  if not coalesce(public.is_admin(),false) then raise exception 'forbidden'; end if;
  perform 1 from public.bookings b join public.stores s on s.id=b.store_id
    where b.id=target_booking and b.status in ('approved','confirmed') and s.published_at is not null
      and (b.kind='enrollment' or b.preferred_date + b.preferred_time <= now() at time zone 'Europe/Athens')
    for update of b;
  if not found then raise exception 'review_ineligible'; end if;
  insert into public.school_review_invites(booking_id,token_hash,expires_at)
  values(target_booking,sha256(convert_to(code::text,'UTF8')),now()+interval '30 days')
  on conflict (booking_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at
    where school_review_invites.used_at is null;
  if not found then raise exception 'review_already_submitted'; end if;
  return code;
end $$;

create function public.submit_school_review(invite uuid, stars integer, review_comment text)
returns void language plpgsql security definer set search_path='' as $$
declare reservation public.bookings%rowtype;
  reservation_id uuid;
begin
  if stars is null or stars not between 1 and 5 or char_length(review_comment)>600 then
    raise exception 'review_invalid';
  end if;
  update public.school_review_invites i set used_at=now()
    where i.token_hash=sha256(convert_to(invite::text,'UTF8')) and i.used_at is null and i.expires_at>now()
    returning i.booking_id into reservation_id;
  select * into reservation from public.bookings where id=reservation_id;
  if not found or reservation.status not in ('approved','confirmed') or
    not exists(select 1 from public.stores s where s.id=reservation.store_id and s.published_at is not null)
    then raise exception 'review_invite_unavailable'; end if;
  insert into public.school_reviews(store_id,author_name,rating,comment)
    values(reservation.store_id,left(split_part(btrim(reservation.booker_name),' ',1),60),stars,nullif(btrim(review_comment),''));
end $$;

revoke all on function public.issue_school_review_invite(uuid), public.submit_school_review(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.issue_school_review_invite(uuid) to authenticated;
grant execute on function public.submit_school_review(uuid,integer,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
