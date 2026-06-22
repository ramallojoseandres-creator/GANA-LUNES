-- Ejecutar en Supabase → SQL Editor (una sola vez)
-- Panel admin: listado de apuestas + resumen financiero de la casa

CREATE OR REPLACE FUNCTION public._gd_require_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() AND COALESCE(p.is_admin, false) = true
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
END;
$$;

-- Listado unificado: deportes (bets) + casino (casino_bets)
CREATE OR REPLACE FUNCTION public.admin_list_bets(
  p_limit integer DEFAULT 150,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  bet_id uuid,
  user_id uuid,
  username text,
  email text,
  source text,
  created_at timestamptz,
  status text,
  stake numeric,
  odds numeric,
  payout numeric,
  event_name text,
  selection text,
  bet_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._gd_require_admin();

  RETURN QUERY
  SELECT *
  FROM (
    SELECT
      b.id AS bet_id,
      b.user_id,
      COALESCE(p.username, '—') AS username,
      COALESCE(u.email::text, '—') AS email,
      'deportes'::text AS source,
      b.created_at,
      b.status::text,
      COALESCE(b.stake, 0)::numeric AS stake,
      COALESCE(b.odds, 0)::numeric AS odds,
      COALESCE(b.potential_payout, 0)::numeric AS payout,
      COALESCE(b.event_name, '—')::text AS event_name,
      COALESCE(b.selection, '—')::text AS selection,
      COALESCE(b.bet_type, '—')::text AS bet_type
    FROM bets b
    LEFT JOIN profiles p ON p.user_id = b.user_id
    LEFT JOIN auth.users u ON u.id = b.user_id

    UNION ALL

    SELECT
      c.id AS bet_id,
      c.user_id,
      COALESCE(p.username, '—') AS username,
      COALESCE(u.email::text, '—') AS email,
      'casino'::text AS source,
      c.created_at,
      c.status::text,
      COALESCE(c.stake, 0)::numeric AS stake,
      NULL::numeric AS odds,
      COALESCE(c.payout, 0)::numeric AS payout,
      COALESCE(c.game, 'Casino')::text AS event_name,
      '—'::text AS selection,
      'casino'::text AS bet_type
    FROM casino_bets c
    LEFT JOIN profiles p ON p.user_id = c.user_id
    LEFT JOIN auth.users u ON u.id = c.user_id
  ) x
  ORDER BY x.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 150), 500))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- Resumen financiero de la empresa
CREATE OR REPLACE FUNCTION public.admin_company_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jugado numeric := 0;
  v_ganado numeric := 0;
  v_perdido numeric := 0;
  v_pendiente numeric := 0;
  v_total numeric := 0;
  v_won_status text[] := ARRAY['won', 'win', 'paid', 'ganada', 'ganado'];
  v_lost_status text[] := ARRAY['lost', 'lose', 'perdida', 'perdido'];
  v_pending_status text[] := ARRAY['pending', 'open', 'active', 'pendiente', 'placed'];
BEGIN
  PERFORM public._gd_require_admin();

  SELECT
    COALESCE(SUM(stake), 0),
    COALESCE(SUM(CASE WHEN lower(status::text) = ANY (v_won_status) THEN COALESCE(potential_payout, stake * COALESCE(odds, 1), 0) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN lower(status::text) = ANY (v_lost_status) THEN stake ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN lower(status::text) = ANY (v_pending_status) OR lower(status::text) NOT IN (
      SELECT unnest(v_won_status || v_lost_status)
    ) THEN stake ELSE 0 END), 0),
    COALESCE(SUM(
      CASE
        WHEN lower(status::text) = ANY (v_lost_status) THEN stake
        WHEN lower(status::text) = ANY (v_won_status) THEN stake - COALESCE(potential_payout, stake * COALESCE(odds, 1), 0)
        ELSE 0
      END
    ), 0)
  INTO v_jugado, v_ganado, v_perdido, v_pendiente, v_total
  FROM bets;

  SELECT
    v_jugado + COALESCE(SUM(stake), 0),
    v_ganado + COALESCE(SUM(CASE WHEN lower(status::text) = ANY (v_won_status) THEN COALESCE(payout, profit + stake, stake, 0) ELSE 0 END), 0),
    v_perdido + COALESCE(SUM(CASE WHEN lower(status::text) = ANY (v_lost_status) THEN stake ELSE 0 END), 0),
    v_pendiente + COALESCE(SUM(CASE WHEN lower(status::text) = ANY (v_pending_status) OR lower(status::text) NOT IN (
      SELECT unnest(v_won_status || v_lost_status)
    ) THEN stake ELSE 0 END), 0),
    v_total + COALESCE(SUM(
      CASE
        WHEN lower(status::text) = ANY (v_lost_status) THEN stake
        WHEN lower(status::text) = ANY (v_won_status) THEN stake - COALESCE(payout, profit + stake, stake, 0)
        ELSE 0
      END
    ), 0)
  INTO v_jugado, v_ganado, v_perdido, v_pendiente, v_total
  FROM casino_bets;

  RETURN jsonb_build_object(
    'jugado', round(v_jugado, 2),
    'ganado', round(v_ganado, 2),
    'perdido', round(v_perdido, 2),
    'pendiente', round(v_pendiente, 2),
    'total', round(v_total, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_bets(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_company_stats() TO authenticated;
