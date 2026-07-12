-- Quinta migração de A Morada: permite que Alice altere somente os valores
-- dos atributos e perícias já existentes. Não altera nem remove dados.

grant update (stat_value) on public.character_stats to anon;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'character_stats'
      and policyname = 'Alice atualiza valores da própria ficha'
  ) then
    create policy "Alice atualiza valores da própria ficha"
    on public.character_stats
    for update
    to anon
    using (
      stat_key in (
        'ver', 'aguentar', 'lembrar', 'ceder', 'criar', 'fugir',
        'fotografia', 'pintura', 'percepcao_detalhes',
        'memoria_afetiva', 'esconder_se'
      )
    )
    with check (
      stat_key in (
        'ver', 'aguentar', 'lembrar', 'ceder', 'criar', 'fugir',
        'fotografia', 'pintura', 'percepcao_detalhes',
        'memoria_afetiva', 'esconder_se'
      )
    );
  end if;
end $$;
