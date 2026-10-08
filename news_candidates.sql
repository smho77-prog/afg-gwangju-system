-- 기사 스크랩 '자동 후보' 저장용 표 (Supabase SQL Editor에 붙여넣고 Run)
create table if not exists news_candidates (
  fetch_date date primary key,
  items jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table news_candidates enable row level security;
create policy "news_candidates select" on news_candidates for select using (true);
create policy "news_candidates insert" on news_candidates for insert with check (true);
create policy "news_candidates update" on news_candidates for update using (true) with check (true);
