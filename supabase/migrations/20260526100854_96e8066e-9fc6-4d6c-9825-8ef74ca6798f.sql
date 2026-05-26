
-- ============ mp_rooms ============
DROP POLICY IF EXISTS rooms_select ON public.mp_rooms;
DROP POLICY IF EXISTS rooms_insert ON public.mp_rooms;
DROP POLICY IF EXISTS rooms_update_own ON public.mp_rooms;
DROP POLICY IF EXISTS rooms_delete_own ON public.mp_rooms;

CREATE POLICY rooms_select ON public.mp_rooms
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY rooms_insert_authenticated ON public.mp_rooms
  FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid()::text);

CREATE POLICY rooms_update_host ON public.mp_rooms
  FOR UPDATE TO authenticated
  USING (host_id = auth.uid()::text)
  WITH CHECK (host_id = auth.uid()::text);

CREATE POLICY rooms_delete_host ON public.mp_rooms
  FOR DELETE TO authenticated
  USING (host_id = auth.uid()::text);

-- ============ mp_players ============
DROP POLICY IF EXISTS players_select ON public.mp_players;
DROP POLICY IF EXISTS players_insert ON public.mp_players;
DROP POLICY IF EXISTS players_update_own ON public.mp_players;
DROP POLICY IF EXISTS players_delete_own ON public.mp_players;

CREATE POLICY players_select ON public.mp_players
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY players_insert_self ON public.mp_players
  FOR INSERT TO authenticated
  WITH CHECK (player_id = auth.uid()::text);

CREATE POLICY players_update_self ON public.mp_players
  FOR UPDATE TO authenticated
  USING (player_id = auth.uid()::text)
  WITH CHECK (player_id = auth.uid()::text);

CREATE POLICY players_delete_self ON public.mp_players
  FOR DELETE TO authenticated
  USING (player_id = auth.uid()::text);

-- ============ world_scores ============
-- Remove direct client INSERT. Server fn uses service role to write.
DROP POLICY IF EXISTS scores_insert_own ON public.world_scores;

-- Add restrictive policies to explicitly deny UPDATE and DELETE for all clients.
CREATE POLICY scores_no_update ON public.world_scores
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE POLICY scores_no_delete ON public.world_scores
  AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (false);
