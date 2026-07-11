/* =============================================================================
 * Tico Farm Manager 360 — Configuration Firebase
 * -----------------------------------------------------------------------------
 * ⚠️  IMPORTANT : remplacez les valeurs ci-dessous par celles de VOTRE projet
 *     Firebase (https://console.firebase.google.com → Paramètres du projet).
 *
 *     Ce fichier est le SEUL endroit où vous devez mettre votre configuration
 *     — tout le reste de l'application la récupère via `firebaseConfig`.
 *
 *     Pour créer un projet :
 *       1. Allez sur https://console.firebase.google.com
 *       2. Créez un nouveau projet (ex : "tico-farm-manager-360")
 *       3. Activez Authentication → Email/Password
 *       4. Créez une base Realtime Database (mode "verrouillé" puis on
 *          appliquera les règles de sécurité fournies dans le README)
 *       5. Activez Storage
 *       6. Copiez la config Web dans le bloc ci-dessous.
 *
 *     Pour GitHub Pages : ajoutez votre domaine (username.github.io/tico)
 *     dans Authentication → Settings → Authorized domains.
 * ============================================================================= */

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA0ZHUCOD3jRUbeIeWT4_jc6YSK4yWFKMo",
  authDomain: "tico-farm-manager.firebaseapp.com",
  projectId: "tico-farm-manager",
  storageBucket: "tico-farm-manager.firebasestorage.app",
  messagingSenderId: "44572826128",
  appId: "1:44572826128:web:2ef02e6cfccdcbbcd24895"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
}

// Références globales pour le reste de l'app.
const auth   = firebase.auth();
const db     = firebase.database();
const store  = firebase.storage();

/* ---------- Sécurité : on n'active la persistance locale qu'en HTTPS ----- */
// Désactivé pour Spark plan : la Realtime Database gère elle-même la mise en
// cache mémoire. Activer `enablePersistence` consommerait de la bande passante
// et n'est pas recommandé sur mobile bas-débit.

// Garde-fou : si l'utilisateur n'a pas encore renseigné sa config, on bloque
// proprement l'initialisation pour éviter des erreurs cryptiques dans la console.
window.addEventListener('DOMContentLoaded', () => {
  if (firebaseConfig.apiKey.startsWith("VOTRE_")) {
    console.warn(
      "%c⚠️ Configuration Firebase manquante",
      "background:#f59e0b;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold",
      "→ Ouvrez assets/js/firebase-config.js et remplacez les valeurs."
    );
  }
});
