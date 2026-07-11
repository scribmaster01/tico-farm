# 🐣 Tico Farm Manager 360

> **« Pilotez vos fermes, même à distance. »**

Application **PWA mobile-first** pour la gestion d'élevages avicoles. Permet aux
promoteurs d'élevages de superviser leurs fermes, leurs collaborateurs, leurs
couvaisons, leurs stocks et leur rentabilité depuis un seul tableau de bord.

![status](https://img.shields.io/badge/status-MVP%20ready-success)
![license](https://img.shields.io/badge/license-MIT-blue)
![firebase](https://img.shields.io/badge/Firebase-Spark%20Plan-orange)
![hosting](https://img.shields.io/badge/Hosting-GitHub%20Pages-black)

---

## ✨ Fonctionnalités (14 modules)

| # | Module                       | Description                                                                 |
|---|------------------------------|-----------------------------------------------------------------------------|
| 1 | 🚜 Gestion des fermes        | Nom, adresse, responsable, contact, nombre de couveuses                     |
| 2 | 📦 Gestion des lots          | N° auto, race (Goliath / Chair / Local), dates, responsable                 |
| 3 | 🥚 Suivi de couvaison        | 4 étapes : J0 collecte → J7 mirage → J14 mirage → Éclosion (verrouillées)  |
| 4 | 🏠 Tableau de bord 360°      | KPIs, top fermes, graphiques fertilité / mortalité / éclosion / rentabilité |
| 5 | 📅 Calendrier intelligent    | Alertes J7 / J14 / J21, retards, étapes manquantes                           |
| 6 | 💰 Gestion économique        | Dépenses, recettes, marge par lot et globale                                |
| 7 | 🧱 Stocks                    | Œufs, poussins, aliments, vaccins, désinfectants + seuils                   |
| 8 | 💼 Gestion commerciale       | Clients, ventes, paiements partiels, reste dû                              |
| 9 | 📷 Photos preuves            | Capture / compression / upload Firebase Storage par étape                   |
| 10 | 💬 Messagerie interne        | Conversations liées à chaque lot (admin ↔ collaborateur)                    |
| 11 | ❤️ Score santé du lot        | Score /100 + classification (🟢 / 🟡 / 🔴)                                 |
| 12 | ⚠️ Détection d'anomalies     | Validation cohérence, retards, mortalité excessive                          |
| 13 | 📄 Rapports PDF              | Export complet (stats, économie, anomalies) par lot                         |
| 14 | 🔔 Notifications             | Email phase 1 (préparé pour WhatsApp / push à venir)                        |

---

## 🧱 Stack technique

- **Frontend** : HTML5 / CSS3 / JavaScript vanilla (pas de framework)
- **Police** : Arial (cf. cahier des charges)
- **Backend** : Firebase Spark Plan (gratuit)
  - Firebase Authentication (email/password)
  - Firebase Realtime Database
  - Firebase Storage
- **Libs CDN** : Chart.js (graphiques), jsPDF (rapports)
- **PWA** : manifest + service worker (offline-first, cache shell)
- **Hébergement** : GitHub Pages (gratuit, statique)

---

## 🚀 Installation

### 1. Créer un projet Firebase

1. Allez sur [Firebase Console](https://console.firebase.google.com)
2. Cliquez sur **Ajouter un projet** → nommez-le (ex : `tico-farm-manager-360`)
3. Activez **Authentication → Sign-in method → Email/Password**
4. Créez une **Realtime Database** (mode "verrouillé")
5. Activez **Storage**
6. Dans **Paramètres du projet → Vos applications → Web**, copiez la config

### 2. Configurer l'application

Ouvrez `assets/js/firebase-config.js` et remplacez les valeurs :

```js
const firebaseConfig = {
  apiKey:            "AIza...",
  authDomain:        "tico-farm-manager-360.firebaseapp.com",
  databaseURL:       "https://tico-farm-manager-360-default-rtdb.firebaseio.com",
  projectId:         "tico-farm-manager-360",
  storageBucket:     "tico-farm-manager-360.appspot.com",
  messagingSenderId: "1234567890",
  appId:             "1:1234567890:web:abc..."
};
```

### 3. Règles de sécurité Firebase

#### Realtime Database
```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read":  "auth != null && (auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin')",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "farms": {
      ".read":  "auth != null",
      ".write": "auth != null && (root.child('users').child(auth.uid).child('role').val() === 'admin' || !data.exists() || data.child('ownerUid').val() === auth.uid)"
    },
    "lots":      { ".read": "auth != null", ".write": "auth != null" },
    "stocks":    { ".read": "auth != null", ".write": "auth != null" },
    "clients":   { ".read": "auth != null", ".write": "auth != null" },
    "sales":     { ".read": "auth != null", ".write": "auth != null" },
    "messages":  { ".read": "auth != null", ".write": "auth != null" }
  }
}
```

#### Storage
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /lots/{lotId}/{file=**} {
      allow read:  if request.auth != null;
      allow write: if request.auth != null && request.resource.size < 5 * 1024 * 1024;
    }
  }
}
```

#### Authorized domains (Authentication → Settings)
Ajoutez :
- `localhost` (dev)
- `VOTRE-USER.github.io` (prod)

### 4. Héberger sur GitHub Pages

```bash
# 1. Initialiser un repo
git init
git add .
git commit -m "Initial commit - Tico Farm Manager 360"
git branch -M main
git remote add origin https://github.com/VOTRE-USER/tico-farm-manager.git
git push -u origin main

# 2. Activer GitHub Pages : Settings → Pages → Source: main → Save
```

Votre app sera accessible à `https://VOTRE-USER.github.io/tico-farm-manager/`

### 5. Tester en local

```bash
# Option A : Python
python3 -m http.server 8000

# Option B : Node.js
npx http-server -p 8000
```

Puis ouvrez `http://localhost:8000`.

> ⚠️ Firebase Auth nécessite **HTTPS** ou **localhost**. Le test en `http://127.0.0.1` fonctionne.

---

## 🗂️ Structure du projet

```
tico-farm-manager/
├── index.html                       # UI principale
├── manifest.json                    # Métadonnées PWA
├── service-worker.js                # Offline-first
├── README.md
└── assets/
    ├── css/
    │   └── styles.css               # Design mobile-first + thème
    ├── js/
    │   ├── firebase-config.js       # ⚠️  À CONFIGURER
    │   └── app.js                   # Logique des 14 modules
    └── icons/                       # Icônes PWA (à générer)
        ├── icon-192.png
        └── icon-512.png
```

### Générer les icônes PWA

Vous pouvez utiliser [RealFaviconGenerator](https://realfavicongenerator.net/) ou
un outil en ligne de commande :

```bash
# Avec ImageMagick
convert -size 192x192 xc:green -fill white -gravity center \
  -pointsize 80 -annotate 0 "🐣" assets/icons/icon-192.png
convert -size 512x512 xc:green -fill white -gravity center \
  -pointsize 220 -annotate 0 "🐣" assets/icons/icon-512.png
```

---

## 👥 Rôles

| Rôle          | Droits                                                                       |
|---------------|------------------------------------------------------------------------------|
| **Admin**     | Voir toutes les fermes / lots, gérer les utilisateurs, publier observations, consulter photos, rapports, stats globales |
| **Collaborateur** | Créer des lots, suivre ses lots, ajouter photos, saisir étapes, consulter consignes, communiquer avec l'admin |

---

## 🔐 Sécurité

- **Auth Firebase** (mots de passe hashés côté serveur)
- **Validation client** : tous les formulaires sont validés (HTML5 + JS)
- **Compression d'images** avant upload (max 1280px, qualité 75%)
- **Limitation taille** photos à 5 Mo (règles Storage)
- **Échappement HTML** systématique via `Utils.esc()` (anti-XSS)
- **Règles BDD** côté serveur (voir plus haut) → **obligatoire** avant la prod

> 💡 Les règles de sécurité par défaut sont ouvertes pendant le développement.
> Pensez à verrouiller en production.

---

## 📊 Optimisations pour le Spark Plan gratuit

- Pas d'historique conservé côté client (re-souscription à chaque vue)
- Images **compressées** avant upload (réduit la bande passante Storage)
- Pas d'indexation secondaire (les requêtes utilisent `orderByChild` sur des
  clés simples)
- Realtime Database : on évite les `once('value')` multiples (cache mémoire)
- Pas de Cloud Functions (coût → on fait tout en client + BDD)

---

## 🛣️ Roadmap

- [ ] 📲 Notifications **WhatsApp** (via Twilio / Meta Business API)
- [ ] 🔔 **Push notifications** (Firebase Cloud Messaging)
- [ ] 🤖 **IA** : prédiction du taux d'éclosion (TensorFlow.js)
- [ ] 🌡️ **Capteurs IoT** (température, humidité) — MQTT → Cloud Functions
- [ ] 🐔 **Multi-espèces** : pintades, canards, dindes, cailles
- [ ] 📆 **Planification** multi-lots / multi-couveuses
- [ ] 🌍 **Multi-langues** (FR / EN / Wolof / Haoussa)

---

## 🤝 Contribution

Les PRs sont les bienvenues ! Pour les changements majeurs, ouvrez d'abord une
issue.

---

## 📄 Licence

MIT © 2026 — Tico Farm Manager 360

---

## 🆘 Support

- 📘 Documentation : ce README
- 🐛 Bugs : ouvrez une issue
- 📧 Contact : votre email ici

**Bonne gestion avicole ! 🐔🥚🐣**
