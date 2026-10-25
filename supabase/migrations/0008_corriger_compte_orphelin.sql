-- patinage_corriger_compte_orphelin (appliquée le 2026-10-24, en urgence pendant une compétition)
--
-- Contexte : l'app installée sur l'écran d'accueil gardait dans localStorage un compte_id
-- d'un compte supprimé le 21 oct. Toutes les écritures étaient refusées par le RLS
-- (« new row violates row-level security policy ») et la file de synchronisation jetait
-- les éléments après 5 tentatives. Ce trigger est un FILET DE SÉCURITÉ : si une ligne arrive
-- avec un compte_id qui n'appartient pas à l'usager connecté (ou null), on le remplace par
-- son compte valide le plus récent au lieu de refuser l'écriture.
-- La cause racine (politique récursive sur compte_membre) est corrigée par 0009.

create or replace function patinage.fn_corriger_compte()
returns trigger
language plpgsql
security definer
set search_path to 'patinage', 'public'
as $$
declare
  v_compte uuid;
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.compte_id is null
     or not exists (select 1 from compte_membre m
                    where m.compte_id = new.compte_id
                      and m.user_id = auth.uid()
                      and m.role in ('proprietaire','editeur')) then
    select m.compte_id into v_compte
    from compte_membre m
    join compte c on c.id = m.compte_id
    where m.user_id = auth.uid()
      and m.role in ('proprietaire','editeur')
      and c.deleted_at is null
    order by c.created_at desc
    limit 1;
    if v_compte is not null then
      new.compte_id := v_compte;
    end if;
  end if;
  return new;
end;
$$;

-- Trigger BEFORE INSERT OR UPDATE sur toutes les tables du schéma qui portent un compte_id
-- (sauf compte_membre). Idempotent.
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'compte_id' and not a.attisdropped
    where n.nspname = 'patinage' and c.relkind = 'r'
      and c.relname <> 'compte_membre'
      and not exists (select 1 from pg_trigger tg where tg.tgrelid = c.oid and tg.tgname = 'trg_corriger_compte')
  loop
    execute format('create trigger trg_corriger_compte before insert or update on patinage.%I
                    for each row execute function patinage.fn_corriger_compte()', t.relname);
  end loop;
end $$;
