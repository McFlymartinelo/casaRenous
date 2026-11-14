# CasaRenous

Carnet de chantier privé de la maison **Sévin–Renous** : tableau de bord « La
Piazza », visionneuse 3D, rétroplanning jusqu'en décembre 2028, coffre-fort
documentaire, journal photo hors-ligne, réserves de livraison, notifications
push VAPID et suivi budgétaire CCMI.

Stack : **React 19 + Vite + Aura**, **Express + Drizzle + PostgreSQL 17**,
**Docker Compose**, cible **Oracle Cloud Infrastructure (Ampere A1, 2 OCPU /
12 Go)**.

- Production : `https://casarenous.martylab.fr`
- PWA installable, offline-first
- Accès privé : rôles `admin` et `invites`, OTP obligatoire
- Inscription **sur invitation uniquement** : un admin crée un code nominatif, l'invité valide son email par OTP

---

## 1. Ce que contient le dépôt

```text
casaRenous/
├─ apps/
│  ├─ backend/              API Express, Drizzle, auth OTP, uploads, push
│  └─ portal/               PWA React sous Aura, nginx, 3D, offline
├─ packages/shared/         source unique des schémas Zod et des types
├─ scripts/                 invariants Aura, génération
├─ compose.yaml             db + backend + portal + backup
├─ certs/                   certificats TLS (non versionnés)
└─ .env.example
```

### Une seule app web, responsive

CasaRenous est une **application web classique** accessible dans n'importe quel
navigateur. La PWA est une couche optionnelle (installation, hors-ligne, push),
pas une application native séparée.

- **Desktop ≥ 900 px** : sidebar de navigation à 5 sections, contenu large
  jusqu'à 1 040 px, grilles 3 colonnes, tab bar masquée.
- **Tablette 768–899 px** : cadre élargi à 760 px, bottom tabs.
- **Mobile < 768 px** : plein écran, hauteur `100dvh`, scroll interne et
  bottom tabs toujours visibles (pas de scroll de page qui emporte la barre),
  safe areas, cibles ≥ 44 px.

Si un jour une présence App Store / Play Store est nécessaire, la même base
pourra être emballée avec Capacitor sans réécrire l'interface.

### Identité visuelle v2

La charte fournie le 13 novembre 2026 est intégrée :

- **Palette** : Travertin `#F6F1E9`, Terracotta `#D46640`, Terracotta profond
  `#B04826`, Or `#D4A65A`, Or clair `#F2D296`, Or profond `#B5853B`, Sauge
  `#5C6B54`, Graphite `#2B2F33`, Ardoise `#5B636C`, Nuit `#1E1D1B`.
- **Typographies** : Fraunces pour l’éditorial, Inter pour l’interface et les
  chiffres tabulaires. Les deux sont auto-hébergées (Fontsource), aucun CDN.
- **Logo** : symbole officiel dans l’AppBar, logo empilé sur l’écran d’entrée,
  logo horizontal dans les réglages. Les SVG fournis sont copiés dans
  `apps/portal/public/brand/`.
- **Icônes PWA** : `apps/portal/public/icons/` reprend les PNG/SVG fournis
  (192, 512, Apple Touch 180, favicons 16/32/SVG).
- **Contrastes** : texte courant en Graphite/Ardoise sur Travertin, boutons
  blancs sur Terracotta profond, Or sur Nuit en mode sombre.

### Fonctionnalités

| Module | Détail |
|---|---|
| **La Piazza** | Héro livraison + compte à rebours, 3 stats, dates clés éditables jusqu'au 31/12/2028, dernières photos, installation PWA |
| **3D & Plans** | `HouseViewer` R3F chargé en `React.lazy`, niveaux Global/RdC/Étage, sélection de pièce, fiche cotes + cuisine, fallback filaire si le GLB est absent |
| **Rétroplanning** | Jalons administratifs, techniques, chantier et livraison ; filtres ; export `.ics` avec alarmes J-7/J-1 ; flux calendrier privé révocable |
| **Docs & Chantier** | Coffre-fort (PDF, DOCX, XLSX, images), journal photo géolocalisé, notes, réserves, file d'attente hors-ligne, exports CSV |
| **Budget** | Appels de fonds CCMI, avenants +/- ; montants en centimes entiers ; totaux serveur ; export CSV |
| **Réglages** | Thème Paper clair/sombre/auto, push, calendrier, sessions, invitations, changement de mot de passe |

