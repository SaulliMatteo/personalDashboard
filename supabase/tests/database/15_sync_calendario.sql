-- Sync del Calendario: i tipi nuovi si scrivono e si rileggono, quelli sconosciuti restano rifiutati.
begin;
\ir _aiuti.psql
select * from no_plan();

select pg_temp.utente('anna');
select pg_temp.entra('anna');
select public.touch_device('aaaaaaaa-0000-4000-8000-000000000001', 'windows');

select is(public.sync_push('aaaaaaaa-0000-4000-8000-000000000001', $$[
  {"kind": "calendar_category", "uid": "c1111111-1111-4111-8111-111111111111", "changed_at": 1000, "deleted": false,
   "data": {"name": "Università", "color": "#5B8DEF", "position": 0, "created_at": 1000}},
  {"kind": "calendar_property", "uid": "c2222222-2222-4222-8222-222222222222", "changed_at": 1000, "deleted": false,
   "data": {"uid": "p1", "name": "Aula", "type": "text", "options": "[]", "position": 0}},
  {"kind": "calendar_event", "uid": "c3333333-3333-4333-8333-333333333333", "changed_at": 1000, "deleted": false,
   "data": {"kind": "reminder", "title": "Medicina", "start_at": 5000, "end_at": 5000}},
  {"kind": "calendar_note", "uid": "c4444444-4444-4444-8444-444444444444", "changed_at": 1000, "deleted": false,
   "data": {"note_id": null, "day": "2026-11-17", "event_id": null, "created_at": 1000}}
]$$::jsonb), '[]'::jsonb, 'scrive i quattro tipi del Calendario');
select is((select count(*)::int from public.sync_records where kind like 'calendar_%'), 4, 'li rilegge');

select throws_ok($$select public.sync_push('aaaaaaaa-0000-4000-8000-000000000001',
  '[{"kind": "calendario", "uid": "x", "changed_at": 1000, "deleted": false, "data": {}}]'::jsonb)$$,
  '23514', null, 'un tipo sconosciuto resta rifiutato');
select pg_temp.esci();

select * from finish();
rollback;
