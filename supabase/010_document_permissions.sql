-- A Morada - Etapa 2: privilégios mínimos e explícitos para Documentos.
-- O site ainda usa uma única chave pública; RLS e views evitam exposição acidental.

revoke all on public.documents from public, anon, authenticated;
revoke all on public.document_pages from public, anon, authenticated;
revoke all on public.document_notes from public, anon, authenticated;
revoke all on public.documents_alice from public, anon, authenticated;
revoke all on public.document_pages_alice from public, anon, authenticated;
revoke all on public.document_notes_alice from public, anon, authenticated;
revoke all on sequence public.documents_id_seq from public, anon, authenticated;
revoke all on sequence public.document_pages_id_seq from public, anon, authenticated;
revoke all on sequence public.document_notes_id_seq from public, anon, authenticated;

grant select, insert, update, delete on public.documents to anon;
grant select, insert, update, delete on public.document_pages to anon;
grant select, insert, update on public.document_notes to anon;

grant select on public.documents_alice to anon;
grant select on public.document_pages_alice to anon;
grant select on public.document_notes_alice to anon;

grant usage, select on sequence public.documents_id_seq to anon;
grant usage, select on sequence public.document_pages_id_seq to anon;
grant usage, select on sequence public.document_notes_id_seq to anon;