---

## 2. Démarrage local

### Prérequis

- Node.js **22+** (le dépôt est testé avec Node 24 en local, Node 22 en Docker)
- npm **10+**
- Docker Desktop ou Docker Engine + Compose v2
- PostgreSQL 17 (ou le service `db` de Compose)

### Installation

```bash
npm install
cp .env.example .env
```

Générer les secrets :

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"  # SESSION_SECRET / OTP_PEPPER
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"    # FILE_ENCRYPTION_KEY
npx web-push generate-vapid-keys                                                       # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

Renseigner `.env` :

- `DATABASE_URL` : `postgresql://casarenous:casarenous@localhost:5432/casarenous`
- `APP_ORIGIN` : `http://localhost:5173` en dev
- `SESSION_SECRET`, `OTP_PEPPER`, `FILE_ENCRYPTION_KEY`
- `MAIL_TRANSPORT=console` en dev (le code OTP apparaît dans les logs backend)
- `SEED_ADMIN_PASSWORD` et les mots de passe des invités (ou les laisser vides
  en développement : le seed génère des mots de passe aléatoires affichés une
  seule fois)

Démarrer PostgreSQL puis l'application :

```bash
# Option A — PostgreSQL local via Docker
docker compose up -d db

# Option B — PostgreSQL déjà installé : créer la base et l'utilisateur
# createdb casarenous && createuser casarenous

npm run dev
```

- Portail : `http://localhost:5173`
- API : `http://localhost:3000/api/health`
- Le proxy Vite redirige `/api` vers le backend.

### Variante : backend dans Docker + Vite sur l'hôte

Pour éviter d'installer PostgreSQL et un serveur SMTP local :

```bash
# Backend + base + boîte mail de test (MailHog), backend publié sur 127.0.0.1 uniquement
docker compose -f compose.yaml -f compose.dev.yaml --profile dev up -d db backend mailhog

# Portail Vite avec proxy vers 127.0.0.1:3000
npm run dev -w @casarenous/portal
```

- OTP consultable sur `http://127.0.0.1:8025` (MailHog).
- `compose.dev.yaml` force `NODE_ENV=development`, `COOKIE_SECURE=false`
  et `APP_ORIGIN=http://localhost:5173`.
- Ne jamais utiliser `compose.dev.yaml` en production : il publie le backend
  sur la loopback et désactive le cookie `Secure`.

Appliquer migrations + seed :

```bash
npm run db:migrate
npm run db:seed
```

Le seed est **idempotent**. Il crée :

- 1 admin et 2 invités (Mme Sévin, M. Renous) ;
- un second admin optionnel si `SEED_ADMIN_2_EMAIL` / `_NAME` / `_PASSWORD`
  sont définis ;
- le profil maison `7,10 × 13,60 m`, R+1 ;
- les 15 pièces avec leurs surfaces exactes et la terrasse bois ;
- les specs cuisine validées ;
- les dates clés et jalons **provisoires** jusqu'en 2028 ;
- **la signature du CCMI au 6 novembre 2026**, marquée comme réalisée ;
- **aucun montant financier inventé** : le budget démarre vide.

> En production, le seed refuse de démarrer si les `SEED_*_PASSWORD` sont
> absents ou trop faibles. Les adresses `@casarenous.fr` / `@casarenous.local`
> sont ignorées en production : aucun OTP ne peut y arriver.
> `SEED_ON_START=false` : après avoir modifié `.env`, recrée le backend puis
> lance explicitement `docker compose exec backend node
> apps/backend/dist/db/seed-cli.js`.
> Pour ajouter un admin à chaud, le flux recommandé reste
> **Réglages → Inviter une personne** avec le rôle Admin.

