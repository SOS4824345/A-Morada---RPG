-- A Morada - Etapa 1: correção explícita dos privilégios automáticos.
-- Mantém o inventário disponível apenas para a chave pública usada pelo site.

revoke all on public.inventory_items from authenticated;
revoke all on public.inventory_actions from authenticated;
revoke all on public.inventory_items_alice from authenticated;
revoke all on sequence public.inventory_items_id_seq from authenticated;
revoke all on sequence public.inventory_actions_id_seq from authenticated;
