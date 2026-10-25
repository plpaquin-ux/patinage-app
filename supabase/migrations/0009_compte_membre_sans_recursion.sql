-- patinage_compte_membre_sans_recursion (appliquée le 2026-10-25)
--
-- La politique compte_membre_manage interrogeait compte_membre dans sa propre clause USING,
-- ce qui déclenchait « infinite recursion detected in policy for relation compte_membre »
-- (erreur 500 sur GET /compte_membre). L'app ne pouvait plus lire la liste des comptes de
-- l'usager, et donc jamais détecter un compte_id périmé en localStorage (incident du 24 oct.).
-- Correctif : même approche que les autres politiques, via une fonction security definer.

create or replace function patinage.fn_mes_comptes_proprietaire()
returns setof uuid
language sql stable security definer
set search_path to 'patinage', 'public'
as $$
  select compte_id from compte_membre
  where user_id = auth.uid() and role = 'proprietaire';
$$;

drop policy if exists compte_membre_manage on patinage.compte_membre;
create policy compte_membre_manage on patinage.compte_membre
  for all to authenticated
  using (compte_id in (select patinage.fn_mes_comptes_proprietaire()))
  with check (compte_id in (select patinage.fn_mes_comptes_proprietaire()));