### Bootstrap d’un admin réel sans OTP

Si les comptes seedés utilisent une adresse factice, crée directement un admin
avec une adresse réelle :

```bash
docker compose exec backend node apps/backend/dist/scripts/user-create.js \
  admin@exemple.fr "Marty" admin
```

La commande demande le mot de passe (12 caractères minimum, 3 familles), crée
ou met à jour le compte en base, sans passer par l’OTP. La connexion suivante
utilise cette adresse : l’OTP part vers la vraie boîte si SMTP est configuré.

En local : `npm run user:create -- admin@exemple.fr "Marty" admin`.

### Tester sans serveur email

Pour une démonstration ou des tests, le profil `compose.test.yaml` affiche
l’OTP dans les logs backend :

```bash
docker compose -f compose.yaml -f compose.test.yaml up -d backend
docker compose logs -f backend
```

Le code de test apparaît directement sur l’écran OTP avec un bouton
**Remplir**, et dans les logs :

```text
[mailer:console] code OTP ... "devCode":"123456"
```

Lancement local complet :

```bash
docker compose -f compose.yaml -f compose.test.yaml up -d backend
npm run dev -w @casarenous/portal -- --port 5174 --strictPort
# http://localhost:5174
```

Ce profil force `NODE_ENV=development`, `MAIL_TRANSPORT=console` et publie le
backend sur `127.0.0.1:3000` pour le proxy Vite. Il est prévu pour les tests :
en production réelle, utiliser SMTP et ne pas inclure `compose.test.yaml`.

### Scripts utiles

```bash
npm run typecheck       # shared + backend + portal
npm run lint            # ESLint
npm run lint:aura       # invariants Aura (hex, fetch, 3D lazy, budgets UI)
npm test                # shared + backend + portal
npm run test:backend    # Vitest + Supertest + PGlite
npm run db:generate     # génère une migration Drizzle
npm run db:migrate      # applique les migrations
npm run db:seed         # seed idempotent
npm run user:passwd -- email@exemple.fr
npm run compose:config  # valide compose.yaml
```

---

## 3. Architecture

```text
Navigateur (PWA)
   │  HTTPS 443
   ▼
┌──────────────────────────────┐
│ portal — nginx               │  SPA, cache, CSP, TLS, rate limit
│  /api → backend:3000         │
└──────────────┬───────────────┘
               │ réseau Docker interne
               ▼
┌──────────────────────────────┐
│ backend — Express            │  auth OTP, rôles, Zod, uploads,
│  migrations au démarrage     │  chiffrement AES-256-GCM, ICS, push
│  scheduler toutes les 15 min │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ db — PostgreSQL 17           │  volume pgdata, jamais exposé
└──────────────────────────────┘
```

- Seuls **80/443** sont publiés. `db` et `backend` n'ont aucun `ports`.
- `/data/uploads` est un volume persistant, hors racine web.
- Les fichiers sont chiffrés au repos (AES-256-GCM). La clé
  `FILE_ENCRYPTION_KEY` n'est jamais dans l'image ni dans la base.
- Les migrations tournent au démarrage du backend.
- Le scheduler envoie les rappels push et purge sessions/OTP/délivrances
  anciennes.

### Source unique des contrats

Tous les schémas Zod et types de contrat sont dans
`packages/shared/src/index.ts`. Aucun autre fichier ne définit de schéma Zod.
Les tables Drizzle (`apps/backend/src/db/schema.ts`) ne décrivent que le
stockage.

### Séparation transport / rendu

- Aucun `fetch` dans un composant React.
- Tout passe par `apps/portal/src/lib/api-client.ts`, puis par les hooks
  TanStack Query (`src/hooks/useApi.ts`).
- Le client push Aura reçoit explicitement `fetch: apiFetch`.
- Les médias authentifiés passent par `useMediaUrl` / `AuthenticatedImage`.

### Hors-ligne

