# Overview

BattleSnails is intentionally small: one flat arena, one duel camera, and either one bot or one second localhost player.

You always control the blue snail locally. In single-player, the opponent is a bot. In LAN multiplayer, a second browser client controls the opponent through an authoritative server running on the host machine.

The current version is focused on a stable duel core rather than feature breadth. The browser client renders and captures input, while a shared simulation core drives both the local bot duel and the localhost PvP server.
