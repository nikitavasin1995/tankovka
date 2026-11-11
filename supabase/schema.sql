-- =====================================================================
-- Tankovka — база данных для Supabase
--
-- Как применить: Supabase → SQL Editor → New query → вставить ВЕСЬ файл → Run.
-- Скрипт можно запускать повторно: таблицы не пересоздаются, функции и
-- правила доступа обновляются, стартовые пивные добавляются только один раз.
--
-- Главные правила приватности:
--   • профиль видят только вы и ваши друзья;
--   • отметку «я тут пью» видят только друзья, только пока она активна
--     (не дольше 8 часов) и только если в профиле выбрано «Друзья»;
--   • менять счётчик пива и отметки можно только через функции ниже,
--     поэтому никто не может записать пиво за другого.
-- =====================================================================

-- ---------- код друга: 8 символов без похожих букв/цифр ----------
create or replace function public.gen_friend_code() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 8);
$$;

-- ---------- таблицы ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 24),
  emoji       text not null default '🍺' check (char_length(emoji) between 1 and 8),
  visibility  text not null default 'friends' check (visibility in ('friends', 'nobody')),
  friend_code text not null unique default public.gen_friend_code(),
  created_at  timestamptz not null default now()
);

create table if not exists public.friendships (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  friend_id  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table if not exists public.pubs (
  id          text primary key default ('user-' || replace(gen_random_uuid()::text, '-', '')),
  name        text not null check (char_length(name) between 1 and 60),
  address     text check (char_length(address) <= 80),
  city        text check (char_length(city) <= 40),
  brand       text check (char_length(brand) <= 40),
  lat         double precision not null check (lat between 48.5 and 51.1),   -- границы Чехии
  lng         double precision not null check (lng between 12.0 and 18.9),
  source_type text not null default 'user' check (source_type in ('public', 'user')),
  source_name text,
  source_url  text,
  added_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.pub_votes (
  pub_id     text not null references public.pubs (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  vote       text not null check (vote in ('yes', 'no')),
  updated_at timestamptz not null default now(),
  primary key (pub_id, user_id)
);

create table if not exists public.sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  pub_id     text not null references public.pubs (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);
create unique index if not exists sessions_one_active on public.sessions (user_id) where ended_at is null;
create index if not exists sessions_user_started on public.sessions (user_id, started_at desc);

create table if not exists public.drinks (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null default 'beer',
  size       numeric(3, 2) not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists drinks_session on public.drinks (session_id);

-- напитки: пиво 0,3 / 0,5 л и крепкое стопками 20 / 40 мл
-- (стопки добавлены позже — эти строки обновляют уже созданную таблицу)
alter table public.drinks add column if not exists kind text not null default 'beer';
alter table public.drinks alter column created_at set default clock_timestamp();
alter table public.drinks drop constraint if exists drinks_size_check;
alter table public.drinks drop constraint if exists drinks_kind_size;
alter table public.drinks add constraint drinks_kind_size check (
  (kind = 'beer' and size in (0.3, 0.5)) or (kind = 'shot' and size in (0.02, 0.04)));

-- ---------- помощники для правил доступа ----------
create or replace function public.is_friend(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.user_id = auth.uid() and f.friend_id = other);
$$;

-- друг делится со мной отметками (дружим и у него выбрано «Друзья»)
create or replace function public.shares_with_me(owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    join public.profiles p on p.id = f.friend_id
    where f.user_id = auth.uid() and f.friend_id = owner and p.visibility = 'friends');
$$;

-- ---------- правила доступа (RLS) ----------
alter table public.profiles    enable row level security;
alter table public.friendships enable row level security;
alter table public.pubs        enable row level security;
alter table public.pub_votes   enable row level security;
alter table public.sessions    enable row level security;
alter table public.drinks      enable row level security;

drop policy if exists "profiles: me and friends" on public.profiles;
create policy "profiles: me and friends" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_friend(id));

drop policy if exists "profiles: update me" on public.profiles;
create policy "profiles: update me" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "friendships: mine" on public.friendships;
create policy "friendships: mine" on public.friendships for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "pubs: everyone reads" on public.pubs;
create policy "pubs: everyone reads" on public.pubs for select to anon, authenticated
  using (true);

drop policy if exists "pubs: users add" on public.pubs;
create policy "pubs: users add" on public.pubs for insert to authenticated
  with check (source_type = 'user' and added_by = (select auth.uid())
              and id like 'user-%' and source_url is null);

drop policy if exists "votes: mine read" on public.pub_votes;
create policy "votes: mine read" on public.pub_votes for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "votes: mine add" on public.pub_votes;
create policy "votes: mine add" on public.pub_votes for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "votes: mine change" on public.pub_votes;
create policy "votes: mine change" on public.pub_votes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "votes: mine remove" on public.pub_votes;
create policy "votes: mine remove" on public.pub_votes for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "sessions: mine and friends live" on public.sessions;
create policy "sessions: mine and friends live" on public.sessions for select to authenticated
  using (
    user_id = (select auth.uid())
    or (ended_at is null and started_at > now() - interval '8 hours' and public.shares_with_me(user_id))
  );

-- пиво видно тому, кто видит саму отметку
drop policy if exists "drinks: follow sessions" on public.drinks;
create policy "drinks: follow sessions" on public.drinks for select to authenticated
  using (user_id = (select auth.uid())
         or exists (select 1 from public.sessions s where s.id = session_id));

-- ---------- профиль создаётся сам при регистрации ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, emoji)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), 'Друг'), 24),
    left(coalesce(nullif(new.raw_user_meta_data ->> 'emoji', ''), '🍺'), 8)
  );
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger
                 where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end $$;