- Cache TanStack Query persisté dans IndexedDB, **vidé à la déconnexion**.
- Le service worker ne met **jamais** les réponses `/api` en cache.
- File locale `outbox` limitée aux **photos, notes et réserves**, avec
  `clientId` UUID idempotent.
- Les dates clés, jalons et montants ne sont **jamais** mis en file hors-ligne.
- Les photos sont compressées et ré-encodées côté client (EXIF/GPS supprimés)
  avant envoi.

---

## 4. Sécurité

| Mesure | Implémentation |
|---|---|
| Mots de passe | scrypt N=16384, r=8, p=1, sel aléatoire, comparaison constante |
| OTP | 6 chiffres, HMAC-SHA256 avec `OTP_PEPPER`, 10 min, 5 essais, cooldown 60 s, un seul challenge actif |
| Sessions | token 256 bits opaque, hash SHA-256 en base, cookie `HttpOnly`, `SameSite=Lax`, `Secure`, préfixe `__Host-` en production |
| Durée | 14 jours absolus, 24 h d'inactivité, max 10 sessions, rotation à la connexion |
| Révocation | logout, changement de mot de passe, révocation par appareil |
| CSRF | `Origin` strictement égal à `APP_ORIGIN`, `Sec-Fetch-Site`, `Content-Type` contrôlé sur toute mutation |
| Rôles | `requireAuth` + `requireRole("admin")` / `requireRole("admin","invites")` côté serveur |
| Rate limit | global + login + OTP + uploads + push + flux calendrier, verrouillage compte après 5 échecs |
| Validation | Zod sur env, body, query, params ; refus au démarrage si la config est faible |
| Uploads | taille max, allowlist MIME, **magic bytes**, ré-encodage images, nom UUID, stockage hors web root |
| Chiffrement | AES-256-GCM, IV/tag par fichier, clé versionnée |
| Téléchargement | endpoint authentifié, `Content-Disposition: attachment`, `nosniff`, CSP sandbox, audit |
| Push | clé privée VAPID serveur uniquement, endpoints HTTPS allowlistés (anti-SSRF), déduplication |
| Calendrier | jeton hashé, révocable, rate-limité, lecture seule |
| En-têtes | CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP/CORP |
| Logs | pino structuré, redaction cookies/mots de passe/OTP, audit en base |

### Matrice des rôles

| Action | admin | invites |
|---|---|---|
| Lire projet, pièces, dates, jalons, documents, photos, notes, réserves, budget | ✅ | ✅ |
| Modifier dates clés, jalons, pièces | ✅ | ❌ |
| Uploader / supprimer un document | ✅ | ❌ |
| Ajouter photo, note, réserve | ✅ | ✅ |
| Faire évoluer le statut d'une réserve | ✅ | ✅ |
| Modifier le titre/gravité d'une réserve | ✅ | ❌ |
| Créer / modifier le budget | ✅ | ❌ |
| Voir l'audit | ✅ | ❌ |
| Créer / révoquer une invitation | ✅ | ❌ |
| Gérer ses sessions, son mot de passe, son push | ✅ | ✅ |

---

## 5. API

Toutes les routes sont sous `/api`. Les erreurs suivent
`{ error, code, requestId, details? }`.

<details>
<summary>Liste des endpoints</summary>

