# Notes de frais — ingestion de tickets + saisie automatique

Application personnelle et locale :

1. **Réception** des photos de tickets depuis un iPhone (dossier partagé, ou upload HTTP local).
2. **Compression** (JPEG ~1600 px) puis **OCR** pour extraire commerçant, date, montant TTC, TVA. Moteur par défaut : **Tesseract local** (`OCR_PROVIDER=tesseract`, 100 % offline, gratuit). Option cloud : `OCR_PROVIDER=mistral` + `MISTRAL_API_KEY` dans `.env` (meilleure qualité, mais les images partent sur l'API Mistral ; repli automatique sur Tesseract si l'appel échoue).
3. **Revue humaine** (CLI ou petite UI web locale) : chaque ticket passe `pending` → `approved`.
4. **Saisie automatique** sur ton site de notes de frais via Playwright, avec tes identifiants, puis statut `submitted` avec la référence retournée par le site.

## Prérequis

- macOS (ou Linux), Node.js ≥ 20
- `npm install`
- `npx playwright install chromium` (une seule fois)

## Installation

```bash
npm install
npx playwright install chromium
npm run init          # crée .env (chmod 600) et config/selectors.json
```

Édite ensuite :

- `.env` : `EXPENSE_SITE_URL`, `EXPENSE_USERNAME`, `EXPENSE_PASSWORD`, `SERVER_TOKEN` (`openssl rand -hex 32`)
- `config/selectors.json` : sélecteurs CSS de ton site (login + formulaire de note de frais)

## Tester l'app (sans toucher au vrai site)

```bash
npm install && npx playwright install chromium && npm run init

# 1) OCR local avec un ticket généré (aucune vraie photo nécessaire)
node scripts/demo-receipt.mjs data/inbox/demo.png
npm run ingest
npm run list                 # -> CARREFOUR CITY 15,95 € ...
npm run show <id>            # texte OCR brut

# 2) Upload façon iPhone + UI de revue
npm run serve                # terminal 1 : http://127.0.0.1:4789/
# terminal 2 (depuis le Mac, curl fonctionne) :
curl -X POST -H "X-Token: $SERVER_TOKEN" -F "file=@data/originals/<fichier>.png" http://127.0.0.1:4789/upload
# ou avec une vraie photo : AirDrop / iCloud Drive vers data/inbox/ puis npm run ingest

# 3) Saisie Playwright contre le FAUX site local (aucun risque)
node scripts/mock-site.mjs   # terminal 3 : http://127.0.0.1:4799/login
cp config/selectors.mock.json config/selectors.json
# dans .env : EXPENSE_SITE_URL=http://127.0.0.1:4799  EXPENSE_USERNAME=test  EXPENSE_PASSWORD=test  EXPENSE_HEADLESS=false
npm run approve all
npm run submit               # regarde le navigateur remplir le formulaire
npm run list                 # -> statut "submitted", réf NDF-TEST-0001
# puis restaure ton vrai config/selectors.json

# 4) OCR cloud Mistral (optionnel) : .env -> OCR_PROVIDER=mistral + MISTRAL_API_KEY=sk-...
#    puis reteste l'étape 1 avec une vraie photo de ticket (surveillance de l'usage sur console.mistral.ai)
```

Astuce : pour tester sans polluer tes vraies données, lance avec `DATA_DIR=/tmp/ndf-test`.

## Utilisation

```bash
# 1. Dépose les photos (AirDrop / dossier iCloud Drive) dans data/inbox/
#    ou lance le serveur et upload depuis l'iPhone (voir ci-dessous)
npm run ingest -- --watch     # traite automatiquement chaque nouvelle photo

# 2. Revue
npm run list                   # liste les tickets extraits (OCR)
npm run show <id>              # détail complet incl. texte OCR brut
npm run approve <id|all>       # marquer approuvé (requis avant soumission)
npm run reject <id>

# 3. Saisie automatique sur le site (navigateur invisible par défaut)
npm run submit                 # ou npm run submit -- --limit 5

# UI web locale de revue + upload : http://127.0.0.1:4789/
npm run serve
```

Test rapide sans vrai ticket : `node scripts/demo-receipt.mjs data/inbox/demo.png` puis `npm run ingest`.

## Depuis l'iPhone

**Option recommandée — dossier partagé (aucun serveur exposé) :**
règle l'iPhone sur le format photo « Le plus compatible » (JPEG), puis :
- AirDrop vers le Mac dans `data/inbox/`, ou
- raccourci iOS « Enregistrer dans Fichiers » vers le dossier iCloud Drive synchronisé avec `data/inbox/`,
puis `npm run ingest -- --watch` tourne en permanence sur le Mac.

**Option upload direct (même Wi-Fi uniquement) :**
- dans `.env`, mets `UPLOAD_HOST` sur l'IP LAN du Mac (ex. `192.168.1.20`) et un `SERVER_TOKEN` fort ;
- raccourci iOS « Obtenir le contenu de l'URL » : `POST http://<ip>:4789/upload`, en-tête `X-Token: <token>`, corps formulaire avec la photo dans le champ `file` (ou `POST /upload/raw` avec le JPEG en corps brut).
- **Ne mets jamais cette adresse sur Internet** : garde le pare-feu du Mac actif et le serveur sur ton réseau local uniquement.

## Sécurité

- `.env` contient tes identifiants : il est créé avec les droits `600`, est dans `.gitignore`, et n'est jamais logué.
- Les variables d'environnement réelles priment sur `.env` (pratique pour un gestionnaire de secrets).
- Le serveur d'upload n'écoute que sur `127.0.0.1` par défaut et exige le token `X-Token` (comparaison à temps constant).
- Aucun ticket n'est soumis sans approbation explicite (`approved`) : l'OCR peut se tromper.
- Toutes les données (photos originales, compressées, base) restent en local dans `data/`.

## Structure

```
src/config.js      chemins + chargement .env
src/store.js       stockage JSON (data/db.json), statuts, dédup par hash SHA-256
src/parser.js      texte OCR -> { commerçant, date, TTC, TVA, catégorie }
src/image.js       compression JPEG (sharp), 1ère page PDF
src/ocr.js         dispatch OCR (tesseract local par défaut, mistral en option)
src/ocr-mistral.js provider Mistral OCR (API cloud, clé dans .env)
src/pipeline.js    ingestion fichier -> compression -> OCR -> stockage
src/server.js      serveur local : /upload, /upload/raw, UI de revue
src/automation.js  Playwright : login + saisie des tickets approuvés
src/cli.js         commandes ingest/list/approve/reject/submit/serve
config/selectors.example.json   sélecteurs du site (à copier/adapter)
scripts/demo-receipt.mjs        génère un ticket de test
```
