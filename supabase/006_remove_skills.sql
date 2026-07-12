-- Sexta migração de A Morada: remove apenas as cinco perícias descontinuadas
-- e impede novas solicitações de teste que não usem um atributo.

do $$
declare
  authorized_skill_count integer;
  unexpected_skill_count integer;
begin
  select count(*) into authorized_skill_count
  from public.character_stats
  where stat_type = 'skill'
    and stat_key in (
      'fotografia',
      'pintura',
      'percepcao_detalhes',
      'memoria_afetiva',
      'esconder_se'
    );

  select count(*) into unexpected_skill_count
  from public.character_stats
  where stat_type = 'skill'
    and stat_key not in (
      'fotografia',
      'pintura',
      'percepcao_detalhes',
      'memoria_afetiva',
      'esconder_se'
    );

  if authorized_skill_count <> 5 or unexpected_skill_count <> 0 then
    raise exception 'Remoção cancelada: o conjunto de perícias não corresponde às cinco chaves autorizadas.';
  end if;

  delete from public.character_stats
  where stat_type = 'skill'
    and stat_key in (
      'fotografia',
      'pintura',
      'percepcao_detalhes',
      'memoria_afetiva',
      'esconder_se'
    );
end $$;

alter policy "Alice atualiza valores da própria ficha"
on public.character_stats
using (
  stat_type = 'attribute'
  and stat_key in ('ver', 'aguentar', 'lembrar', 'ceder', 'criar', 'fugir')
)
with check (
  stat_type = 'attribute'
  and stat_key in ('ver', 'aguentar', 'lembrar', 'ceder', 'criar', 'fugir')
);

create or replace function public.ensure_new_dice_request_uses_attribute()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.stat_type <> 'attribute' then
    raise exception 'Novas solicitações de teste devem usar um atributo.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'dice_requests_attribute_only_on_insert'
      and tgrelid = 'public.dice_requests'::regclass
      and not tgisinternal
  ) then
    create trigger dice_requests_attribute_only_on_insert
    before insert on public.dice_requests
    for each row
    execute function public.ensure_new_dice_request_uses_attribute();
  end if;
end $$;