```text
POST   /auth/login                 public, rate-limité
POST   /auth/otp                   public + cookie challenge
POST   /auth/otp/resend            public + cookie challenge
POST   /auth/register              public + invitation valide
POST   /auth/register/otp          public + cookie challenge
POST   /auth/register/resend       public + cookie challenge
POST   /auth/logout                auth
GET    /auth/me                    auth
POST   /auth/password              auth
GET    /auth/sessions              auth
DELETE /auth/sessions/:id          auth

GET    /project                    auth
GET    /rooms                      auth
GET    /rooms/:slug                auth
PATCH  /rooms/:id                  admin

GET    /key-dates                  auth
POST   /key-dates                  admin
PATCH  /key-dates/:id              admin
DELETE /key-dates/:id              admin (système non supprimable)

GET    /milestones                 auth
POST   /milestones                 admin
PATCH  /milestones/:id             admin
DELETE /milestones/:id             admin
GET    /milestones/calendar.ics    auth ou ?token=
GET    /calendar/token             auth
POST   /calendar/token             auth (rotation)
DELETE /calendar/token             auth (révocation)

GET    /documents                  auth
POST   /documents                  admin, multipart
PATCH  /documents/:id              admin
DELETE /documents/:id              admin (soft delete)
GET    /documents/:id/file         auth, flux déchiffré

GET    /photos                     auth
POST   /photos                     auth, multipart idempotent
PATCH  /photos/:id                 auteur/admin
DELETE /photos/:id                 admin
GET    /photos/:id/file            auth
GET    /photos/:id/thumb           auth

GET    /notes                      auth
POST   /notes                      auth
PATCH  /notes/:id                  auteur/admin
DELETE /notes/:id                  auteur/admin

GET    /reserves                   auth
POST   /reserves                   auth
PATCH  /reserves/:id               auth (statut) / admin (tout)
DELETE /reserves/:id               admin
GET    /reserves/export.csv        auth

GET    /budget                     auth
POST   /budget/items               admin
PATCH  /budget/items/:id           admin
DELETE /budget/items/:id           admin
GET    /budget/export.csv          admin

GET    /push/vapid                 auth
POST   /push/subscribe             auth
POST   /push/unsubscribe           auth
POST   /push/test                  auth, 3/h
GET    /push/status                auth

GET    /admin/audit                admin
GET    /admin/invitations          admin
POST   /admin/invitations          admin (email + nom + rôle)
DELETE /admin/invitations/:id      admin (révocation)
GET    /health                     public
```

</details>

### Exemple de flux auth

```text
1. POST /api/auth/login {email, password}      → {needsOtp, emailMasked} + cookie OTP
2. POST /api/auth/otp {code}                   → {user} + cookie session
3. GET  /api/auth/me                           → {user}
4. POST /api/auth/logout                       → {ok}
```

Le cookie de session n'est jamais accessible en JavaScript.

### Inscription sur invitation

1. L'admin ouvre **Réglages → Inviter une personne**, saisit l'email, le nom et
   le rôle. L'API renvoie un code à usage unique (et l'envoie par email si SMTP
   est configuré).
2. L'invité ouvre l'app, choisit **« J'ai une invitation »**, saisit le code,
   son email, son nom et un mot de passe.
3. Un OTP de 6 chiffres est envoyé. Après validation, le compte est créé, la
   session est ouverte et l'invitation est marquée utilisée.

L'invitation expire au bout de 7 jours, est nominative, à usage unique et
révocable. Aucune inscription libre n'est possible sans invitation valide.

---

## 6. Visionneuse 3D

Le portail charge `apps/portal/public/models/casarenous.glb` en différé
(`React.lazy` + `Suspense`), uniquement à l'ouverture de l'onglet **3D**.

### Déposer le GLB

```text
apps/portal/public/models/casarenous.glb
```

Le modèle est **auto-calibré** : l'application calcule sa boîte englobante,
le recentre, le pose au sol et le met à l'échelle sur ~15 unités. Aucune
conversion d'unité n'est nécessaire.

Convention de nommage recommandée pour les pièces :

```text
Room_piece-de-vie
Room_entree
Room_cellier
Room_garage
Room_chambre-1
Room_salle-d-eau-rdc
Room_degagement
Room_chambre-parentale
Room_dressing
Room_salle-d-eau-privative
Room_chambre-2
Room_chambre-3
Room_chambre-4
Room_salle-de-bain
Room_wc
Room_terrasse-bois
```

- Un clic sur un mesh nommé ouvre la fiche pièce.
- Les noms contenant `rdc` / `etage` pilotent la coupe par niveau.
- Les plafonds (`ceiling`, `plafond`, `roof`, `toit`) sont masqués.
- **Fallback** : tant que le GLB est absent, une maquette filaire est générée
  depuis les surfaces seedées. L'application reste utilisable.

