/* =============================================================================
 * Tico Farm Manager 360 — Logique applicative principale
 * -----------------------------------------------------------------------------
 * Architecture : vanilla JS + Firebase Compat SDK. Pas de framework pour
 * rester léger (compatible Spark plan gratuit, hébergement GitHub Pages).
 *
 * L'application est organisée en sections :
 *   1.  ÉTAT GLOBAL & CACHE
 *   2.  UTILITAIRES (dates, formats, sécurité, toasts, modales)
 *   3.  SERVICE WORKER
 *   4.  AUTHENTIFICATION
 *   5.  ROUTAGE & VUES
 *   6.  MODULE 1 — FERMES
 *   7.  MODULE 2 — LOTS
 *   8.  MODULE 3 — SUIVI DE COUVAISON
 *   9.  MODULE 4 — TABLEAU DE BORD 360°
 *   10. MODULE 5 — CALENDRIER INTELLIGENT
 *   11. MODULE 6 — GESTION ÉCONOMIQUE
 *   12. MODULE 7 — GESTION DES STOCKS
 *   13. MODULE 8 — GESTION COMMERCIALE
 *   14. MODULE 9 — PHOTOS PREUVES
 *   15. MODULE 10 — MESSAGERIE INTERNE
 *   16. MODULE 11 — SCORE SANTÉ
 *   17. MODULE 12 — DÉTECTION D'ANOMALIES
 *   18. MODULE 13 — RAPPORTS PDF
 *   19. MODULE 14 — NOTIFICATIONS
 *   20. INITIALISATION
 * ============================================================================= */

'use strict';

/* =========================================================================
 * 1. ÉTAT GLOBAL & CACHE
 * ========================================================================= */
const State = {
  user: null,             // { uid, email, displayName, role, farmId }
  profile: null,          // Profil complet en BDD
  farms: {},              // { farmId: { ... } }
  lots: {},               // { lotId: { ... } }
  stocks: {},             // { stockId: { ... } }
  clients: {},            // { clientId: { ... } }
  sales: {},              // { saleId: { ... } }
  messages: {},           // { messageId: { ... } }
  notifications: [],      // Liste locale de notifs
  currentView: 'dashboard',
  charts: {}              // Instances Chart.js actives (pour destruction)
};

const RACES = ['Goliath', 'Chair', 'Local'];

/* =========================================================================
 * 2. UTILITAIRES
 * ========================================================================= */
const Utils = {

  /** Sécurise une insertion HTML (anti-XSS). */
  esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /** Formate une date (timestamp ms ou ISO) en JJ/MM/AAAA. */
  fmtDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  },

  /** Formate une date courte + heure. */
  fmtDateTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return `${this.fmtDate(ts)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  },

  /** Date ISO du jour (YYYY-MM-DD). */
  todayISO() { return new Date().toISOString().slice(0, 10); },

  /** Date ISO + N jours. */
  addDaysISO(iso, n) {
    const d = new Date(iso);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  },

  /** Différence en jours entre deux dates ISO. */
  daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
  },

  /** Formate un nombre avec espaces (français). */
  fmtNum(n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  },

  /** Formate un prix en FCFA. */
  fmtMoney(n) {
    return `${this.fmtNum(n)} FCFA`;
  },

  /** Calcule l'écart de jours entre deux dates ISO. */
  ageInDays(iso) {
    return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  },

  /** Génère un ID court pseudo-unique (pour les éléments locaux). */
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },

  /** Validation email simple. */
  isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); },

  /** Toast (notification in-app). */
  toast(msg, type = 'info', duration = 3000) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${type === 'success' ? '✅' : type === 'warning' ? '⚠️' : type === 'danger' ? '❌' : 'ℹ️'}</span><span>${this.esc(msg)}</span>`;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(-8px)'; }, duration - 250);
    setTimeout(() => el.remove(), duration);
  },

  /** Affiche une modale générique. */
  modal({ title, body, footer, onClose }) {
    const modal = document.getElementById('modal');
    document.getElementById('modal-title').textContent = title || '';
    document.getElementById('modal-body').innerHTML = body || '';
    const foot = document.getElementById('modal-foot');
    foot.innerHTML = footer || '';
    modal.classList.remove('hidden');
    const close = () => { modal.classList.add('hidden'); if (onClose) onClose(); };
    modal.querySelectorAll('[data-close]').forEach(el => el.onclick = close);
    return { close, body: document.getElementById('modal-body'), foot };
  },

  /** Confirmation simple. */
  confirm(message, onYes, onNo) {
    this.modal({
      title: 'Confirmation',
      body: `<p>${this.esc(message)}</p>`,
      footer: `
        <button class="btn" data-close>Annuler</button>
        <button class="btn btn-danger" id="confirm-yes">Confirmer</button>`
    });
    setTimeout(() => {
      const yes = document.getElementById('confirm-yes');
      if (yes) yes.onclick = () => { onYes && onYes(); document.getElementById('modal').classList.add('hidden'); };
    }, 50);
    if (onNo) {
      const cancel = document.getElementById('modal').querySelector('[data-close]');
      cancel.onclick = () => { onNo && onNo(); };
    }
  },

  /** Compression d'image (Canvas) avant upload Firebase Storage. */
  compressImage(file, maxSize = 1280, quality = 0.75) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxSize || height > maxSize) {
            if (width > height) { height = Math.round(height * maxSize / width); width = maxSize; }
            else                { width  = Math.round(width  * maxSize / height); height = maxSize; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
};

/* =========================================================================
 * 3. SERVICE WORKER (enregistrement)
 * ========================================================================= */
function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js')
        .catch(err => console.warn('[SW] Échec enregistrement :', err));
    });
  }
}

/* =========================================================================
 * 4. AUTHENTIFICATION
 * ========================================================================= */
const Auth = {

  init() {
    // Bascule onglets login / register
    document.querySelectorAll('.tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        document.getElementById(`${target}-form`).classList.add('active');
      };
    });

    // Soumission login
    document.getElementById('login-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const errEl = document.getElementById('login-error');
      errEl.textContent = '';
      try {
        const cred = await auth.signInWithEmailAndPassword(f.email.value.trim(), f.password.value);
        Utils.toast('Connexion réussie', 'success');
      } catch (err) {
        errEl.textContent = this.fmtError(err);
      }
    };

    // Soumission register
    document.getElementById('register-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const errEl = document.getElementById('register-error');
      errEl.textContent = '';
      if (!Utils.isEmail(f.email.value)) { errEl.textContent = 'Email invalide.'; return; }
      if (f.password.value.length < 6)  { errEl.textContent = 'Mot de passe : 6 caractères minimum.'; return; }
      try {
        const cred = await auth.createUserWithEmailAndPassword(f.email.value.trim(), f.password.value);
        await cred.user.updateProfile({ displayName: f.displayName.value.trim() });
        // Création du profil + ferme initiale dans la BDD
        const farmId = db.ref('farms').push().key;
        const farm = {
          name: f.farmName.value.trim(),
          address: '',
          responsable: f.displayName.value.trim(),
          phone: '',
          couveuses: 0,
          ownerUid: cred.user.uid,
          createdAt: Date.now()
        };
        await db.ref(`farms/${farmId}`).set(farm);
        await db.ref(`users/${cred.user.uid}`).set({
          uid: cred.user.uid,
          email: f.email.value.trim(),
          displayName: f.displayName.value.trim(),
          role: f.role.value,
          farmId,
          createdAt: Date.now()
        });
        Utils.toast('Compte créé avec succès', 'success');
      } catch (err) {
        errEl.textContent = this.fmtError(err);
      }
    };

    // Suivi de l'état d'auth
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        const snap = await db.ref(`users/${user.uid}`).once('value');
        State.profile = snap.val();
        if (!State.profile) {
          // Profil absent (compte supprimé en BDD). Déconnexion.
          await auth.signOut();
          return;
        }
        State.user = State.profile;
        App.show();
        App.subscribeAll();
        App.go(State.currentView || 'dashboard');
      } else {
        State.user = null;
        State.profile = null;
        App.showAuth();
      }
    });
  },

  fmtError(err) {
    const map = {
      'auth/email-already-in-use': 'Cet email est déjà utilisé.',
      'auth/invalid-email':        'Email invalide.',
      'auth/user-not-found':       'Aucun compte avec cet email.',
      'auth/wrong-password':       'Mot de passe incorrect.',
      'auth/weak-password':        'Mot de passe trop faible (6+ caractères).',
      'auth/too-many-requests':    'Trop de tentatives. Réessayez plus tard.'
    };
    return map[err.code] || (err.message || 'Erreur inconnue.');
  },

  async logout() {
    Utils.confirm('Voulez-vous vraiment vous déconnecter ?', async () => {
      await auth.signOut();
      Utils.toast('Déconnecté', 'info');
    });
  }
};

/* =========================================================================
 * 5. ROUTAGE & VUES
 * ========================================================================= */
