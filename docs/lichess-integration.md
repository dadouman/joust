# Intégration Lichess — Joust

Version : 1.0 (août 2026)
Statut : POC validé — intégration backend en cours

## 1. Endpoints Lichess réellement utilisés

Vérifiés par appels HTTP directs le 17/08/2026.

| Endpoint | Méthode | Auth | Usage |
|---|---|---|---|
| /api/challenge/{username} | POST | Bearer blanc | Créer un défi |
| /api/challenge/{id}/accept | POST | Bearer noir | Accepter |
| /api/board/game/stream/{id} | GET SSE | Bearer | Temps réel |
| /api/board/game/{id}/move/{uci} | POST | Bearer | Coup UCI |
| /api/board/game/{id}/resign | POST | Bearer | Abandon |
| /api/board/game/{id}/abort | POST | Bearer | Annulation |
| /api/game/{id}?pgnInJson=true | GET | public | Export |
| /api/user/{username} | GET | public | Vérif compte |
| /api/account | GET | Bearer | Valider token |
| /api/token | POST | Basic | OAuth échange |
| /api/token/revoke | POST | Bearer | Révoquer |

## 2. Scopes OAuth nécessaires

Phase POC invité (tokens de test dans .env) :
- challenge:write — créer/accepter les défis
- board:play — jouer via Board API et streamer

Phase ultérieure (OAuth utilisateur) : mêmes scopes, liés à un compte Joust.

## 3. Flux exact d'une partie

1. Les deux joueurs Joust sont prêts (flow existant).
2. onGameStart crée le défi : POST /api/challenge/{blackUsername}.
3. Le backend (token noir) accepte : POST /api/challenge/{id}/accept.
4. Lichess renvoie le gameId → stocké dans matches.gameState.lichessGameId.
5. Notre backend connecte deux streams GET /api/board/game/stream/{id}.
6. Chaque gameState met à jour notre base puis propage via broadcastMatchChange.
7. À la fin, persistChessResult avec le résultat officiel Lichess + pgn.

## 4. Flux temps réel

- Autorité : Lichess (SSE officiel board/game/stream).
- Notre backend maintient les connexions SSE (aucun token au navigateur).
- Propagation au frontend : notre SSE existant ou Supabase Realtime.
- Reconnexion : backoff exponentiel (1s, 2s, 4s) + relecture gameFull.

## 5. Modèle de données local

- matches.rated (boolean, défaut false) — option cachée de la joust.
- matches.gameState.lichessGameId — id de la partie Lichess.
- matches.gameState.lichessStatus — dernier statut Lichess.
- Phase ultérieure : users.lichess_username + token chiffré AES-256-GCM.

## 6. Gestion des erreurs

- 401 : token expiré → reconnecter.
- 403 : scopes insuffisants.
- 404 : partie/challenge inexistant → nettoyer.
- 429 : rate limit → retry avec Retry-After.
- Logs jamais les tokens.

## 7. Stratégie de reconnexion

- Reconnexion auto avec backoff exponentiel.
- À la reconnexion : gameFull puis dernier gameState → resynchronisation.
- Partie finie pendant déconnexion : GET /api/game/{id} pour le résultat.

## 8. Limites API

- Tokens personnels : pas de rate limit explicite, 429 possible.
- 1 connexion stream par partie et par joueur, pas de polling.

## 9. Dépendances

Aucune : fetch natif, node:crypto (phase OAuth), parsing SSE maison.

## 10. Risques techniques

- Deux streams par partie : coût serveur, pas de concurrence d'écriture.
- Token de test partagé : conflit possible en parties simultanées.
- Timeout Lichess : outoftime enregistré automatiquement dans notre base.
- Fermeture app en partie : le stream backend continue.
- wtime=0 : fin de partie (pas un bug d'horloge).
