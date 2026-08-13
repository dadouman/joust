# 🐛 Fix : détection de la perte au temps quand un joueur n'a pas cliqué « Prêt »

## Résumé

Correction du bug où la fin de partie pour **perte au temps (flag)** n'était jamais déclenchée côté serveur quand un joueur n'avait pas cliqué « Prêt » et que la partie démarrait via le **fallback 60 secondes**.

**Partie concernée :** `a114a055-370f-4d7e-92c1-47829b95f5ef` — Dnxs (black) affiché « Temps écoulé » côté client, mais la partie restée bloquée en `status=playing`, `result=NULL`.

## Cause racine

Dans `src/lib/games/chess/adapter.ts`, la détection de flag dans `onTick` exigeait **les deux timestamps ready** :

```ts
if (match.status === "playing" && match.lastMoveAt && match.readyWhite && match.readyBlack) {
```

Or `advanceAlarm` (fallback 60 s) passe le match en `playing` **sans** que `readyBlack` / `readyWhite` soient remplis. → La garde n'était jamais vraie → le serveur ne vérifiait jamais l'écoulement du temps.

## Modifications

### 1. `src/lib/games/chess/adapter.ts` — garde `onTick` corrigée
La condition vérifie désormais que **les horloges ont été initialisées** (`onGameStart` a posé `clockWhiteSeconds` / `clockBlackSeconds` / `lastMoveAt`), ce qui est l'intention réelle de la garde :

```ts
const clocksInitialized = match.clockWhiteSeconds > 0 || match.clockBlackSeconds > 0;
if (match.status === "playing" && match.lastMoveAt && clocksInitialized) {
```

✅ La détection fonctionne même si un joueur n'a jamais cliqué « Prêt ».

### 2. `src/app/api/matches/[id]/tick/route.ts` — propagation de la fin de partie
Quand le tick détecte `playing → completed`, la route broadcast la fin de partie (Supabase Realtime / SSE) et envoie une notification push (`⏱️ Temps écoulé !`) — identique aux routes PATCH/moves.

### 3. Refactorisation jeu-agnostique (incluse)
Le correctif vit dans la nouvelle abstraction `src/lib/games/` (adapter chess, alarm.ts) qui découple la machine d'état du jeu. Ce travail était en cours et porte le correctif.

### 4. Correctif des notifications push
Le service worker (`public/sw.js`) référençait `/manifest.webmanifest` et `/icons/icon-512.png` qui **n'existaient pas** dans `public/` → `cache.addAll(SHELL)` échouait → l'installation du service worker échouait → les notifications n'étaient jamais reçues.

Fichiers ajoutés :
- `public/manifest.webmanifest` (manifest PWA)
- `public/icons/icon-192.png` et `public/icons/icon-512.png` (générés depuis `public/icon.svg`)

### 5. Outils de test des notifications
- **Bouton UI** : une icône `BellRing` apparaît dans le header à côté de la cloche quand on est abonné → envoie une notification de test au duel.
- **CLI** : `npm run push:test <matchId> ["Titre"] ["Message"]` (`scripts/push-test.ts`)
- **API** : `POST /api/push/test` (amélioré : titre + message personnalisables)

## Fichiers modifiés

| Fichier | Type |
|---|---|
| `src/lib/games/chess/adapter.ts` | Nouveau (correctif onTick) |
| `src/app/api/matches/[id]/tick/route.ts` | Modifié (broadcast + push timeout) |
| `src/lib/alarm.ts`, `src/lib/games/` | Nouveaux (refactorisation) |
| `src/app/api/matches/[id]/moves/route.ts`, `[id]/route.ts`, `matches/route.ts` | Modifiés |
| `src/db/schema.ts`, `src/lib/result.ts`, `src/components/rendezvous-app.tsx` | Modifiés |
| `public/manifest.webmanifest`, `public/icons/` | Nouveaux (PWA / notifications) |
| `src/app/api/push/test/route.ts` | Modifié (titre/message personnalisables) |
| `scripts/push-test.ts`, `package.json` | Nouveaux (CLI push:test) |
| `docs/PR-fix-chess-timeout.md` | Nouveau (cette doc) |

## Vérifications effectuées

- [x] `npx tsc --noEmit` — **aucune erreur**
- [x] Tests manuels de la logique : partie avec `ready_black = NULL`, horloges initialisées → le tick déclenche `persistChessResult(match, "timeout", winner)`
- [x] `.env` et `.vapid.json` correctement ignorés (aucun secret committé)

## 🔔 Tester les notifications push

### 1. Bouton dans l'app
Une cloche avec un anneau (`BellRing`) apparaît dans le header **à côté de la cloche de notifications quand tu es abonné** au duel. Clique dessus → envoie une notification de test à tous les appareils abonnés du match.

### 2. Ligne de commande (local ou Vercel)
```bash
# Depuis la racine du projet (nécessite DATABASE_URL + VAPID dans .env)
npm run push:test <matchId> ["Titre"] ["Message"]

# Exemple
npm run push:test a114a055-370f-4d7e-92c1-47829b95f5ef
npm run push:test a114a055-370f-4d7e-92c1-47829b95f5ef "🔔 Test" "Notifications OK !"
```