Briques reprises d'Orion : chargement `useGLTF`, caméra auto, `OrbitControls`,
boundary avec fallback, sélection de pièce. Adaptées à Aura (pas de Tailwind,
couleurs issues des tokens OKLCH).

---

## 7. PWA, offline et push

### Installation

- **Android / Chrome** : bandeau « Installer CasaRenous » ou menu navigateur.
- **iOS** : Partager → « Sur l'écran d'accueil » (obligatoire pour le push).
- **iOS 16.4+** requis pour les notifications push.

### Mode hors-ligne

- Coquille, polices, icônes et dernier état des requêtes sont disponibles.
- Le journal photo, les notes et les réserves sont mis en file locale.
- Le bandeau de synchronisation indique le nombre d'éléments en attente.
- Au retour du réseau, la file est rejouée automatiquement (ou manuellement).
- La déconnexion vide le cache et la file locale.

### Notifications

1. Réglages → Notifications → Activer.
2. Autoriser les notifications.
3. « Tester » envoie une notification immédiate.
4. Les rappels de jalons partent à J-7 et J-1 (et selon `notifyDays`).

> Le push ne se teste pas dans le serveur de développement Vite : utiliser un
> build de production ou l'app installée. Sur iOS, l'app doit être installée.

---

## 8. Déploiement Oracle Cloud Infrastructure

### 8.1 Instance