-- ---------- действия приложения ----------
-- закрыть текущую отметку (пустую — удалить, просроченную — закрыть на отметке 8 часов)
create or replace function public.end_session_internal(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.sessions s
  where s.user_id = p_user and s.ended_at is null
    and not exists (select 1 from public.drinks d where d.session_id = s.id);
  update public.sessions
  set ended_at = least(now(), started_at + interval '8 hours')
  where user_id = p_user and ended_at is null;
end $$;

create or replace function public.end_session() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.end_session_internal(auth.uid());
end $$;

create or replace function public.check_in(p_pub text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me  uuid := auth.uid();
  sid uuid;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.pubs where id = p_pub) then raise exception 'pub_not_found'; end if;
  perform public.end_session_internal(me);
  insert into public.sessions (user_id, pub_id) values (me, p_pub) returning id into sid;
  return sid;
end $$;

-- p_kind: 'beer' (0,3 или 0,5 л) или 'shot' — стопка крепкого (0,02 или 0,04 л)
drop function if exists public.add_drink(numeric);  -- старая версия без p_kind
create or replace function public.add_drink(p_size numeric, p_kind text default 'beer') returns integer
language plpgsql security definer set search_path = '' as $$
declare
  me  uuid := auth.uid();
  sid uuid;
  n   integer;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if not ((p_kind = 'beer' and p_size in (0.3, 0.5)) or (p_kind = 'shot' and p_size in (0.02, 0.04))) then
    raise exception 'bad_size';
  end if;
  select id into sid from public.sessions
  where user_id = me and ended_at is null and started_at > now() - interval '8 hours';
  if sid is null then raise exception 'no_active_session'; end if;
  select count(*) into n from public.drinks where session_id = sid;
  if n >= 60 then raise exception 'too_many'; end if;
  insert into public.drinks (session_id, user_id, kind, size) values (sid, me, p_kind, p_size);
  return n + 1;
end $$;

create or replace function public.undo_drink() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from public.drinks where id = (
    select d.id from public.drinks d
    join public.sessions s on s.id = d.session_id
    where s.user_id = auth.uid() and s.ended_at is null
    order by d.created_at desc limit 1);
end $$;

create or replace function public.add_friend(p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  me    uuid := auth.uid();
  other public.profiles;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  select * into other from public.profiles p where p.friend_code = upper(trim(p_code));
  if other.id is null then raise exception 'friend_not_found'; end if;
  if other.id = me then raise exception 'self_friend'; end if;
  insert into public.friendships (user_id, friend_id)
  values (me, other.id), (other.id, me)
  on conflict do nothing;
  return json_build_object('id', other.id, 'name', other.name, 'emoji', other.emoji);
end $$;

create or replace function public.remove_friend(p_friend uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from public.friendships
  where (user_id = auth.uid() and friend_id = p_friend)
     or (user_id = p_friend and friend_id = auth.uid());
end $$;

create or replace function public.my_stats() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'beers',  count(d.id) filter (where d.kind = 'beer'),
    'liters', coalesce(sum(d.size) filter (where d.kind = 'beer'), 0),
    'shots',  count(d.id) filter (where d.kind = 'shot'),
    'pubs',   count(distinct s.pub_id) filter (where d.id is not null))
  from public.sessions s
  left join public.drinks d on d.session_id = s.id
  where s.user_id = auth.uid();
$$;

create or replace function public.pub_vote_counts() returns table (pub_id text, yes_count bigint, no_count bigint)
language sql stable security definer set search_path = '' as $$
  select v.pub_id,
         count(*) filter (where v.vote = 'yes'),
         count(*) filter (where v.vote = 'no')
  from public.pub_votes v
  group by v.pub_id;
$$;

-- удалить свой аккаунт со всеми данными
create or replace function public.delete_me() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------- права ----------
grant usage on schema public to anon, authenticated;

revoke all on public.profiles, public.friendships, public.pubs,
              public.pub_votes, public.sessions, public.drinks from anon, authenticated;
grant select on public.pubs to anon, authenticated;
grant insert on public.pubs to authenticated;
grant select on public.profiles, public.friendships, public.sessions, public.drinks to authenticated;
grant update (name, emoji, visibility) on public.profiles to authenticated;
grant select, insert, update, delete on public.pub_votes to authenticated;

revoke execute on function public.end_session_internal(uuid) from public, anon, authenticated;
revoke execute on function public.check_in(text), public.end_session(), public.add_drink(numeric, text),
  public.undo_drink(), public.add_friend(text), public.remove_friend(uuid), public.my_stats(),
  public.delete_me(), public.is_friend(uuid), public.shares_with_me(uuid) from public, anon;
grant execute on function public.check_in(text), public.end_session(), public.add_drink(numeric, text),
  public.undo_drink(), public.add_friend(text), public.remove_friend(uuid), public.my_stats(),
  public.delete_me(), public.is_friend(uuid), public.shares_with_me(uuid) to authenticated;
grant execute on function public.pub_vote_counts() to anon, authenticated;


-- ---------- стартовые пивные с танковым пивом (из открытых источников, ноябрь 2026) ----------
insert into public.pubs (id, name, address, city, brand, lat, lng, source_type, source_name, source_url) values
  ('seed-1', 'Lokál Dlouhááá', 'Dlouhá 33, Praha 1', 'Praha', 'Pilsner Urquell', 50.090696, 14.425758, 'public', 'HelloPrague 2026', 'https://www.helloprague.net/?p=2778'),
  ('seed-2', 'Lokál U Bílé kuželky', 'Míšeňská 12, Praha 1', 'Praha', 'Pilsner Urquell', 50.087733, 14.407533, 'public', 'HelloPrague 2026', 'https://www.helloprague.net/?p=2778'),
  ('seed-3', 'Lokál Hamburk', 'Sokolovská 55, Praha 8', 'Praha', 'Pilsner Urquell', 50.093141, 14.446825, 'public', 'HelloPrague 2026', 'https://www.helloprague.net/?p=2778'),
  ('seed-4', 'U Zlatého tygra', 'Husova 17, Praha 1', 'Praha', 'Pilsner Urquell', 50.085817, 14.418036, 'public', 'HelloPrague 2026', 'https://www.helloprague.net/?p=2778'),
  ('seed-5', 'U Hrocha', 'Thunovská 10, Praha 1', 'Praha', 'Pilsner Urquell', 50.089028, 14.40458, 'public', 'HelloPrague 2026', 'https://www.helloprague.net/?p=2778'),
  ('seed-6', 'U Rudolfina', 'Křižovnická 10, Praha 1', 'Praha', 'Pilsner Urquell', 50.087939, 14.415531, 'public', 'Expats.cz', 'https://expats.cz/czech-news/article/tank-beer-in-prague'),
  ('seed-7', 'U Pinkasů', 'Jungmannovo nám. 16, Praha 1', 'Praha', 'Pilsner Urquell', 50.083245, 14.42343, 'public', 'Prague Experience', 'https://www.pragueexperience.com/food-drink/czech-beer.asp'),
  ('seed-8', 'Kolkovna', 'V Kolkovně 8, Praha 1', 'Praha', 'Pilsner Urquell', 50.089943, 14.421355, 'public', 'Prague Experience', 'https://www.pragueexperience.com/food-drink/czech-beer.asp'),
  ('seed-9', 'U Vejvodů', 'Jilská 4, Praha 1', 'Praha', 'Pilsner Urquell', 50.084161, 14.418757, 'public', 'Prague Experience', 'https://www.pragueexperience.com/food-drink/czech-beer.asp'),
  ('seed-10', 'Restaurace U Sedlerů', 'Karlovo nám. 288/17, Praha', 'Praha', null, 50.077172, 14.419192, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/tag/pivo-z-tanku'),
  ('seed-11', 'Restaurace Na Paloučku', 'Petra Rezka 1091/1, Praha', 'Praha', null, 50.060733, 14.435874, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/tag/pivo-z-tanku'),
  ('seed-12', 'Krušovická chalupa', '5. května 798/62, Praha', 'Praha', 'Krušovice', 50.060475, 14.432575, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/tag/pivo-z-tanku'),
  ('seed-13', 'Brožíkovka', 'Brožíkova 2616/18, Plzeň', 'Plzeň', null, 49.732952, 13.361796, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/tag/pivo-z-tanku'),
  ('seed-15', 'U Bláhovky', 'Gorkého 54, Brno', 'Brno', 'Pilsner Urquell', 49.199192, 16.592245, 'public', 'Forbes.cz', 'https://forbes.cz/tekute-zlato-deset-mist-v-cesku-kde-vam-natoci-plzen-od-niz-nebudete-chtit-odejit/'),
  ('seed-16', 'Plzeňská pivnice Tankovna', '1. máje 532/5, Kroměříž', 'Kroměříž', 'Pilsner Urquell', 49.295941, 17.394932, 'public', 'European Bar Guide', 'https://theeuropeanbarguide.com/plzenska-pivnice-tankovna-kromeriz-%f0%9f%87%a8%f0%9f%87%bf/'),
  ('seed-17', 'Radegastovna Pirát', 'Dobrovského 1, Vyškov', 'Vyškov', 'Radegast', 49.276897, 16.999105, 'public', 'Kudy z nudy', 'https://www.kudyznudy.cz/aktivity/pivo-primo-z-tanku'),
  ('seed-18', 'Hostinec U Formana', 'Václava Jiřikovského 228/11, Ostrava', 'Ostrava', null, 49.774123, 18.252908, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/tag/pivo-z-tanku'),
  ('seed-19', 'Restaurace Radnice', 'Palackého nám. 27, Dobrovice', 'Dobrovice', null, 50.36928, 14.962233, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/tag/pivo-z-tanku'),
  ('seed-20', 'Hotel Alessandria', 'třída SNP 733/2, Hradec Králové', 'Hradec Králové', null, 50.217107, 15.851461, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/tag/pivo-z-tanku'),
  ('seed-21', 'Potrefená husa', 'Česká 141/66, České Budějovice', 'České Budějovice', 'Staropramen', 48.974387, 14.472069, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/tag/pivo-z-tanku'),
  ('seed-22', 'Velkopopovická Kozlovna', 'Ringhofferova 1, Velké Popovice', 'Velké Popovice', 'Kozel', 49.922618, 14.635996, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/tag/pivo-z-tanku'),
  ('seed-23', 'Pivovar Svijany', 'Svijany 25', 'Svijany', 'Svijany', 50.572945, 15.054295, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/tag/pivo-z-tanku'),
  ('seed-24', 'Pivovar Falkenštejn', 'Křinické nám. 7/12, Krásná Lípa', 'Krásná Lípa', 'Falkenštejn', 50.913942, 14.507621, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/tag/pivo-z-tanku'),
  ('seed-25', 'Pivovar Pod Lípou', 'Náves 20, Kyšice', 'Kyšice', null, 49.753753, 13.484587, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/tag/pivo-z-tanku'),
  ('seed-26', 'Maple restaurant', 'Jiráskova 533, Heřmanův Městec', 'Heřmanův Městec', null, 49.949785, 15.665964, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/tag/pivo-z-tanku'),
  ('seed-27', 'Potrefená husa Platnéřská', 'Platnéřská 88/9, Praha 1', 'Praha', 'Staropramen', 50.087296, 14.41572, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-28', 'Restaurace Klamovka', 'Klamovka 2051, Praha 5', 'Praha', null, 50.071516, 14.379246, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-29', 'Restaurace Nad Alejí', 'Brunclíkova 1875/17, Praha 6', 'Praha', 'Staropramen', 50.086138, 14.345015, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-30', 'La Republica', 'Na Poříčí 1041/12, Praha 1', 'Praha', 'Pilsner Urquell', 50.08918, 14.431197, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-31', 'Restaurant Na Květnici', 'Na Květnici 700/1a, Praha 4', 'Praha', null, 50.061011, 14.439325, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-32', 'Zlatý Klas', 'Plzeňská 609/9, Praha 5', 'Praha', null, 50.071578, 14.400453, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-33', 'U Bílého Lva', 'Na Bělidle 310/30, Praha 5', 'Praha', 'Staropramen', 50.071845, 14.406247, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-34', 'Radegastovna Perón', 'Stroupežnického 525/20, Praha 5', 'Praha', 'Radegast', 50.070718, 14.403114, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-35', 'Restaurace Pod Černým vrchem', 'Mahenova 282/5, Praha 5', 'Praha', 'Staropramen', 50.071284, 14.387199, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-36', 'Restaurace Ladronka', 'Plzeňská 2575/208, Praha 5', 'Praha', null, 50.070102, 14.368203, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-37', 'Pivnice U Jeníčka', 'Hostivařská 597/22, Praha 10', 'Praha', null, 50.052101, 14.528497, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-38', 'Restaurace U Mlynáře', 'Nerudova 213/18, Praha 1', 'Praha', null, 50.088671, 14.400826, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-39', 'Švejk Restaurant U Brázdů', 'U Svobodárny 1511/18, Praha 9', 'Praha', 'Pilsner Urquell', 50.106541, 14.488681, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-40', 'Meat Beer', 'Washingtonova 1568/23, Praha 1', 'Praha', 'Březňák', 50.082279, 14.432289, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-41', 'Vyšehradský Restaurant Kandelábr', 'Štětkova 1638/18, Praha 4', 'Praha', null, 50.059943, 14.430172, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-42', 'Restaurace Waldeska', 'Moskevská 860/80, Praha 10', 'Praha', 'Pilsner Urquell, Gambrinus, Kozel', 50.067396, 14.459949, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-43', 'Lokál Nad Stromovkou', 'Nad Královskou oborou 31, Praha 7', 'Praha', 'Pilsner Urquell', 50.103078, 14.418379, 'public', 'Prague.eu', 'https://prague.eu/en/objevujte/lokal-nad-stromovkou/'),
  ('seed-44', 'Červený jelen', 'Hybernská 1034/5, Praha 1', 'Praha', 'Pilsner Urquell', 50.087316, 14.430846, 'public', 'Forbes.cz', 'https://forbes.cz/cerveny-jelen-prichazi-a-plzen-cepuje-z-nejvetsiho-pivniho-tanku-na-svete/'),
  ('seed-45', 'U Medvídků', 'Na Perštýně 345/7, Praha 1', 'Praha', 'Budweiser Budvar', 50.082857, 14.418791, 'public', 'Expats.cz', 'https://expats.cz/czech-news/article/tank-beer-in-prague'),
  ('seed-46', 'U Hajcmana', 'Horní 288/67, Ostrava-Dubina', 'Ostrava', 'Radegast', 49.77913, 18.252882, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-47', 'Radegastovna Maston', 'Jiřího Herolda 1580/3, Ostrava', 'Ostrava', 'Radegast', 49.782462, 18.253769, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-48', 'Pivnice Srub', 'Aloise Gavlase 262/14a, Ostrava-Dubina', 'Ostrava', 'Radegast', 49.776973, 18.254242, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-49', 'Restaurace Tankovna Ostravar', 'Střelniční 6/2, Moravská Ostrava', 'Ostrava', 'Ostravar', 49.835336, 18.293702, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-50', 'Pivnice Racek', 'Předškolní 671/2, Ostrava-Výškovice', 'Ostrava', 'Ostravar, Radegast', 49.781323, 18.222668, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-51', 'Hostinec Na Hůrce', 'Výškovická 243/139, Ostrava-Výškovice', 'Ostrava', null, 49.781025, 18.224023, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-52', 'Restaurace Alvi', 'Nádražní 955/106, Moravská Ostrava', 'Ostrava', null, 49.845656, 18.280725, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-53', 'Kovárna Na Terase', 'Dlouhá třída 1612/95c, Havířov', 'Havířov', 'Pilsner Urquell', 49.776269, 18.453441, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-54', 'Kozlovna U Františka', 'nám. F. Křižíka 1483/5, Tábor', 'Tábor', 'Velkopopovický Kozel', 49.41291, 14.663935, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-55', 'Restaurace Panský dům', 'nám. T. G. Masaryka 320, Chotěboř', 'Chotěboř', 'Pilsner Urquell', 49.719925, 15.670972, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-56', 'Pivnice U Dolečka', 'J. E. Purkyně 493, Uherské Hradiště', 'Uherské Hradiště', null, 49.06531, 17.455448, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-57', 'Pivnice Krček', 'Stonky 561, Uherské Hradiště', 'Uherské Hradiště', null, 49.066312, 17.470299, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-58', 'Radegastovna Cheb', 'Valdštejnova 1513/70, Cheb', 'Cheb', 'Radegast', 50.070604, 12.372793, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-59', 'Pivnice U Kovárny', 'U Kovárny 909, Olomouc', 'Olomouc', 'Šerák', 49.59555, 17.227983, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-60', 'Městský pivovar Domažlice', 'Pivovarská 10, Domažlice', 'Domažlice', 'Domažlická', 49.441769, 12.926824, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-61', 'Restaurace Na Závisti', 'Palackého 125, Veltrusy', 'Veltrusy', 'Gambrinus', 50.270056, 14.328709, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-62', 'Polabinská Tankovna', 'kpt. Bartoše 454, Pardubice', 'Pardubice', 'Budweiser Budvar', 50.044188, 15.752552, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-63', 'Tatáž Pakáž', 'Železná 249/12, Liberec', 'Liberec', 'Pilsner Urquell', 50.770107, 15.056778, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-64', 'Pivovarská restaurace Belveder', 'Pivovar 168, Protivín', 'Protivín', 'Platan', 49.204604, 14.217665, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-65', 'Srdcovka Ústí', 'Velká Hradební 3122/52, Ústí nad Labem', 'Ústí nad Labem', null, 50.661539, 14.039753, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-66', 'Restaurace Pod Ledem', 'Ringhofferova 336, Velké Popovice', 'Velké Popovice', 'Pilsner Urquell', 49.925685, 14.636346, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-67', 'Panský pivovar Holešov', 'Masarykova 655/19, Holešov', 'Holešov', null, 49.331375, 17.582844, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-68', 'Nádražní pivnice Zámecká', 'Litoměřická 1001/15, Teplice', 'Teplice', 'Zlatopramen', 50.633957, 13.813786, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-69', 'Pivnice Na Štokách', 'Jihlavská 1820, Humpolec', 'Humpolec', 'Bernard', 49.539688, 15.359975, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku'),
  ('seed-70', 'Sport bar Zero', 'Tř. 1. máje 1783, Hranice', 'Hranice', 'Radegast', 49.554526, 17.735964, 'public', 'firmy.cz — pivo z tanku', 'https://www.firmy.cz/stitek/pivo-z-tanku')
on conflict (id) do nothing;