### 3. API REST (Vercel / Postman / curl)
```bash
curl -X POST https://<ton-domaine>/api/push/test \
  -H "Content-Type: application/json" \
  -d '{"matchId": "a114a055-370f-4d7e-92c1-47829b95f5ef", "title": "🔔 Test", "body": "Notifications OK !"}'
```

### 4. Vérification BDD — les abonnements existent-ils ?
```sql
-- Un abonné doit exister pour ce match
SELECT * FROM push_subscriptions WHERE match_id = 'a114a055-370f-4d7e-92c1-47829b95f5ef';
-- Si aucune ligne : personne n'a cliqué « Activer » dans l'app.
```

> ⚠️ **Important iOS 16.4+** : les notifications ne fonctionnent que si l'app est **installée sur l'écran d'accueil** et ouverte depuis cette icône (pas Safari classique).

## 🔧 PLAN D'ACTION DE MISE EN PRODUCTION (après merge)

> ⚠️ À exécuter **après validation et merge** du PR vers `main`.

### Étape 1 — Tests de non-régression (avant déploiement)

1. **Lancer une joust en local** avec `npm run dev` :
   - Créer une joust bullet, inviter un ami.
   - **Scénario A (fallback) :** à l'heure H, seul le créateur clique « Prêt ». L'adversaire ne clique pas. → Vérifier qu'après 60 s la partie démarre, et qu'après 60 s de temps bullet, le flag est détecté : `status=completed`, `result=timeout`, `winner_name` correct, `ended_at` rempli.
   - **Scénario B (ready normal) :** les deux cliquent « Prêt » → les horloges démarrent, le flag fonctionne toujours.
   - **Scénario C (move sans timeout) :** jouer un coup normal → l'horloge reste correcte, pas de fin de partie intempestive.

2. **Vérifier le typecheck :** `npx tsc --noEmit`

3. **CI :** s'assurer que la pipeline (si configurée) passe sur le PR.

4. **Tester les notifications :** suivre la section « 🔔 Tester les notifications push » ci-dessus.

### Étape 2 — Migration / réparation des parties bloquées

Les parties **déjà bloquées** en `status=playing` avec un flag dépassé seront clôturées automatiquement au premier `/tick` après déploiement. Pour nettoyer **immédiatement** la base :

```sql
-- Marquer comme terminées les parties en cours dont le temps est écoulé
UPDATE matches
SET status = 'completed',
    result = 'timeout',
    winner_name = CASE
      -- Le joueur à jouer a dépassé son temps → l'adversaire gagne
      WHEN (clock_white_seconds <= 0 AND last_fen IS NOT NULL AND last_fen LIKE '% w %') THEN black_player
      WHEN (clock_black_seconds <= 0 AND last_fen IS NOT NULL AND last_fen LIKE '% b %') THEN white_player
      ELSE winner_name
    END,
    ended_at = COALESCE(ended_at, NOW()),
    updated_at = NOW()
WHERE status = 'playing'
  AND last_move_at IS NOT NULL
  AND (
    (clock_white_seconds <= 0 AND last_fen IS NOT NULL AND last_fen LIKE '% w %')
    OR
    (clock_black_seconds <= 0 AND last_fen IS NOT NULL AND last_fen LIKE '% b %')
  );
```

> ⚠️ **Note :** la colonne `winner_name` est appliquée en fonction du camp à jouer dans le FEN (`w` / `b`). Tester la requête sur un environnement de staging d'abord.

### Étape 3 — Déploiement

1. **Merge** du PR vers `main`.
2. **Déployer** sur l'environnement cible (Vercel / Neon) :
   - `git checkout main && git pull`
   - Déploiement automatique si connecté à GitHub, sinon `vercel` ou la commande habituelle.
3. **Vérifier après déploiement :**
   - Ouvrir la partie `a114a055-370f-4d7e-92c1-47829b95f5ef` → elle doit être `completed` avec `result=timeout`, `winner_name=Jocelyn`.
   - Lancer 2 parties de test bullet pour confirmer le flag.

### Étape 4 — Surveillance post-déploiement

- Surveiller les logs serveur pour les erreurs `persistChessResult` / `onTick`.
- Vérifier qu'aucune partie ne reste bloquée en `status=playing` avec `last_move_at` il y a plus de 10 min :
  ```sql
  SELECT id, status, clock_white_seconds, clock_black_seconds, last_move_at
  FROM matches
  WHERE status = 'playing'
    AND last_move_at < NOW() - INTERVAL '10 minutes';
  ```

### Étape 5 — Rollback (si anomalie)

- **Rollback code :** `git revert <sha-du-merge>` puis redéployer.
- **Rollback données :** restaurer le statut des parties concernées :
  ```sql
  UPDATE matches SET status = 'playing', result = NULL, winner_name = NULL, ended_at = NULL
  WHERE ended_at >= <heure-du-déploiement> AND result = 'timeout';
  ```

---

**Branch :** `fix/chess-clock-timeout-detection` → PR vers `main`