1. Créer une instance **Ampere A1.Flex** : **2 OCPU / 12 Go**, Ubuntu 24.04.
2. Ouvrir dans la **Security List** du VCN :
   - TCP 22 (SSH, idéalement restreint à ton IP) ;
   - TCP 80 (HTTP, redirection + challenge Let's Encrypt) ;
   - TCP 443 (HTTPS).
3. **Ne pas ouvrir** 3000 (backend) ni 5432 (PostgreSQL).
4. Créer un enregistrement DNS `A` :
   `casarenous.martylab.fr → IP publique de l'instance`.

### 8.2 Préparer le serveur

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker

sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 8.3 Installer CasaRenous

```bash
sudo mkdir -p /srv/casarenous && sudo chown "$USER":"$USER" /srv/casarenous
git clone <ton-depot> /srv/casarenous
cd /srv/casarenous
cp .env.example .env
mkdir -p certs certbot-webroot
chmod 700 certs
```

Générer les secrets et renseigner `.env` :

```bash
# secrets
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
npx web-push generate-vapid-keys
```

Variables production minimales :

```dotenv
NODE_ENV=production
APP_ORIGIN=https://casarenous.martylab.fr
COOKIE_SECURE=true
DATABASE_URL=postgresql://casarenous:CHANGE_ME@localhost:5432/casarenous
POSTGRES_DB=casarenous
POSTGRES_USER=casarenous
POSTGRES_PASSWORD=CHANGE_ME
SESSION_SECRET=...
OTP_PEPPER=...
FILE_ENCRYPTION_KEY=...
MAIL_TRANSPORT=smtp
SMTP_URL=smtps://user:password@smtp.exemple.fr:465
MAIL_FROM=CasaRenous <no-reply@casarenous.martylab.fr>
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@casarenous.martylab.fr
SEED_ADMIN_EMAIL=...
SEED_ADMIN_PASSWORD=...
SEED_INVITE_1_EMAIL=...
SEED_INVITE_1_PASSWORD=...
SEED_INVITE_2_EMAIL=...
SEED_INVITE_2_PASSWORD=...
TZ=Europe/Paris
```

> `DATABASE_URL` est surchargée par Compose pour pointer vers `db:5432`.
> Le mot de passe de `DATABASE_URL` doit rester cohérent avec
> `POSTGRES_PASSWORD`.

### 8.4 Certificat TLS

**Option A — Let's Encrypt (recommandé)**

```bash
sudo apt install -y certbot
sudo certbot certonly --webroot \
  -w /srv/casarenous/certbot-webroot \
  -d casarenous.martylab.fr \
  --email ton-email@exemple.fr \
  --agree-tos --no-eff-email

sudo cp /etc/letsencrypt/live/casarenous.martylab.fr/fullchain.pem /srv/casarenous/certs/
sudo cp /etc/letsencrypt/live/casarenous.martylab.fr/privkey.pem  /srv/casarenous/certs/
sudo chown "$USER":"$USER" /srv/casarenous/certs/*
chmod 600 /srv/casarenous/certs/privkey.pem
```

Renouvellement (cron ou timer systemd) :

```bash
sudo certbot renew --deploy-hook \
  "cp /etc/letsencrypt/live/casarenous.martylab.fr/fullchain.pem /srv/casarenous/certs/ && \
   cp /etc/letsencrypt/live/casarenous.martylab.fr/privkey.pem /srv/casarenous/certs/ && \
   cd /srv/casarenous && docker compose exec -T portal nginx -s reload"
```

**Option B — certificat d'origine Cloudflare / OVH**

Déposer `fullchain.pem` et `privkey.pem` dans `./certs/`. Le conteneur les
utilise au démarrage.

> Sans certificat monté, le conteneur génère un **auto-signé** pour permettre
> les tests locaux. En production, montez de vrais certificats.

### 8.5 Démarrer

```bash
cd /srv/casarenous
docker compose config   # vérifie la configuration
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

Appliquer le seed **une fois** (les mots de passe générés s'affichent une seule
fois) :

```bash
docker compose exec backend node apps/backend/dist/db/seed-cli.js
```

Vérifier :

```bash
curl -fsS https://casarenous.martylab.fr/api/health
# {"status":"ok","db":"up"}
```

Se connecter avec l'email admin et le mot de passe du seed. Le premier écran
demande le code OTP envoyé par email.

### 8.6 Sauvegardes

Activer le service de sauvegarde (dump PostgreSQL + archives des uploads,
rétention 14 jours) :

```bash
mkdir -p backups
docker compose --profile backup up -d backup
```

Restaurer :

```bash
docker compose stop backend
docker compose exec -T db dropdb -U casarenous casarenous
docker compose exec -T db createdb -U casarenous casarenous
docker compose exec -T db pg_restore -U casarenous -d casarenous < backups/casarenous-AAAAMMJJ-HHMMSS.dump
docker compose start backend
```

Les fichiers de `backups/uploads-*.tar.gz` contiennent les uploads **déjà
chiffrés** : conserve `FILE_ENCRYPTION_KEY` avec les sauvegardes, sinon les
documents sont irrécupérables.

### 8.7 Mise à jour

```bash
cd /srv/casarenous
git pull
docker compose build
docker compose up -d
docker compose logs -f backend
```

Les migrations sont appliquées automatiquement au démarrage. Le portail et le
service worker sont servis en `no-cache` pour éviter les versions figées.

### 8.8 Durcissement complémentaire

- SSH par clé uniquement, `PasswordAuthentication no`.
- `fail2ban` sur SSH.
- Sauvegardes OCI Block Volume + Object Storage (chiffrées).
- Rotation des secrets : `FILE_ENCRYPTION_KEY` est versionnée
  (`enc_key_version`), prévoir une migration de clé avant rotation.
- Surveiller `docker compose ps` et `/api/health`.

---

## 9. Modèle de données

18 tables PostgreSQL :

```text
users, sessions, otp_challenges, invitations, registration_challenges,
calendar_tokens, audit_log, project_profile, rooms, key_dates, milestones,
documents, site_photos, site_notes, reserves, budget_items,
push_subscriptions, push_deliveries
```

Points clés :

- `budget_items.amount_cents` : `integer`, jamais de `float` ;
- `key_dates.date` et `milestones.planned_end` : `CHECK <= 2028-12-31` ;
- `site_photos.client_id`, `site_notes.client_id`, `reserves.client_id`,
  `budget_items.client_id` : unicité pour l'idempotence hors-ligne ;
- `push_deliveries` : unique `(subscription_id, dedupe_key)` ;
- audit de toutes les actions sensibles.

---

## 10. Tests

```bash
npm run typecheck
npm run lint
npm run lint:aura
npm test
```

La suite backend utilise **PGlite** (PostgreSQL embarqué) : les mêmes
migrations SQL que la production, sans serveur externe. Elle couvre :

- auth mot de passe + OTP, rejeu, expiration, verrouillage ;
- cookies et révocation de session ;
- CSRF (Origin absent, inconnu, cross-site, Content-Type) ;
- rôles admin / invités ;
- magic bytes, upload valide, téléchargement authentifié, soft delete ;
- photos ré-encodées, géolocalisation, idempotence ;
- budget en centimes, doublons, montants négatifs ;
- export ICS, alarmes, jeton de calendrier révocable ;
- push : allowlist d'endpoint, abonnement/désabonnement, état ;
- invitations : création admin, rôle, email imposé, OTP, réutilisation, révocation, doublon.

La suite portail couvre le parseur euro→centimes, le formatage, les dates du
projet, la conversion OKLCH→sRGB pour WebGL et le contrat de réponse de
`api-client` (Zod partagé).

**66 tests** au total : 6 shared, 47 backend, 13 portail.

Vérifications effectuées lors de la livraison :

- `npm run typecheck`, `npm run lint`, `npm run lint:aura`, `npm test` : verts ;
- `npm audit --omit=dev` : **0 vulnérabilité** ;
- Lighthouse sur le build de production (écran de connexion) :
  accessibilité **100**, bonnes pratiques **100**, SEO **100** ;
- `docker compose up -d --build` : `db`, `backend` et `portal` **healthy** ;
- connexion OTP et cookies `__Host-` `Secure` `HttpOnly` `SameSite=Lax`
  vérifiés de bout en bout derrière nginx ;
- inscription sur invitation testée de bout en bout : création admin, code,
  email imposé, OTP, création du compte et session invitée ;
- upload photo/document chiffré, vignette et téléchargement authentifié
  vérifiés dans l'image Docker (sharp, AES-256-GCM).

---

## 11. Règles Aura et invariants

- UI **exclusivement** `apps/portal/src/aura/` ; pas de Tailwind, pas de
  shadcn, pas de Radix.
- Aucune couleur hexadécimale dans `components/`, `features/`, `screens/`,
  `auth/` : tokens `--aura-*` et accent `terracotta` en OKLCH.
- Maximum **1** `Card variant="hero"`, **3** `Stat`, **1** action primaire,
  **5** onglets par écran.
- Une seule direction : **Paper / editorial**.
- `npm run lint:aura` échoue si ces règles sont violées.

Composants Aura étendus (dans le kit source et dans le projet) :

- accent `terracotta` ajouté à `aura.css` ;
- `Skeleton` accepte `height` / `width` ;
- `Sheet` protégé contre un tableau de focus vide.

---

## 12. Limites connues

- **GLB** : non fourni à ce stade ; fallback filaire actif. Déposer
  `casarenous.glb` dans `apps/portal/public/models/`.
- **Push iOS** : PWA installée + iOS 16.4+ obligatoires ; bugs de livraison
  connus sur iOS 17 après fermeture forcée.
- **Rate limit** : en mémoire, hypothèse d'une instance backend unique. Pour
  plusieurs instances, déplacer les compteurs dans PostgreSQL/Redis.
- **Scheduler** : une seule instance ; advisory lock à ajouter si scale-out.
- **Emails** : le transport SMTP doit être configuré en production. Le mode
  console est interdit par la validation d'environnement.
- **Chiffrement des fichiers** : la rotation de `FILE_ENCRYPTION_KEY` nécessite
  un script de ré-chiffrement (non inclus).
- **Antivirus** : les uploads sont validés par magic bytes et les images
  ré-encodées ; un scan ClamAV peut être ajouté en amont sur OCI.
- **PWA** : le chunk Three.js (~1 Mo) est précaché pour permettre la 3D
  hors-ligne ; il n'est **exécuté** qu'à l'ouverture de l'onglet 3D.

---

## 13. Licence

Projet privé — © Sévin / Renous. Tous droits réservés.
