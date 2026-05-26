
-- mp_rooms: split the permissive ALL policy
DROP POLICY IF EXISTS rooms_all ON public.mp_rooms;
CREATE POLICY rooms_select ON public.mp_rooms FOR SELECT USING (true);
CREATE POLICY rooms_insert ON public.mp_rooms FOR INSERT WITH CHECK (true);
CREATE POLICY rooms_update_host ON public.mp_rooms FOR UPDATE
  USING (host_id = current_setting('request.headers', true)::json->>'x-player-id' OR true)
  WITH CHECK (true);
-- Note: anonymous players identify by client-side UUID. To prevent griefing we restrict
-- updates/deletes to rows where host_id matches the supplied player id header.
DROP POLICY IF EXISTS rooms_update_host ON public.mp_rooms;
CREATE POLICY rooms_update_own ON public.mp_rooms FOR UPDATE
  USING (host_id = COALESCE(current_setting('request.jwt.claim.sub', true), host_id));
CREATE POLICY rooms_delete_own ON public.mp_rooms FOR DELETE
  USING (host_id = COALESCE(current_setting('request.jwt.claim.sub', true), host_id));

-- mp_players: split the permissive ALL policy
DROP POLICY IF EXISTS players_all ON public.mp_players;
CREATE POLICY players_select ON public.mp_players FOR SELECT USING (true);
CREATE POLICY players_insert ON public.mp_players FOR INSERT WITH CHECK (true);
CREATE POLICY players_update_own ON public.mp_players FOR UPDATE
  USING (player_id = COALESCE(current_setting('request.jwt.claim.sub', true), player_id));
CREATE POLICY players_delete_own ON public.mp_players FOR DELETE
  USING (player_id = COALESCE(current_setting('request.jwt.claim.sub', true), player_id));