const App = {

  show() {
    document.getElementById('splash').classList.add('hidden');
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    // Header
    document.getElementById('drawer-name').textContent = State.user.displayName || State.user.email;
    document.getElementById('drawer-role').textContent = State.user.role === 'admin' ? 'Administrateur' : 'Collaborateur';
    const badge = document.getElementById('user-badge');
    badge.textContent = State.user.role === 'admin' ? 'ADMIN' : 'COLLAB';
    badge.className = `badge ${State.user.role === 'admin' ? 'badge-admin' : 'badge-collaborator'}`;

    // Affichage conditionnel pour les entrées admin
    document.querySelectorAll('.admin-only').forEach(el => {
      el.classList.toggle('hidden', State.user.role !== 'admin');
    });
  },

  showAuth() {
    document.getElementById('splash').classList.add('hidden');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
  },

  /** Abonnement temps réel à toutes les collections pertinentes. */
  subscribeAll() {
    const uid = State.user.uid;
    const isAdmin = State.user.role === 'admin';
    // Farms : admin → toutes ; collaborateur → sa ferme uniquement
    const farmsRef = isAdmin
      ? db.ref('farms')
      : db.ref('farms').orderByChild('ownerUid').equalTo(uid);
    farmsRef.on('value', s => State.farms = s.val() || {});

    // Lots : admin → tous ; collaborateur → sa ferme
    const lotsRef = isAdmin
      ? db.ref('lots')
      : db.ref('lots').orderByChild('farmId').equalTo(State.user.farmId);
    lotsRef.on('value', s => State.lots = s.val() || {});

    // Stocks : par ferme
    db.ref('stocks').orderByChild('farmId').equalTo(State.user.farmId)
      .on('value', s => State.stocks = s.val() || {});

    // Clients + ventes : par ferme
    db.ref('clients').orderByChild('farmId').equalTo(State.user.farmId)
      .on('value', s => State.clients = s.val() || {});
    db.ref('sales').orderByChild('farmId').equalTo(State.user.farmId)
      .on('value', s => State.sales = s.val() || {});

    // Messages : par ferme
    db.ref('messages').orderByChild('farmId').equalTo(State.user.farmId)
      .on('value', s => State.messages = s.val() || {});

    // Utilisateurs (admin)
    if (isAdmin) db.ref('users').on('value', s => { /* refresh UI */ });
  },

  go(view) {
    State.currentView = view;
    document.querySelectorAll('.bottom-nav-item').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    Renderer[view] ? Renderer[view]() : Renderer.dashboard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

/* =========================================================================
 * 6. MODULE 1 — GESTION DES FERMES
 * ========================================================================= */
const Farms = {

  list() {
    const farms = Object.entries(State.farms).map(([id, f]) => ({ id, ...f }));
    if (!farms.length) return `<div class="empty"><div class="empty-icon">🚜</div><h3>Aucune ferme</h3><p>Commencez par créer votre première ferme.</p></div>`;
    return `
      <div class="card-list">
        ${farms.map(f => `
          <div class="card">
            <h3 class="card-title">${Utils.esc(f.name)}</h3>
            <p class="card-sub">${Utils.esc(f.address || 'Adresse non renseignée')}</p>
            <div class="card-row"><span>Responsable</span><strong>${Utils.esc(f.responsable || '—')}</strong></div>
            <div class="card-row"><span>Téléphone</span><strong>${Utils.esc(f.phone || '—')}</strong></div>
            <div class="card-row"><span>Couveuses</span><strong>${Utils.fmtNum(f.couveuses || 0)}</strong></div>
            <div class="card-actions">
              <button class="btn btn-sm" onclick="Farms.editForm('${f.id}')">✏️ Modifier</button>
              <button class="btn btn-sm btn-danger" onclick="Farms.remove('${f.id}')">🗑️ Supprimer</button>
            </div>
          </div>
        `).join('')}
      </div>`;
  },

  createForm(existing = {}) {
    Utils.modal({
      title: existing.id ? 'Modifier la ferme' : 'Nouvelle ferme',
      body: `
        <form id="farm-form" class="flex-col gap-3">
          <label class="field"><span>Nom *</span><input name="name" required value="${Utils.esc(existing.name || '')}" /></label>
          <label class="field"><span>Adresse</span><input name="address" value="${Utils.esc(existing.address || '')}" /></label>
          <label class="field"><span>Responsable</span><input name="responsable" value="${Utils.esc(existing.responsable || '')}" /></label>
          <label class="field"><span>Téléphone</span><input name="phone" value="${Utils.esc(existing.phone || '')}" /></label>
          <label class="field"><span>Nombre de couveuses</span><input type="number" min="0" name="couveuses" value="${existing.couveuses || 0}" /></label>
        </form>`,
      footer: `
        <button class="btn" data-close>Annuler</button>
        <button class="btn btn-primary" id="farm-save">Enregistrer</button>`
    });
    setTimeout(() => {
      document.getElementById('farm-save').onclick = () => Farms.save(existing.id || null);
    }, 50);
  },

  editForm(id) { this.createForm({ id, ...State.farms[id] }); },

  async save(id) {
    const f = document.getElementById('farm-form');
    const data = {
      name: f.name.value.trim(),
      address: f.address.value.trim(),
      responsable: f.responsable.value.trim(),
      phone: f.phone.value.trim(),
      couveuses: parseInt(f.couveuses.value || 0, 10),
      ownerUid: id ? State.farms[id].ownerUid : State.user.uid,
      updatedAt: Date.now()
    };
    if (!data.name) { Utils.toast('Le nom est obligatoire', 'warning'); return; }
    if (id) {
      await db.ref(`farms/${id}`).update(data);
    } else {
      data.createdAt = Date.now();
      const newId = db.ref('farms').push().key;
      await db.ref(`farms/${newId}`).set(data);
    }
    document.getElementById('modal').classList.add('hidden');
    Utils.toast('Ferme enregistrée', 'success');
    App.go('farms');
  },

  async remove(id) {
    Utils.confirm('Supprimer cette ferme ? Les lots associés resteront en base.', async () => {
      await db.ref(`farms/${id}`).remove();
      Utils.toast('Ferme supprimée', 'success');
    });
  }
};

/* =========================================================================
 * 7. MODULE 2 — GESTION DES LOTS
 * ========================================================================= */
const Lots = {

  list() {
    const lots = Object.entries(State.lots).map(([id, l]) => ({ id, ...l }));
    if (!lots.length) return `<div class="empty"><div class="empty-icon">📦</div><h3>Aucun lot</h3><p>Créez votre premier lot de couvaison.</p></div>`;
    // Tri : actifs d'abord (par date collecte desc), puis terminés
    lots.sort((a, b) => {
      if (a.status === b.status) return (b.collectDate || '').localeCompare(a.collectDate || '');
      return a.status === 'active' ? -1 : 1;
    });
    return `
      <div class="card-list">
        ${lots.map(l => this.card(l)).join('')}
      </div>`;
  },

  card(l) {
    const farm = State.farms[l.farmId];
    const score = Score.compute(l);
    const scoreClass = score >= 80 ? 'badge-excellent' : score >= 50 ? 'badge-watch' : 'badge-intervention';
    const scoreLabel = score >= 80 ? '🟢 Excellent' : score >= 50 ? '🟡 Surveillance' : '🔴 Intervention';
    const stage = this.currentStage(l);
    return `
      <div class="card">
        <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:8px">
          <div>
            <h3 class="card-title">Lot ${Utils.esc(l.number)} — ${Utils.esc(l.race)}</h3>
            <p class="card-sub">${Utils.esc(farm ? farm.name : 'Ferme inconnue')}</p>
          </div>
          <span class="badge ${l.status === 'active' ? 'badge-info' : 'badge-neutral'}">${l.status === 'active' ? 'Actif' : 'Terminé'}</span>
        </div>
        <div class="card-row"><span>Responsable</span><strong>${Utils.esc(l.responsable || '—')}</strong></div>
        <div class="card-row"><span>Collecte</span><strong>${Utils.fmtDate(l.collectDate)}</strong></div>
        <div class="card-row"><span>Incubation</span><strong>${Utils.fmtDate(l.incubationDate)}</strong></div>
        <div class="card-row"><span>Œufs collectés</span><strong>${Utils.fmtNum(l.qtyCollected || 0)}</strong></div>
        <div class="card-row"><span>Score santé</span><span class="badge ${scoreClass}">${scoreLabel} (${score}/100)</span></div>
        ${stage ? `<div class="alert alert-info mt-2">Étape actuelle : <strong>${stage}</strong></div>` : ''}
        <div class="card-actions">
          <button class="btn btn-sm btn-primary" onclick="Lots.open('${l.id}')">📋 Détails</button>
          <button class="btn btn-sm" onclick="Lots.editForm('${l.id}')">✏️ Modifier</button>
          <button class="btn btn-sm btn-danger" onclick="Lots.remove('${l.id}')">🗑️</button>
        </div>
      </div>`;
  },

  /** Détermine l'étape en cours d'un lot. */
  currentStage(l) {
    if (!l.stages) return 'Collecte J0';
    if (!l.stages.j0) return 'Collecte J0';
    if (!l.stages.j7) return 'Mirage J7';
    if (!l.stages.j14) return 'Mirage J14';
    if (!l.stages.hatch) return 'Éclosion';
    return 'Lot terminé';
  },

  createForm(existing = {}) {
    const farms = Object.entries(State.farms).map(([id, f]) => `<option value="${id}" ${existing.farmId === id ? 'selected' : ''}>${Utils.esc(f.name)}</option>`).join('');
    Utils.modal({
      title: existing.id ? 'Modifier le lot' : 'Nouveau lot',
      body: `
        <form id="lot-form" class="flex-col gap-3">
          <label class="field"><span>Ferme *</span><select name="farmId" required>${farms || '<option value="">Créez d\'abord une ferme</option>'}</select></label>
          <label class="field"><span>Race *</span>
            <select name="race" required>
              ${RACES.map(r => `<option ${existing.race === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
          </label>
          <label class="field"><span>Responsable</span><input name="responsable" value="${Utils.esc(existing.responsable || State.user.displayName || '')}" /></label>
          <label class="field"><span>Date collecte *</span><input type="date" name="collectDate" required value="${existing.collectDate || Utils.todayISO()}" /></label>
          <label class="field"><span>Date entrée incubation</span><input type="date" name="incubationDate" value="${existing.incubationDate || Utils.todayISO()}" /></label>
        </form>`,
      footer: `
        <button class="btn" data-close>Annuler</button>
        <button class="btn btn-primary" id="lot-save">Créer le lot</button>`
    });
    setTimeout(() => {
      document.getElementById('lot-save').onclick = () => Lots.save(existing.id || null);
    }, 50);
  },

  editForm(id) { this.createForm({ id, ...State.lots[id] }); },

  async save(id) {
    const f = document.getElementById('lot-form');
    if (!f.farmId.value) { Utils.toast('Créez d\'abord une ferme', 'warning'); return; }
    const data = {
      farmId: f.farmId.value,
      race: f.race.value,
      responsable: f.responsable.value.trim(),
      collectDate: f.collectDate.value,
      incubationDate: f.incubationDate.value,
      status: id ? State.lots[id].status : 'active',
      updatedAt: Date.now()
    };
    if (id) {
      await db.ref(`lots/${id}`).update(data);
    } else {
      // Numéro automatique : LOT-<numéro séquentiel>
      const yearShort = new Date().getFullYear().toString().slice(-2);
      const existingNumbers = Object.values(State.lots)
        .map(l => l.number)
        .filter(n => n && n.endsWith(`-${yearShort}`))
        .map(n => parseInt(n.split('-')[1], 10) || 0);
      const next = (existingNumbers.length ? Math.max(...existingNumbers) : 0) + 1;
      const pad = String(next).padStart(3, '0');
      data.number = `LOT-${pad}-${yearShort}`;
      data.createdAt = Date.now();
      data.stages = { j0: null, j7: null, j14: null, hatch: null };
      data.photos  = { j0: null, j7: null, j14: null, hatch: null };
      data.economics = { expenses: {}, revenue: {} };
      const newId = db.ref('lots').push().key;
      await db.ref(`lots/${newId}`).set(data);
    }
    document.getElementById('modal').classList.add('hidden');
    Utils.toast('Lot enregistré', 'success');
    App.go('lots');
  },

  async remove(id) {
    Utils.confirm('Supprimer définitivement ce lot ?', async () => {
      await db.ref(`lots/${id}`).remove();
      Utils.toast('Lot supprimé', 'success');
    });
  },

  /** Ouvre le détail d'un lot (toutes les étapes + scoring + actions). */
  open(id) {
    const l = State.lots[id];
    if (!l) return;
    const stages = l.stages || {};
    const photos = l.photos || {};
    const anomalies = Anomalies.check(l);
    const score = Score.compute(l);
    const scoreColor = score >= 80 ? 'var(--c-excellent)' : score >= 50 ? 'var(--c-watch)' : 'var(--c-intervention)';

    const stageHTML = (key, label, j) => {
      const data = stages[key];
      const hasData = !!data;
      const locked = this.isLocked(l, j);
      const photo = photos[key];
      return `
        <div class="card">
          <div class="flex" style="justify-content:space-between;align-items:center">
            <h3 class="card-title">${label} ${locked ? '🔒' : ''}</h3>
            <span class="badge ${hasData ? 'badge-excellent' : 'badge-neutral'}">${hasData ? '✓ Réalisé' : 'À faire'}</span>
          </div>
          ${hasData ? this.renderStageData(key, data) : ''}
          ${!locked ? `
            <div class="card-actions">
              <button class="btn btn-sm btn-primary" onclick="Stages.fillForm('${id}','${key}',${j})">
                ${hasData ? '✏️ Modifier' : '➕ Saisir'}
              </button>
            </div>` : '<p class="text-muted fs-xs mt-2">🔒 Étape verrouillée.</p>'}
          ${photo ? `<div class="card-actions"><button class="btn btn-sm" onclick="Photos.view('${photo}')">📷 Voir la photo</button></div>` : ''}
        </div>`;
    };

    const messages = Object.entries(State.messages)
      .filter(([_, m]) => m.lotId === id)
      .sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));

    document.getElementById('app-content').innerHTML = `
      <div class="view-header">
        <div>
          <button class="btn btn-sm" onclick="App.go('lots')">← Retour</button>
          <h2 class="mt-2">${Utils.esc(l.number)} — ${Utils.esc(l.race)}</h2>
          <p class="view-subtitle">Créé le ${Utils.fmtDate(l.createdAt)} · ${Utils.esc(State.farms[l.farmId]?.name || '')}</p>
        </div>
        <div class="flex gap-2" style="align-items:center">
          <div class="score-circle" style="background:${scoreColor}">${score}</div>
        </div>
      </div>

      <div class="stage-tracker">
        <div class="stage-step ${stages.j0   ? 'done' : 'current'}">J0 Collecte</div>
        <div class="stage-step ${stages.j7   ? 'done' : (stages.j0 ? 'current' : '')}">J7 Mirage</div>
        <div class="stage-step ${stages.j14  ? 'done' : (stages.j7 ? 'current' : '')}">J14 Mirage</div>
        <div class="stage-step ${stages.hatch ? 'done' : (stages.j14 ? 'current' : '')}">Éclosion</div>
      </div>

      ${anomalies.length ? `<div class="alert alert-danger">⚠️ Anomalies détectées : <ul style="margin:6px 0 0 18px">${anomalies.map(a => `<li>${Utils.esc(a)}</li>`).join('')}</ul></div>` : ''}

      <div class="grid-2">
        ${stageHTML('j0',    'Étape 1 — Collecte J0', 0)}
        ${stageHTML('j7',    'Étape 2 — Mirage J7',    7)}
        ${stageHTML('j14',   'Étape 3 — Mirage J14',  14)}
        ${stageHTML('hatch', 'Étape 4 — Éclosion',   21)}
      </div>

      <div class="card">
        <h3 class="card-title">💰 Économie du lot</h3>
        ${Economics.renderSummary(l.economics || {})}
        <div class="card-actions">
          <button class="btn btn-sm" onclick="Economics.form('${id}')">💰 Saisir coûts / recettes</button>
          <button class="btn btn-sm" onclick="Reports.generatePDF('${id}')">📄 Exporter PDF</button>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">💬 Messagerie du lot</h3>
        <div class="chat-list" id="chat-${id}">
          ${messages.length ? messages.map(([mid, m]) => Messaging.bubble(mid, m)).join('') : '<p class="text-muted text-center">Aucun message. Démarrez la conversation.</p>'}
        </div>
        <form class="flex gap-2 mt-2" onsubmit="Messaging.send(event,'${id}')">
          <input class="w-full" placeholder="Écrire un message…" required name="text" />
          <button class="btn btn-primary" type="submit">Envoyer</button>
        </form>
      </div>
    `;
  },

  renderStageData(key, data) {
    if (key === 'j0') {
      return `
        <div class="card-row"><span>Quantité collectée</span><strong>${Utils.fmtNum(data.qty)}</strong></div>
        <div class="card-row"><span>Œufs fissurés</span><strong>${Utils.fmtNum(data.cracked)}</strong></div>
        <div class="card-row"><span>Œufs bons</span><strong>${Utils.fmtNum(data.bons)}</strong></div>
        <div class="card-row"><span>Date</span><strong>${Utils.fmtDate(data.date)}</strong></div>`;
    }
    if (key === 'j7' || key === 'j14') {
      return `
        <div class="card-row"><span>Clairs</span><strong>${Utils.fmtNum(data.clairs)}</strong></div>
        <div class="card-row"><span>Mortalité</span><strong>${Utils.fmtNum(data.mortality)}</strong></div>
        <div class="card-row"><span>Fécondés</span><strong>${Utils.fmtNum(data.fertile)}</strong></div>
        <div class="card-row"><span>Date</span><strong>${Utils.fmtDate(data.date)}</strong></div>`;
    }
    if (key === 'hatch') {
      return `
        <div class="card-row"><span>Malades</span><strong>${Utils.fmtNum(data.sick)}</strong></div>
        <div class="card-row"><span>Mort-nés</span><strong>${Utils.fmtNum(data.stillborn)}</strong></div>
        <div class="card-row"><span>Poussins obtenus</span><strong>${Utils.fmtNum(data.chicks)}</strong></div>
        <div class="card-row"><span>Date</span><strong>${Utils.fmtDate(data.date)}</strong></div>`;
    }
    return '';
  },

  /** Une étape est verrouillée si l'étape précédente n'est pas validée. */
  isLocked(lot, j) {
    const s = lot.stages || {};
    if (j === 0)  return false;
    if (j === 7)  return !s.j0;
    if (j === 14) return !s.j7;
    if (j === 21) return !s.j14;
    return false;
  }
};

/* =========================================================================
 * 8. MODULE 3 — SUIVI DE COUVAISON (formulaires par étape)
 * ========================================================================= */
const Stages = {

  fillForm(lotId, key, j) {
    const lot = State.lots[lotId];
    const existing = (lot.stages || {})[key] || {};
    let body = '';
    if (key === 'j0') {
      body = `
        <form id="stage-form" class="flex-col gap-3">
          <label class="field"><span>Quantité collectée *</span><input type="number" min="0" name="qty" required value="${existing.qty || ''}" /></label>
          <label class="field"><span>Œufs fissurés</span><input type="number" min="0" name="cracked" value="${existing.cracked || 0}" /></label>
          <label class="field"><span>Date *</span><input type="date" name="date" required value="${existing.date || Utils.todayISO()}" /></label>
          <p class="text-muted fs-sm">Les œufs <strong>bons</strong> seront calculés automatiquement (collectés − fissurés).</p>
          <label class="field"><span>Photo preuve</span>
            <input type="file" accept="image/*" capture="environment" id="stage-photo" />
            <label for="stage-photo" class="photo-tile" id="photo-tile">📷 Choisir / capturer une photo</label>
          </label>
        </form>`;
    } else if (key === 'j7' || key === 'j14') {
      body = `
        <form id="stage-form" class="flex-col gap-3">
          <label class="field"><span>Œufs clairs</span><input type="number" min="0" name="clairs" value="${existing.clairs || 0}" /></label>
          <label class="field"><span>Mortalité</span><input type="number" min="0" name="mortality" value="${existing.mortality || 0}" /></label>
          <label class="field"><span>Date *</span><input type="date" name="date" required value="${existing.date || Utils.todayISO()}" /></label>
          <p class="text-muted fs-sm">Les <strong>fécondés</strong> sont calculés automatiquement.</p>
          <label class="field"><span>Photo obligatoire</span>
            <input type="file" accept="image/*" capture="environment" id="stage-photo" required />
            <label for="stage-photo" class="photo-tile" id="photo-tile">📷 Choisir / capturer une photo</label>
          </label>
        </form>`;
    } else if (key === 'hatch') {
      body = `
        <form id="stage-form" class="flex-col gap-3">
          <label class="field"><span>Malades</span><input type="number" min="0" name="sick" value="${existing.sick || 0}" /></label>
          <label class="field"><span>Mort-nés</span><input type="number" min="0" name="stillborn" value="${existing.stillborn || 0}" /></label>
          <label class="field"><span>Date *</span><input type="date" name="date" required value="${existing.date || Utils.todayISO()}" /></label>
          <label class="field"><span>Photo finale obligatoire</span>
            <input type="file" accept="image/*" capture="environment" id="stage-photo" required />
            <label for="stage-photo" class="photo-tile" id="photo-tile">📷 Choisir / capturer une photo</label>
          </label>
        </form>`;
    }

    Utils.modal({
      title: `Saisir l'étape ${key.toUpperCase()}`,
      body,
      footer: `<button class="btn" data-close>Annuler</button>
               <button class="btn btn-primary" id="stage-save">Valider 🔒</button>`
    });

    // Prévisualisation de la photo
    setTimeout(() => {
      const input = document.getElementById('stage-photo');
      const tile  = document.getElementById('photo-tile');
      input.onchange = () => {
        const f = input.files[0]; if (!f) return;
        const reader = new FileReader();
        reader.onload = e => {
          tile.innerHTML = `<img src="${e.target.result}" alt="aperçu" />`;
          tile.classList.add('has-image');
        };
        reader.readAsDataURL(f);
      };
      document.getElementById('stage-save').onclick = () => Stages.save(lotId, key);
    }, 50);
  },

  async save(lotId, key) {
    const form = document.getElementById('stage-form');
    const lot = State.lots[lotId];
    const previous = (lot.stages || {})[key] || {};
    const data = { ...previous, ts: Date.now() };
    let bons = previous.bons, fertile = previous.fertile, chicks = previous.chicks;

    if (key === 'j0') {
      data.qty = parseInt(form.qty.value, 10) || 0;
      data.cracked = parseInt(form.cracked.value, 10) || 0;
      data.date = form.date.value;
      bons = data.qty - data.cracked;
      if (bons < 0) { Utils.toast('Erreur : les fissurés ne peuvent pas dépasser la quantité collectée', 'danger'); return; }
      data.bons = bons;
      data.locked = true;
    } else if (key === 'j7') {
      const baseBons = (lot.stages.j0 || {}).bons || 0;
      data.clairs = parseInt(form.clairs.value, 10) || 0;
      data.mortality = parseInt(form.mortality.value, 10) || 0;
      data.date = form.date.value;
      fertile = baseBons - data.clairs - data.mortality;
      if (fertile < 0) { Utils.toast('Erreur : Fécondés J7 négatif', 'danger'); return; }
      data.fertile = fertile;
      data.locked = true;
    } else if (key === 'j14') {
      const baseFertile = (lot.stages.j7 || {}).fertile || 0;
      data.clairs = parseInt(form.clairs.value, 10) || 0;
      data.mortality = parseInt(form.mortality.value, 10) || 0;
      data.date = form.date.value;
      fertile = baseFertile - data.clairs - data.mortality;
      if (fertile < 0) { Utils.toast('Erreur : Fécondés J14 négatif', 'danger'); return; }
      data.fertile = fertile;
      data.locked = true;
    } else if (key === 'hatch') {
      const baseFertile = (lot.stages.j14 || {}).fertile || 0;
      data.sick = parseInt(form.sick.value, 10) || 0;
      data.stillborn = parseInt(form.stillborn.value, 10) || 0;
      data.date = form.date.value;
      chicks = baseFertile - data.sick - data.stillborn;
      if (chicks < 0) { Utils.toast('Erreur : Poussins négatif', 'danger'); return; }
      data.chicks = chicks;
      data.locked = true;
      // Marquer le lot comme terminé
      await db.ref(`lots/${lotId}/status`).set('finished');
      await db.ref(`lots/${lotId}/finishedAt`).set(Date.now());
    }

    // Photo obligatoire pour j7/j14/hatch
    const input = document.getElementById('stage-photo');
    if (input && input.files && input.files[0]) {
      try {
        Utils.toast('Compression & upload de la photo…', 'info', 2000);
        const blob = await Utils.compressImage(input.files[0]);
        const path = `lots/${lotId}/${key}-${Date.now()}.jpg`;
        const ref = store.ref().child(path);
        await ref.put(blob);
        const url = await ref.getDownloadURL();
        await db.ref(`lots/${lotId}/photos/${key}`).set(url);
      } catch (err) {
        Utils.toast('Erreur upload photo : ' + err.message, 'danger');
        return;
      }
    } else if (key !== 'j0') {
      Utils.toast('Photo obligatoire pour cette étape', 'warning');
      return;
    }

    // Persist + maj locale
    await db.ref(`lots/${lotId}/stages/${key}`).set(data);
    Utils.toast('Étape validée 🔒', 'success');
    document.getElementById('modal').classList.add('hidden');
    Lots.open(lotId);
  }
};

/* =========================================================================
 * 9. MODULE 4 — TABLEAU DE BORD 360°
 * ========================================================================= */
const Dashboard = {
  render() {
    const lots = Object.values(State.lots);
    const active = lots.filter(l => l.status === 'active');
    const finished = lots.filter(l => l.status === 'finished');
    const eggs = lots.reduce((s, l) => s + ((l.stages || {}).j0?.qty || 0), 0);
    const chicks = lots.reduce((s, l) => s + ((l.stages || {}).hatch?.chicks || 0), 0);
    const losses = eggs - chicks;
    const success = eggs ? Math.round(chicks * 100 / eggs) : 0;
    const anomaliesCount = lots.reduce((s, l) => s + Anomalies.check(l).length, 0);
    const lowStock = Object.values(State.stocks).filter(s => (s.qty || 0) <= (s.minQty || 0)).length;

    // Meilleures fermes (par taux de réussite)
    const farmsRanking = Object.values(State.farms).map(f => {
      const fLots = lots.filter(l => l.farmId === f.id);
      const fEggs = fLots.reduce((s, l) => s + ((l.stages || {}).j0?.qty || 0), 0);
      const fChicks = fLots.reduce((s, l) => s + ((l.stages || {}).hatch?.chicks || 0), 0);
      return { name: f.name, success: fEggs ? Math.round(fChicks * 100 / fEggs) : 0, lots: fLots.length };
    }).sort((a, b) => b.success - a.success).slice(0, 5);

    document.getElementById('app-content').innerHTML = `
      <div class="view-header">
        <div>
          <h2>Tableau de bord 360°</h2>
          <p class="view-subtitle">Bonjour ${Utils.esc(State.user.displayName || '')}, voici l'état de vos fermes.</p>
        </div>
        <button class="btn btn-primary" onclick="Lots.createForm()">➕ Nouveau lot</button>
      </div>

      <div class="grid-4">
        <div class="stat-card">
          <span class="stat-label">Lots actifs</span>
          <span class="stat-value">${active.length}</span>
          <span class="stat-help">${finished.length} terminés</span>
        </div>
        <div class="stat-card accent">
          <span class="stat-label">Œufs collectés</span>
          <span class="stat-value">${Utils.fmtNum(eggs)}</span>
          <span class="stat-help">tous lots confondus</span>
        </div>
        <div class="stat-card info">
          <span class="stat-label">Poussins obtenus</span>
          <span class="stat-value">${Utils.fmtNum(chicks)}</span>
          <span class="stat-help">${success}% de réussite</span>
        </div>
        <div class="stat-card danger">
          <span class="stat-label">Pertes</span>
          <span class="stat-value">${Utils.fmtNum(losses)}</span>
          <span class="stat-help">${anomaliesCount} anomalie(s)</span>
        </div>
      </div>

      ${anomaliesCount > 0 ? `<div class="alert alert-warning mt-3">⚠️ ${anomaliesCount} anomalie(s) détectée(s) sur vos lots. <a href="#" onclick="App.go('lots')">Voir les lots</a></div>` : ''}
      ${lowStock > 0  ? `<div class="alert alert-danger mt-2">📦 ${lowStock} stock(s) en dessous du seuil. <a href="#" onclick="App.go('stocks')">Gérer</a></div>` : ''}

      <div class="grid-2 mt-3">
        <div class="card">
          <h3 class="card-title">📈 Fertilité / Mortalité / Éclosion</h3>
          <canvas id="chart-success" height="180"></canvas>
        </div>
        <div class="card">
          <h3 class="card-title">🏆 Top fermes</h3>
          ${farmsRanking.length ? farmsRanking.map((f, i) => `
            <div class="card-row">
              <span>${i + 1}. ${Utils.esc(f.name)}</span>
              <span class="chip ${f.success >= 70 ? 'chip-success' : f.success >= 40 ? 'chip-warning' : 'chip-danger'}">${f.success}% · ${f.lots} lot(s)</span>
            </div>`).join('') : '<p class="text-muted text-center">Aucune donnée.</p>'}
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">💰 Rentabilité globale</h3>
        <canvas id="chart-rentability" height="160"></canvas>
      </div>

      <div class="card">
        <h3 class="card-title">📅 Activité récente</h3>
        ${this.recentActivity()}
      </div>
    `;

    this.drawCharts();
  },

  recentActivity() {
    const all = [];
    Object.values(State.lots).forEach(l => {
      Object.entries(l.stages || {}).forEach(([k, s]) => {
        if (s && s.ts) all.push({ ts: s.ts, label: `Lot ${l.number} — étape ${k.toUpperCase()}`, icon: k === 'hatch' ? '🐣' : k === 'j0' ? '🥚' : '🔍' });
      });
    });
    Object.values(State.messages).forEach(m => {
      all.push({ ts: m.ts, label: `Message de ${m.fromName || '—'}`, icon: '💬' });
    });
    all.sort((a, b) => b.ts - a.ts);
    const top = all.slice(0, 8);
    if (!top.length) return '<p class="text-muted text-center">Aucune activité récente.</p>';
    return `<div class="card-list">${top.map(t => `
      <div class="list-item">
        <div class="li-main"><span class="li-title">${t.icon} ${Utils.esc(t.label)}</span><div class="li-sub">${Utils.fmtDateTime(t.ts)}</div></div>
      </div>`).join('')}</div>`;
  },

  drawCharts() {
    if (typeof Chart === 'undefined') return;
    Object.values(State.charts).forEach(c => c.destroy && c.destroy());
    State.charts = {};

    // Graph 1 : agrégats globaux (donut)
    const lots = Object.values(State.lots);
    const eggs  = lots.reduce((s, l) => s + ((l.stages || {}).j0?.qty || 0), 0);
    const fertileJ7 = lots.reduce((s, l) => s + ((l.stages || {}).j7?.fertile || 0), 0);
    const fertileJ14 = lots.reduce((s, l) => s + ((l.stages || {}).j14?.fertile || 0), 0);
    const chicks = lots.reduce((s, l) => s + ((l.stages || {}).hatch?.chicks || 0), 0);
    const c1 = document.getElementById('chart-success');
    if (c1) {
      State.charts.success = new Chart(c1, {
        type: 'bar',
        data: {
          labels: ['Œufs collectés', 'Fécondés J7', 'Fécondés J14', 'Poussins'],
          datasets: [{ label: 'Quantité', data: [eggs, fertileJ7, fertileJ14, chicks],
            backgroundColor: ['#16a34a', '#0ea5e9', '#f59e0b', '#22c55e'] }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
      });
    }

    // Graph 2 : rentabilité
    const c2 = document.getElementById('chart-rentability');
    if (c2) {
      const totals = Economics.aggregate();
      State.charts.rent = new Chart(c2, {
        type: 'doughnut',
        data: {
          labels: ['Recettes', 'Coûts'],
          datasets: [{ data: [totals.revenue, totals.cost], backgroundColor: ['#16a34a', '#dc2626'] }]
        },
        options: { responsive: true }
      });
    }
  }
};

/* =========================================================================
 * 10. MODULE 5 — CALENDRIER INTELLIGENT
 * ========================================================================= */
const Calendar = {
  render() {
    const events = [];
    Object.values(State.lots).forEach(l => {
      if (l.status !== 'active') return;
      if (l.collectDate) {
        events.push({ date: l.collectDate, label: `🥚 Lot ${l.number} — Collecte J0`, icon: '🥚', lot: l });
      }
      if (l.incubationDate) {
        const j7  = Utils.addDaysISO(l.incubationDate, 7);
        const j14 = Utils.addDaysISO(l.incubationDate, 14);
        const j21 = Utils.addDaysISO(l.incubationDate, 21);
        events.push({ date: j7,  label: `🔍 Lot ${l.number} — Mirage J7`,  icon: '🔍', lot: l });
        events.push({ date: j14, label: `🔍 Lot ${l.number} — Mirage J14`, icon: '🔍', lot: l });
        events.push({ date: j21, label: `🐣 Lot ${l.number} — Éclosion`,    icon: '🐣', lot: l });
      }
    });
    events.sort((a, b) => a.date.localeCompare(b.date));

    // Regroupement par date
    const byDate = {};
    events.forEach(e => { (byDate[e.date] = byDate[e.date] || []).push(e); });

    const today = Utils.todayISO();
    const html = Object.keys(byDate).sort().map(date => {
      const days = Utils.daysBetween(today, date);
      const tag = days < 0 ? '<span class="chip chip-danger">En retard</span>'
                : days === 0 ? '<span class="chip chip-warning">Aujourd\'hui</span>'
                : days <= 3 ? `<span class="chip chip-warning">Dans ${days}j</span>`
                : `<span class="chip">Dans ${days}j</span>`;
      return `
        <div class="card">
          <div class="flex" style="justify-content:space-between;align-items:center">
            <h3 class="card-title">📅 ${Utils.fmtDate(date)}</h3>
            ${tag}
          </div>
          ${byDate[date].map(e => `
            <div class="list-item" style="cursor:pointer" onclick="Lots.open('${e.lot.id}')">
              <div class="li-main"><span class="li-title">${e.icon} ${Utils.esc(e.label)}</span></div>
              <span>→</span>
            </div>`).join('')}
        </div>`;
    }).join('');

    document.getElementById('app-content').innerHTML = `
      <div class="view-header">
        <div><h2>📅 Calendrier intelligent</h2><p class="view-subtitle">Prochaines étapes & alertes</p></div>
      </div>
      ${html || '<div class="empty"><div class="empty-icon">📅</div><h3>Aucun événement</h3><p>Créez un lot pour voir le planning.</p></div>'}
    `;
  }
};

/* =========================================================================
 * 11. MODULE 6 — GESTION ÉCONOMIQUE
 * ========================================================================= */
const Economics = {

  aggregate() {
    let cost = 0, revenue = 0;
    Object.values(State.lots).forEach(l => {
      const e = l.economics || {};
      Object.values(e.expenses || {}).forEach(v => cost += parseFloat(v) || 0);
      Object.values(e.revenue  || {}).forEach(v => revenue += parseFloat(v) || 0);
    });
    return { cost, revenue, margin: revenue - cost };
  },

  renderSummary(e) {
    const exp = e.expenses || {};
    const rev = e.revenue || {};
    const totalExp = Object.values(exp).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const totalRev = Object.values(rev).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    return `
      <div class="card-row"><span>🥚 Achat œufs</span><strong>${Utils.fmtMoney(exp.eggs || 0)}</strong></div>
      <div class="card-row"><span>🌾 Alimentation</span><strong>${Utils.fmtMoney(exp.feed || 0)}</strong></div>
      <div class="card-row"><span>⚡ Électricité</span><strong>${Utils.fmtMoney(exp.electricity || 0)}</strong></div>
      <div class="card-row"><span>👷 Main-d'œuvre</span><strong>${Utils.fmtMoney(exp.labor || 0)}</strong></div>
      <div class="card-row"><span>📦 Autres charges</span><strong>${Utils.fmtMoney(exp.other || 0)}</strong></div>
      <div class="divider"></div>
      <div class="card-row"><span>💸 Coût total</span><strong>${Utils.fmtMoney(totalExp)}</strong></div>
      <div class="card-row"><span>💵 Recettes</span><strong>${Utils.fmtMoney(totalRev)}</strong></div>
      <div class="card-row"><span>📈 Marge estimée</span><strong style="color:${totalRev - totalExp >= 0 ? 'var(--c-success)' : 'var(--c-danger)'}">${Utils.fmtMoney(totalRev - totalExp)}</strong></div>
    `;
  },

  form(lotId) {
    const lot = State.lots[lotId];
    const e = (lot.economics || { expenses: {}, revenue: {} });
    const exp = e.expenses || {};
    const rev = e.revenue || {};
    Utils.modal({
      title: 'Économie du lot ' + lot.number,
      body: `
        <form id="eco-form" class="flex-col gap-3">
          <h4 style="margin:0">Dépenses</h4>
          <label class="field"><span>Achat œufs</span><input type="number" min="0" name="eggs"        value="${exp.eggs || 0}" /></label>
          <label class="field"><span>Alimentation</span><input type="number" min="0" name="feed"         value="${exp.feed || 0}" /></label>
          <label class="field"><span>Électricité</span><input type="number" min="0" name="electricity"  value="${exp.electricity || 0}" /></label>
          <label class="field"><span>Main-d'œuvre</span><input type="number" min="0" name="labor"        value="${exp.labor || 0}" /></label>
          <label class="field"><span>Autres charges</span><input type="number" min="0" name="other"        value="${exp.other || 0}" /></label>
          <h4 style="margin:8px 0 0">Recettes</h4>
          <label class="field"><span>Nombre poussins vendus</span><input type="number" min="0" name="chicksSold" value="${rev.chicksSold || 0}" /></label>
          <label class="field"><span>Prix unitaire (FCFA)</span><input type="number" min="0" name="unitPrice"  value="${rev.unitPrice || 0}" /></label>
        </form>`,
      footer: `<button class="btn" data-close>Annuler</button>
               <button class="btn btn-primary" id="eco-save">Enregistrer</button>`
    });
    setTimeout(() => {
      document.getElementById('eco-save').onclick = () => Economics.save(lotId);
    }, 50);
  },

  save(lotId) {
    const f = document.getElementById('eco-form');
    const expenses = {
      eggs: parseFloat(f.eggs.value) || 0,
      feed: parseFloat(f.feed.value) || 0,
      electricity: parseFloat(f.electricity.value) || 0,
      labor: parseFloat(f.labor.value) || 0,
      other: parseFloat(f.other.value) || 0
    };
    const chicksSold = parseInt(f.chicksSold.value, 10) || 0;
    const unitPrice  = parseFloat(f.unitPrice.value) || 0;
    const revenue = { chicksSold, unitPrice, total: chicksSold * unitPrice };
    db.ref(`lots/${lotId}/economics`).set({ expenses, revenue, updatedAt: Date.now() });
    document.getElementById('modal').classList.add('hidden');
    Utils.toast('Économie enregistrée', 'success');
    Lots.open(lotId);
  },

  globalView() {
    const totals = this.aggregate();
    document.getElementById('app-content').innerHTML = `
      <div class="view-header"><h2>💰 Vue économique globale</h2></div>
      <div class="grid-3">
        <div class="stat-card accent"><span class="stat-label">Recettes</span><span class="stat-value">${Utils.fmtMoney(totals.revenue)}</span></div>
        <div class="stat-card danger"><span class="stat-label">Coûts</span><span class="stat-value">${Utils.fmtMoney(totals.cost)}</span></div>
        <div class="stat-card info"><span class="stat-label">Marge</span><span class="stat-value">${Utils.fmtMoney(totals.margin)}</span></div>
      </div>
      <div class="card mt-3">
        <h3 class="card-title">Détail par lot</h3>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Lot</th><th>Ferme</th><th>Coût</th><th>Recette</th><th>Marge</th></tr></thead>
          <tbody>
            ${Object.values(State.lots).map(l => {
              const t = (() => { const e = l.economics || {};
                const c = Object.values(e.expenses || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
                const r = Object.values(e.revenue || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
                return { c, r, m: r - c };
              })();
              return `<tr><td>${Utils.esc(l.number)}</td><td>${Utils.esc((State.farms[l.farmId] || {}).name || '—')}</td>
                <td>${Utils.fmtMoney(t.c)}</td><td>${Utils.fmtMoney(t.r)}</td>
                <td style="color:${t.m >= 0 ? 'var(--c-success)' : 'var(--c-danger)'}">${Utils.fmtMoney(t.m)}</td></tr>`;
            }).join('') || '<tr><td colspan="5" class="table-empty">Aucun lot.</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  }
};

/* =========================================================================
 * 12. MODULE 7 — GESTION DES STOCKS
 * ========================================================================= */
const Stocks = {
  render() {
    const stocks = Object.entries(State.stocks).map(([id, s]) => ({ id, ...s }));
    stocks.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const low = stocks.filter(s => (s.qty || 0) <= (s.minQty || 0));

    document.getElementById('app-content').innerHTML = `
      <div class="view-header">
        <div><h2>🧱 Stocks</h2><p class="view-subtitle">Suivi œufs, poussins, aliments, vaccins…</p></div>
        <button class="btn btn-primary" onclick="Stocks.form()">➕ Nouveau</button>
      </div>
      ${low.length ? `<div class="alert alert-danger">⚠️ Stock(s) sous le seuil : ${low.map(s => Utils.esc(s.name)).join(', ')}</div>` : ''}
      <div class="card">
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Article</th><th>Type</th><th>Quantité</th><th>Seuil min</th><th>État</th><th></th></tr></thead>
          <tbody>
            ${stocks.length ? stocks.map(s => {
              const isLow = (s.qty || 0) <= (s.minQty || 0);
              return `<tr>
                <td><strong>${Utils.esc(s.name)}</strong></td>
                <td>${Utils.esc(s.type || '—')}</td>
                <td>${Utils.fmtNum(s.qty || 0)} ${Utils.esc(s.unit || '')}</td>
                <td>${Utils.fmtNum(s.minQty || 0)}</td>
                <td>${isLow ? '<span class="chip chip-danger">Faible</span>' : '<span class="chip chip-success">OK</span>'}</td>
                <td>
                  <button class="btn btn-sm" onclick="Stocks.adjust('${s.id}', 1)">+1</button>
                  <button class="btn btn-sm" onclick="Stocks.adjust('${s.id}', -1)">-1</button>
                  <button class="btn btn-sm" onclick="Stocks.form('${s.id}')">✏️</button>
                  <button class="btn btn-sm btn-danger" onclick="Stocks.remove('${s.id}')">🗑️</button>
                </td>
              </tr>`;
            }).join('') : '<tr><td colspan="6" class="table-empty">Aucun stock.</td></tr>'}
          </tbody>
        </table></div>
      </div>
    `;
  },

  form(id) {
    const s = id ? State.stocks[id] : {};
    Utils.modal({
      title: id ? 'Modifier le stock' : 'Nouveau stock',
      body: `
        <form id="stock-form" class="flex-col gap-3">
          <label class="field"><span>Article *</span><input name="name" required value="${Utils.esc(s.name || '')}" /></label>
          <label class="field"><span>Type</span>
            <select name="type">
              <option ${s.type === 'Œufs' ? 'selected' : ''}>Œufs</option>
              <option ${s.type === 'Poussins' ? 'selected' : ''}>Poussins</option>
              <option ${s.type === 'Aliment' ? 'selected' : ''}>Aliment</option>
              <option ${s.type === 'Vaccin' ? 'selected' : ''}>Vaccin</option>
              <option ${s.type === 'Désinfectant' ? 'selected' : ''}>Désinfectant</option>
              <option ${s.type === 'Autre' ? 'selected' : ''}>Autre</option>
            </select>
          </label>
          <label class="field"><span>Quantité</span><input type="number" min="0" name="qty" value="${s.qty || 0}" /></label>
          <label class="field"><span>Unité</span><input name="unit" value="${Utils.esc(s.unit || 'unités')}" /></label>
          <label class="field"><span>Seuil minimum</span><input type="number" min="0" name="minQty" value="${s.minQty || 0}" /></label>
        </form>`,
      footer: `<button class="btn" data-close>Annuler</button>
               <button class="btn btn-primary" id="stock-save">Enregistrer</button>`
    });
    setTimeout(() => { document.getElementById('stock-save').onclick = () => Stocks.save(id || null); }, 50);
  },

  async save(id) {
    const f = document.getElementById('stock-form');
    const data = {
      name: f.name.value.trim(),
      type: f.type.value,
      qty: parseFloat(f.qty.value) || 0,
      unit: f.unit.value.trim(),
      minQty: parseFloat(f.minQty.value) || 0,
      farmId: State.user.farmId,
      updatedAt: Date.now()
    };
    if (!data.name) { Utils.toast('Nom requis', 'warning'); return; }
    if (id) await db.ref(`stocks/${id}`).update(data);
    else {
      data.createdAt = Date.now();
      const newId = db.ref('stocks').push().key;
      await db.ref(`stocks/${newId}`).set(data);
    }
    document.getElementById('modal').classList.add('hidden');
    Utils.toast('Stock enregistré', 'success');
  },

  adjust(id, delta) {
    const s = State.stocks[id];
    if (!s) return;
    const newQty = Math.max(0, (s.qty || 0) + delta);
    db.ref(`stocks/${id}/qty`).set(newQty);
  },

  remove(id) {
    Utils.confirm('Supprimer cet article de stock ?', async () => {
      await db.ref(`stocks/${id}`).remove();
      Utils.toast('Stock supprimé', 'success');
    });
  }
};

/* =========================================================================
 * 13. MODULE 8 — GESTION COMMERCIALE (clients + ventes)
 * ========================================================================= */
const Commercial = {
  render() {
    const clients = Object.entries(State.clients).map(([id, c]) => ({ id, ...c }));
    const sales   = Object.entries(State.sales).map(([id, s]) => ({ id, ...s }));
    sales.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const totalDue = sales.reduce((s, v) => s + ((v.qty * v.price) - (v.paid || 0)), 0);

    document.getElementById('app-content').innerHTML = `
      <div class="view-header">
        <div><h2>💼 Gestion commerciale</h2><p class="view-subtitle">Clients & ventes</p></div>
        <div class="flex gap-2">
          <button class="btn" onclick="Commercial.clientForm()">➕ Client</button>
          <button class="btn btn-primary" onclick="Commercial.saleForm()">➕ Vente</button>
        </div>
      </div>

      <div class="grid-3">
        <div class="stat-card"><span class="stat-label">Clients</span><span class="stat-value">${clients.length}</span></div>
        <div class="stat-card accent"><span class="stat-label">Ventes</span><span class="stat-value">${sales.length}</span></div>
        <div class="stat-card danger"><span class="stat-label">Reste dû</span><span class="stat-value">${Utils.fmtMoney(totalDue)}</span></div>
      </div>

      <div class="card mt-3">
        <h3 class="card-title">🧾 Ventes récentes</h3>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Date</th><th>Client</th><th>Article</th><th>Qté</th><th>PU</th><th>Total</th><th>Payé</th><th>Reste</th></tr></thead>
          <tbody>
            ${sales.length ? sales.map(s => {
              const c = State.clients[s.clientId];
              const total = s.qty * s.price;
              const reste = total - (s.paid || 0);
              return `<tr>
                <td>${Utils.fmtDate(s.date)}</td>
                <td>${Utils.esc(c ? c.name : '—')}</td>
                <td>${Utils.esc(s.item || '—')}</td>
                <td>${Utils.fmtNum(s.qty)}</td>
                <td>${Utils.fmtMoney(s.price)}</td>
                <td>${Utils.fmtMoney(total)}</td>
                <td>${Utils.fmtMoney(s.paid || 0)}</td>
                <td style="color:${reste > 0 ? 'var(--c-danger)' : 'var(--c-success)'}">${Utils.fmtMoney(reste)}</td>
              </tr>`;
            }).join('') : '<tr><td colspan="8" class="table-empty">Aucune vente.</td></tr>'}
          </tbody>
        </table></div>
      </div>

      <div class="card">
        <h3 class="card-title">👥 Clients</h3>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Nom</th><th>Téléphone</th><th>Achats cumulés</th><th></th></tr></thead>
          <tbody>
            ${clients.length ? clients.map(c => {
              const cSales = sales.filter(s => s.clientId === c.id);
              const cTotal = cSales.reduce((sum, s) => sum + (s.qty * s.price), 0);
              return `<tr>
                <td>${Utils.esc(c.name)}</td>
                <td>${Utils.esc(c.phone || '—')}</td>
                <td>${Utils.fmtMoney(cTotal)}</td>
                <td><button class="btn btn-sm btn-danger" onclick="Commercial.removeClient('${c.id}')">🗑️</button></td>
              </tr>`;
            }).join('') : '<tr><td colspan="4" class="table-empty">Aucun client.</td></tr>'}
          </tbody>
        </table></div>
      </div>
    `;
  },

  clientForm(id) {
    const c = id ? State.clients[id] : {};
    Utils.modal({
      title: id ? 'Modifier le client' : 'Nouveau client',
      body: `
        <form id="cli-form" class="flex-col gap-3">
          <label class="field"><span>Nom *</span><input name="name" required value="${Utils.esc(c.name || '')}" /></label>
          <label class="field"><span>Téléphone</span><input name="phone" value="${Utils.esc(c.phone || '')}" /></label>
          <label class="field"><span>Adresse</span><input name="address" value="${Utils.esc(c.address || '')}" /></label>
        </form>`,
      footer: `<button class="btn" data-close>Annuler</button>
               <button class="btn btn-primary" id="cli-save">Enregistrer</button>`
    });
    setTimeout(() => { document.getElementById('cli-save').onclick = () => Commercial.saveClient(id || null); }, 50);
  },

  saveClient(id) {
    const f = document.getElementById('cli-form');
    const data = {
      name: f.name.value.trim(),
      phone: f.phone.value.trim(),
      address: f.address.value.trim(),
      farmId: State.user.farmId,
      updatedAt: Date.now()
    };
    if (!data.name) { Utils.toast('Nom requis', 'warning'); return; }
    if (id) db.ref(`clients/${id}`).update(data);
    else {
      data.createdAt = Date.now();
      const newId = db.ref('clients').push().key;
      db.ref(`clients/${newId}`).set(data);
    }
    document.getElementById('modal').classList.add('hidden');
    Utils.toast('Client enregistré', 'success');
  },

  removeClient(id) {
    Utils.confirm('Supprimer ce client ?', async () => {
      await db.ref(`clients/${id}`).remove();
      Utils.toast('Client supprimé', 'success');
    });
  },

  saleForm() {
    const clients = Object.entries(State.clients).map(([id, c]) => `<option value="${id}">${Utils.esc(c.name)}</option>`).join('');
    Utils.modal({
      title: 'Nouvelle vente',
      body: `
        <form id="sale-form" class="flex-col gap-3">
          <label class="field"><span>Client *</span><select name="clientId" required>${clients || '<option>Aucun client</option>'}</select></label>
          <label class="field"><span>Article</span><input name="item" placeholder="Ex : Poussins chair" /></label>
          <label class="field"><span>Date *</span><input type="date" name="date" required value="${Utils.todayISO()}" /></label>
          <label class="field"><span>Quantité *</span><input type="number" min="1" name="qty" required /></label>
          <label class="field"><span>Prix unitaire *</span><input type="number" min="0" name="price" required /></label>
          <label class="field"><span>Montant payé</span><input type="number" min="0" name="paid" value="0" /></label>
        </form>`,
      footer: `<button class="btn" data-close>Annuler</button>
               <button class="btn btn-primary" id="sale-save">Enregistrer</button>`
    });
    setTimeout(() => { document.getElementById('sale-save').onclick = () => Commercial.saveSale(); }, 50);
  },

  saveSale() {
    const f = document.getElementById('sale-form');
    const data = {
      clientId: f.clientId.value,
      item: f.item.value.trim(),
      date: f.date.value,
      qty: parseInt(f.qty.value, 10) || 0,
      price: parseFloat(f.price.value) || 0,
      paid: parseFloat(f.paid.value) || 0,
      farmId: State.user.farmId,
      createdAt: Date.now()
    };
    if (!data.clientId || data.qty <= 0 || data.price < 0) { Utils.toast('Champs invalides', 'warning'); return; }
    const newId = db.ref('sales').push().key;
    db.ref(`sales/${newId}`).set(data);
    document.getElementById('modal').classList.add('hidden');
    Utils.toast('Vente enregistrée', 'success');
  }
};

/* =========================================================================
 * 14. MODULE 9 — PHOTOS PREUVES
 * ========================================================================= */
const Photos = {
  view(url) {
    document.getElementById('lightbox-img').src = url;
    document.getElementById('lightbox').classList.remove('hidden');
  }
};
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#lightbox [data-close]').forEach(el => {
    el.onclick = () => document.getElementById('lightbox').classList.add('hidden');
  });
});

/* =========================================================================
 * 15. MODULE 10 — MESSAGERIE INTERNE
 * ========================================================================= */
const Messaging = {
  bubble(id, m) {
    const mine = m.fromUid === State.user.uid;
    return `<div class="bubble ${mine ? 'me' : 'them'}">
      ${Utils.esc(m.text)}
      <span class="meta">${Utils.esc(m.fromName || '—')} · ${Utils.fmtDateTime(m.ts)}</span>
    </div>`;
  },

  send(e, lotId) {
    e.preventDefault();
    const input = e.target.text;
    const text = input.value.trim();
    if (!text) return;
    const id = db.ref('messages').push().key;
    db.ref(`messages/${id}`).set({
      lotId, text,
      fromUid: State.user.uid,
      fromName: State.user.displayName || State.user.email,
      ts: Date.now(),
      farmId: State.user.farmId
    });
    input.value = '';
  },

  globalView() {
    const all = Object.entries(State.messages)
      .map(([id, m]) => ({ id, ...m }))
      .sort((a, b) => b.ts - a.ts);
    document.getElementById('app-content').innerHTML = `
      <div class="view-header"><h2>💬 Messagerie</h2><p class="view-subtitle">Tous les échanges par lot</p></div>
      <div class="card">
        ${all.length ? all.map(m => {
          const lot = State.lots[m.lotId];
          return `<div class="card">
            <div class="flex" style="justify-content:space-between;align-items:center">
              <strong>📦 ${Utils.esc(lot ? lot.number : '—')}</strong>
              <span class="text-muted fs-xs">${Utils.fmtDateTime(m.ts)}</span>
            </div>
            <p class="mt-2"><strong>${Utils.esc(m.fromName || '—')}</strong> : ${Utils.esc(m.text)}</p>
            ${lot ? `<button class="btn btn-sm" onclick="Lots.open('${m.lotId}')">Ouvrir le lot</button>` : ''}
          </div>`;
        }).join('') : '<p class="text-muted text-center">Aucun message.</p>'}
      </div>`;
  }
};

/* =========================================================================
 * 16. MODULE 11 — SCORE SANTÉ DU LOT
 * ========================================================================= */
const Score = {
  /** Score /100 basé sur fissures, fertilité, mortalité, éclosion, calendrier. */
  compute(l) {
    let score = 100;
    const s = l.stages || {};
    if (s.j0) {
      const crackRate = s.j0.qty ? (s.j0.cracked || 0) / s.j0.qty : 0;
      if (crackRate > 0.05) score -= 10;
    }
    if (s.j0 && s.j7) {
      const base = s.j0.bons || 0;
      const losses = (s.j7.clairs || 0) + (s.j7.mortality || 0);
      const lossRate = base ? losses / base : 0;
      if (lossRate > 0.10) score -= 20;
      else if (lossRate > 0.05) score -= 10;
    }
    if (s.j7 && s.j14) {
      const base = s.j7.fertile || 0;
      const losses = (s.j14.clairs || 0) + (s.j14.mortality || 0);
      const lossRate = base ? losses / base : 0;
      if (lossRate > 0.08) score -= 20;
      else if (lossRate > 0.04) score -= 10;
    }
    if (s.j14 && s.hatch) {
      const base = s.j14.fertile || 0;
      const losses = (s.hatch.sick || 0) + (s.hatch.stillborn || 0);
      const lossRate = base ? losses / base : 0;
      if (lossRate > 0.10) score -= 20;
      else if (lossRate > 0.05) score -= 10;
    }
    // Respect calendrier
    if (l.collectDate) {
      const age = Utils.ageInDays(l.collectDate);
      if (l.status === 'active' && age > 23) score -= 15;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
  }
};

/* =========================================================================
 * 17. MODULE 12 — DÉTECTION D'ANOMALIES
 * ========================================================================= */
const Anomalies = {
  check(l) {
    const issues = [];
    const s = l.stages || {};
    if (s.j0 && s.j0.bons > s.j0.qty) issues.push("Le nombre d'œufs bons dépasse la quantité collectée.");
    if (s.j0 && s.j7 && s.j7.fertile > s.j0.bons) issues.push("Fécondés J7 > œufs bons J0.");
    if (s.j7 && s.j14 && s.j14.fertile > s.j7.fertile) issues.push("Fécondés J14 > fécondés J7.");
    if (s.j14 && s.hatch && s.hatch.chicks > s.j14.fertile) issues.push("Poussins > fécondés J14.");
    if (s.j0 && l.collectDate && Utils.ageInDays(l.collectDate) > 23 && l.status === 'active') issues.push("Aucune éclosion après 23 jours.");
    if (s.j0 && (s.j0.mortality || 0) > 0) issues.push("Mortalité excessive à J0.");
    return issues;
  }
};

/* =========================================================================
 * 18. MODULE 13 — RAPPORTS PDF (jsPDF)
 * ========================================================================= */
const Reports = {
  generatePDF(lotId) {
    if (typeof window.jspdf === 'undefined') { Utils.toast('jsPDF non chargé', 'danger'); return; }
    const l = State.lots[lotId];
    if (!l) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const farm = State.farms[l.farmId] || {};

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(22, 163, 74);
    doc.text('Tico Farm Manager 360', 14, 18);
    doc.setFontSize(11);
    doc.setTextColor(50);
    doc.setFont('helvetica', 'normal');
    doc.text('Rapport de lot', 14, 26);

    doc.setDrawColor(22, 163, 74);
    doc.setLineWidth(0.5);
    doc.line(14, 30, 196, 30);

    let y = 40;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Informations générales', 14, y); y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    [
      ['N° de lot',      l.number || '—'],
      ['Race',           l.race || '—'],
      ['Ferme',          farm.name || '—'],
      ['Responsable',    l.responsable || '—'],
      ['Date collecte',  Utils.fmtDate(l.collectDate)],
      ['Date incubation',Utils.fmtDate(l.incubationDate)],
      ['Statut',         l.status === 'finished' ? 'Terminé' : 'Actif'],
      ['Score santé',    Score.compute(l) + ' / 100']
    ].forEach(([k, v]) => { doc.text(`${k} :`, 14, y); doc.text(String(v), 70, y); y += 6; });

    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text('Suivi de couvaison', 14, y); y += 6;
    doc.setFont('helvetica', 'normal');
    const s = l.stages || {};
    if (s.j0)   { doc.text(`J0 — Collecte : ${s.j0.qty} œufs, ${s.j0.cracked} fissurés, ${s.j0.bons} bons.`, 14, y); y += 6; }
    if (s.j7)   { doc.text(`J7 — Mirage : ${s.j7.fertile} fécondés.`, 14, y); y += 6; }
    if (s.j14)  { doc.text(`J14 — Mirage : ${s.j14.fertile} fécondés.`, 14, y); y += 6; }
    if (s.hatch){ doc.text(`Éclosion : ${s.hatch.chicks} poussins.`, 14, y); y += 6; }

    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text('Économie', 14, y); y += 6;
    doc.setFont('helvetica', 'normal');
    const e = (l.economics || { expenses: {}, revenue: {} });
    const totalExp = Object.values(e.expenses || {}).reduce((a, b) => a + (parseFloat(b) || 0), 0);
    const totalRev = Object.values(e.revenue  || {}).reduce((a, b) => a + (parseFloat(b) || 0), 0);
    doc.text(`Coût total : ${Utils.fmtMoney(totalExp)}`, 14, y); y += 6;
    doc.text(`Recettes : ${Utils.fmtMoney(totalRev)}`, 14, y); y += 6;
    doc.text(`Marge : ${Utils.fmtMoney(totalRev - totalExp)}`, 14, y); y += 6;

    // Anomalies
    const anomalies = Anomalies.check(l);
    if (anomalies.length) {
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(220, 38, 38);
      doc.text('Anomalies', 14, y); y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(50);
      anomalies.forEach(a => { doc.text(`• ${a}`, 14, y); y += 6; });
    }

    doc.setTextColor(120);
    doc.setFontSize(9);
    doc.text(`Généré le ${Utils.fmtDateTime(Date.now())}`, 14, 285);
    doc.save(`rapport-${l.number || lotId}.pdf`);
    Utils.toast('PDF généré', 'success');
  },

  reportsView() {
    const lots = Object.values(State.lots);
    document.getElementById('app-content').innerHTML = `
      <div class="view-header"><h2>📊 Rapports</h2></div>
      <div class="grid-3">
        <div class="stat-card"><span class="stat-label">Lots</span><span class="stat-value">${lots.length}</span></div>
        <div class="stat-card accent"><span class="stat-label">Terminés</span><span class="stat-value">${lots.filter(l => l.status === 'finished').length}</span></div>
        <div class="stat-card info"><span class="stat-label">Score moyen</span><span class="stat-value">${lots.length ? Math.round(lots.reduce((s, l) => s + Score.compute(l), 0) / lots.length) : 0}/100</span></div>
      </div>
      <div class="card mt-3">
        <h3 class="card-title">Exporter un rapport PDF par lot</h3>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Lot</th><th>Race</th><th>Statut</th><th>Score</th><th>Action</th></tr></thead>
          <tbody>
            ${lots.length ? lots.map(l => {
              const sc = Score.compute(l);
              return `<tr>
                <td>${Utils.esc(l.number)}</td>
                <td>${Utils.esc(l.race)}</td>
                <td>${l.status === 'finished' ? 'Terminé' : 'Actif'}</td>
                <td><span class="chip ${sc >= 80 ? 'chip-success' : sc >= 50 ? 'chip-warning' : 'chip-danger'}">${sc}/100</span></td>
                <td><button class="btn btn-sm btn-primary" onclick="Reports.generatePDF('${l.id}')">📄 PDF</button></td>
              </tr>`;
            }).join('') : '<tr><td colspan="5" class="table-empty">Aucun lot.</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  }
};

/* =========================================================================
 * 19. MODULE 14 — NOTIFICATIONS
 * ========================================================================= */
const Notifications = {
  check() {
    const list = [];
    const today = Utils.todayISO();
    Object.values(State.lots).forEach(l => {
      if (l.status !== 'active') return;
      if (!l.incubationDate) return;
      const j7  = Utils.addDaysISO(l.incubationDate, 7);
      const j14 = Utils.addDaysISO(l.incubationDate, 14);
      const j21 = Utils.addDaysISO(l.incubationDate, 21);
      const s = l.stages || {};
      if (j7  <= today && !s.j7)    list.push({ type: 'danger', text: `Lot ${l.number} : Mirage J7 en retard` });
      if (j14 <= today && !s.j14)   list.push({ type: 'danger', text: `Lot ${l.number} : Mirage J14 en retard` });
      if (j21 <= today && !s.hatch) list.push({ type: 'warning', text: `Lot ${l.number} : Éclosion en retard` });
      if (l.collectDate && Utils.ageInDays(l.collectDate) > 23 && !s.hatch) list.push({ type: 'danger', text: `Lot ${l.number} : pas d'éclosion après 23 jours` });
    });
    Object.values(State.stocks).forEach(st => {
      if ((st.qty || 0) <= (st.minQty || 0)) list.push({ type: 'warning', text: `Stock faible : ${st.name}` });
    });
    State.notifications = list;
    return list;
  },

  render() {
    const list = this.check();
    const html = list.length ? list.map(n => `
      <div class="alert alert-${n.type}">${Utils.esc(n.text)}</div>
    `).join('') : '<p class="text-muted text-center">Aucune notification.</p>';

    Utils.modal({
      title: '🔔 Notifications',
      body: html,
      footer: `<button class="btn btn-primary" data-close>OK</button>`
    });
  },

  /** Phase 1 = email. Ouvre le client mail par défaut (mailto). */
  sendEmail(to, subject, body) {
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank');
  }
};

/* =========================================================================
 * 20. RENDU DES VUES + INITIALISATION
 * ========================================================================= */
const Renderer = {

  dashboard()  { Dashboard.render(); },

  farms() {
    document.getElementById('app-content').innerHTML = `
      <div class="view-header">
        <div><h2>🚜 Mes fermes</h2><p class="view-subtitle">Gérez vos sites d'élevage</p></div>
        <button class="btn btn-primary" onclick="Farms.createForm()">➕ Nouvelle ferme</button>
      </div>
      ${Farms.list()}
    `;
  },

  lots() {
    document.getElementById('app-content').innerHTML = `
      <div class="view-header">
        <div><h2>📦 Lots</h2><p class="view-subtitle">Suivi de vos couvaisons</p></div>
        <button class="btn btn-primary" onclick="Lots.createForm()">➕ Nouveau lot</button>
      </div>
      ${Lots.list()}
    `;
  },

  calendar()    { Calendar.render(); },
  stocks()      { Stocks.render(); },
  commercial()  { Commercial.render(); },
  economics()   { Economics.globalView(); },
  reports()     { Reports.reportsView(); },
  messages()    { Messaging.globalView(); },

  users() {
    if (State.user.role !== 'admin') { Renderer.dashboard(); return; }
    db.ref('users').once('value', s => {
      const users = Object.values(s.val() || {});
      document.getElementById('app-content').innerHTML = `
        <div class="view-header"><h2>🛡️ Utilisateurs</h2></div>
        <div class="card">
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Actions</th></tr></thead>
            <tbody>
              ${users.map(u => `<tr>
                <td>${Utils.esc(u.displayName || '—')}</td>
                <td>${Utils.esc(u.email)}</td>
                <td><span class="badge ${u.role === 'admin' ? 'badge-admin' : 'badge-collaborator'}">${u.role === 'admin' ? 'ADMIN' : 'COLLAB'}</span></td>
                <td>
                  <button class="btn btn-sm" onclick="Renderer.usersToggleRole('${u.uid}','${u.role}')">
                    ${u.role === 'admin' ? '⬇️ Rétrograder' : '⬆️ Promouvoir admin'}
                  </button>
                  <button class="btn btn-sm btn-danger" onclick="Renderer.usersDelete('${u.uid}')">🗑️</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div>
        </div>`;
    });
  },

  usersToggleRole(uid, currentRole) {
    const newRole = currentRole === 'admin' ? 'collaborator' : 'admin';
    Utils.confirm(`Changer le rôle vers ${newRole} ?`, () => {
      db.ref(`users/${uid}/role`).set(newRole);
      Utils.toast('Rôle mis à jour', 'success');
      setTimeout(() => Renderer.users(), 500);
    });
  },

  usersDelete(uid) {
    Utils.confirm('Supprimer cet utilisateur ? (irréversible)', () => {
      db.ref(`users/${uid}`).remove();
      Utils.toast('Utilisateur supprimé', 'success');
      setTimeout(() => Renderer.users(), 500);
    });
  },

  settings() {
    document.getElementById('app-content').innerHTML = `
      <div class="view-header"><h2>⚙️ Paramètres</h2></div>
      <div class="card">
        <h3 class="card-title">Mon compte</h3>
        <div class="card-row"><span>Nom</span><strong>${Utils.esc(State.user.displayName || '—')}</strong></div>
        <div class="card-row"><span>Email</span><strong>${Utils.esc(State.user.email)}</strong></div>
        <div class="card-row"><span>Rôle</span><span class="badge ${State.user.role === 'admin' ? 'badge-admin' : 'badge-collaborator'}">${State.user.role === 'admin' ? 'ADMIN' : 'COLLAB'}</span></div>
      </div>
      <div class="card">
        <h3 class="card-title">Application</h3>
        <div class="card-row"><span>Version</span><strong>1.0.0</strong></div>
        <div class="card-row"><span>Cache</span><strong>${navigator.onLine ? '🟢 En ligne' : '🟡 Hors ligne'}</strong></div>
        <div class="card-actions">
          <button class="btn" onclick="Renderer.clearCache()">🧹 Vider le cache PWA</button>
        </div>
      </div>
      <div class="card">
        <h3 class="card-title">Évolutions futures</h3>
        <ul class="text-muted" style="line-height:1.8">
          <li>📲 Notifications WhatsApp</li>
          <li>🤖 Intelligence artificielle (prédictions)</li>
          <li>🌡️ Capteurs connectés (température, humidité)</li>
          <li>🐔 Gestion multi-espèces (pintades, canards, dindes)</li>
        </ul>
      </div>
    `;
  },

  async clearCache() {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      Utils.toast('Cache vidé. Rechargez la page.', 'success');
    }
  },

  profile() {
    document.getElementById('app-content').innerHTML = `
      <div class="view-header"><h2>👤 Mon compte</h2></div>
      <div class="card text-center">
        <div style="font-size:48px">👤</div>
        <h3>${Utils.esc(State.user.displayName || '—')}</h3>
        <p class="text-muted">${Utils.esc(State.user.email)}</p>
        <span class="badge ${State.user.role === 'admin' ? 'badge-admin' : 'badge-collaborator'}">${State.user.role === 'admin' ? 'ADMIN' : 'COLLABORATEUR'}</span>
      </div>
      <div class="card">
        <h3 class="card-title">Accès rapides</h3>
        <div class="flex-col gap-2">
          <button class="btn w-full" onclick="Renderer.dashboard()">🏠 Tableau de bord</button>
          <button class="btn w-full" onclick="Renderer.lots()">📦 Mes lots</button>
          <button class="btn w-full" onclick="Renderer.stocks()">🧱 Stocks</button>
          ${State.user.role === 'admin' ? '<button class="btn w-full" onclick="Renderer.users()">🛡️ Utilisateurs</button>' : ''}
          <button class="btn w-full" onclick="Renderer.settings()">⚙️ Paramètres</button>
          <button class="btn w-full btn-danger" onclick="Auth.logout()">🚪 Déconnexion</button>
        </div>
      </div>
    `;
  }
};

/* =========================================================================
 * 20.bis — WIRING (events globaux, navigation)
 * ========================================================================= */
function wireNavigation() {
  // Bottom nav
  document.querySelectorAll('.bottom-nav-item').forEach(item => {
    item.onclick = e => { e.preventDefault(); App.go(item.dataset.view); };
  });
  // Drawer links
  document.querySelectorAll('.drawer-link[data-view]').forEach(a => {
    a.onclick = e => {
      e.preventDefault();
      document.getElementById('drawer').classList.remove('open');
      document.getElementById('drawer-backdrop').classList.remove('open');
      App.go(a.dataset.view);
    };
  });
  // Menu hamburger
  document.getElementById('btn-menu').onclick = () => {
    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawer-backdrop').classList.add('open');
  };
  // Backdrop
  document.getElementById('drawer-backdrop').onclick = () => {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawer-backdrop').classList.remove('open');
  };
  // Profil
  document.getElementById('btn-profile').onclick = () => App.go('profile');
  // Notifications
  document.getElementById('btn-notif').onclick = () => Notifications.render();
  // Logout drawer
  document.getElementById('drawer-logout').onclick = e => { e.preventDefault(); Auth.logout(); };
  // Refresh notif count toutes les 30s
  setInterval(() => {
    const list = Notifications.check();
    const dot = document.getElementById('notif-count');
    if (list.length) { dot.textContent = list.length; dot.classList.remove('hidden'); }
    else dot.classList.add('hidden');
  }, 30000);
  // Re-render quand les données changent
  setInterval(() => {
    if (State.user && document.visibilityState === 'visible') {
      const v = State.currentView;
      Renderer[v] ? Renderer[v]() : null;
    }
  }, 60000);
}

/* =========================================================================
 * 20.ter — DÉMARRAGE
 * ========================================================================= */
window.addEventListener('DOMContentLoaded', () => {
  registerSW();
  Auth.init();
  wireNavigation();
});
