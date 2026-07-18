-- A Morada - Etapa 3: privilégios mínimos e explícitos para Anotações.
-- Alice e Mestre ainda compartilham a chave pública; a interface do Mestre é somente leitura.

revoke all on public.player_notes from public, anon, authenticated;
revoke all on sequence public.player_notes_id_seq from public, anon, authenticated;
revoke execute on function public.set_player_notes_updated_at() from public, anon, authenticated;

grant select, insert, update, delete on public.player_notes to anon;
grant usage, select on sequence public.player_notes_id_seq to anon;
