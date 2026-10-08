-- wOS Decks tables. Every table starts with decks_ and has team_id. Ids, times and JSON are TEXT.
create table if not exists decks_teams (
  id text primary key,
  name text not null,
  created_at text not null
);

create table if not exists decks_people (
  id text primary key,
  team_id text not null,
  name text not null,
  email text,
  github text,
  account_sub text,
  role text not null default 'member',
  prefs text not null default '{}',
  created_at text not null,
  deactivated_at text
);
create index if not exists decks_people_team on decks_people (team_id);
create index if not exists decks_people_email on decks_people (email);

-- One row per deck: what lists and pickers need. The deck itself lives in decks_docs and decks_updates.
create table if not exists decks_decks (
  id text primary key,
  team_id text not null,
  title text not null,
  description text not null default '',
  slide_count integer not null default 0,
  cover text not null default '{}',
  search text not null default '',
  example integer not null default 0,
  created_by text,
  created_at text not null,
  updated_at text not null,
  updated_by text,
  archived_at text,
  deleted_at text
);
create index if not exists decks_decks_team on decks_decks (team_id, updated_at);

-- The deck as a Yjs document: a saved state, then the changes made since (merged into the state
-- from time to time).
create table if not exists decks_docs (
  deck_id text primary key,
  team_id text not null,
  state text not null,
  upto_id integer not null default 0,
  updated_at text not null
);

create table if not exists decks_comments (
  id text primary key,
  team_id text not null,
  deck_id text not null,
  slide_id text,
  block_id text,
  parent_id text,
  author_id text not null,
  author_name text not null,
  via text,
  body text not null,
  resolved_at text,
  resolved_by text,
  created_at text not null,
  deleted_at text
);
create index if not exists decks_comments_deck on decks_comments (deck_id, created_at);

create table if not exists decks_shares (
  id text primary key,
  team_id text not null,
  deck_id text not null,
  token text not null unique,
  kind text not null,
  created_by text,
  created_at text not null,
  revoked_at text,
  views integer not null default 0
);
create index if not exists decks_shares_deck on decks_shares (deck_id);

create table if not exists decks_files (
  id text primary key,
  team_id text not null,
  name text not null,
  type text not null,
  size integer not null,
  storage text not null,
  public integer not null default 1,
  data text,
  created_by text,
  created_at text not null
);

create table if not exists decks_approvals (
  id text primary key,
  team_id text not null,
  person_id text not null,
  requested_by text,
  tool text not null,
  input text not null,
  status text not null default 'waiting',
  result text,
  created_at text not null,
  decided_at text
);

create table if not exists decks_updates (
  id integer primary key autoincrement,
  team_id text not null,
  deck_id text not null,
  data text not null,
  by_id text,
  via text,
  created_at text not null
);
create index if not exists decks_updates_deck on decks_updates (deck_id, id);

create table if not exists decks_activity (
  id integer primary key autoincrement,
  team_id text not null,
  deck_id text,
  type text not null,
  actor_id text,
  actor_name text,
  via text,
  data text not null default '{}',
  created_at text not null
);
create index if not exists decks_activity_deck on decks_activity (deck_id, id);
