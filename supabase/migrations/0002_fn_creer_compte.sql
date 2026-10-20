-- Création atomique d'un compte : compte + membre propriétaire + amorçage.
-- Évite l'échec RLS sur le RETURNING de l'insert (le trigger after insert n'a pas encore tourné).
create or replace function patinage.fn_creer_compte(p_nom text)
returns uuid
language plpgsql
security definer
set search_path = patinage, public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  insert into compte (nom, created_by) values (coalesce(nullif(trim(p_nom), ''), 'Mon compte'), auth.uid())
  returning id into v_id;
  insert into compte_membre (compte_id, user_id, role) values (v_id, auth.uid(), 'proprietaire')
  on conflict do nothing;
  perform fn_amorcer_compte(v_id);
  return v_id;
end $$;

grant execute on function patinage.fn_creer_compte(text) to authenticated;
revoke execute on function patinage.fn_creer_compte(text) from anon;
notify pgrst, 'reload schema';
