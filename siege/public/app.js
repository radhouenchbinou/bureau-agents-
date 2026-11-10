// Le Siège — front sans framework. L'état vient de /api/etat (toutes les 10 s) ; les changements passent par /api/action.
// Tout texte venu des données est inséré comme texte (jamais d'innerHTML avec des données).
'use strict';
(() => {
  let E = null, vue = 'bureau', coll = 'features', filtre = { filiale: '', q: '' }, tiroirOuvert = false, glisse = null;
  const $ = s => document.querySelector(s);

  function h(tag, p, ...enfants) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(p || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of enfants.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }
  const vider = (el, ...c) => { el.replaceChildren(...c.flat().filter(Boolean)); return el; };
  const initiales = n => n.split(/[-\s]/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('');
  const depuis = t => { if (!t) return ''; const s = Math.round((Date.now() - (typeof t === 'number' ? t : Date.parse(t))) / 1e3); return s < 60 ? 'à l\'instant' : s < 3600 ? 'il y a ' + Math.round(s / 60) + ' min' : s < 86400 ? 'il y a ' + Math.round(s / 3600) + ' h' : 'il y a ' + Math.round(s / 86400) + ' j'; };
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('vu'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('vu'), 3200); }

  const saisieEnCours = () => { const v = document.querySelector('.vue:not([hidden])'); return !!(v && v.dataset.modifie); };
  async function charger(auto) {
    // Un formulaire en cours de saisie (Intégrations, fiche ouverte) n'est jamais effacé par le rafraîchissement automatique
    try { const r = await fetch('/api/etat', { cache: 'no-store' }); E = await r.json(); if (!(auto && saisieEnCours())) rendre(); }
    catch { bandeau('Le serveur du Siège ne répond pas.', true); }
  }
  async function act(op, ok) {
    const r = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Siege-Csrf': E.csrf }, body: JSON.stringify(op) });
    const j = await r.json().catch(() => ({ erreur: 'Réponse illisible' }));
    if (!r.ok) { toast(j.erreur || 'Erreur'); throw new Error(j.erreur); }
    if (ok) toast(ok); await charger(); return j.resultat;
  }
  const actionner = (...a) => act(...a);   // rendre() a une variable locale « act »
  function bandeau(m, err) { const b = $('#bandeau'); b.hidden = !m; b.textContent = m || ''; b.classList.toggle('err', !!err); }

  // ---------- Rendu global ----------
  function rendre() {
    if (!E) return;   // données pas encore chargées (onglet cliqué pendant le premier chargement)
    const f = E.features.elements, b = E.bugs.elements, act = E.activite.missions.filter(m => m.etat === 'au_poste');
    vider($('#counts'),
      h('span', {}, h('b', { text: f.filter(x => x.statut === 'Livré').length + '/' + f.length }), 'features livrées'),
      h('span', {}, h('b', { text: b.filter(x => ['Ouvert', 'En correction', 'À vérifier'].includes(x.statut)).length }), 'bugs ouverts'),
      h('span', { class: E.questions.liste.length ? 'alerte' : '' }, h('b', { text: E.questions.liste.length }), 'question(s) pour vous'),
      h('span', { class: enAttente().length ? 'alerte' : '' }, h('b', { text: enAttente().length }), 'exception(s) à décider'),
      h('span', {}, h('b', { text: act.length }), 'agent(s) au poste'),
      h('span', {}, 'Backlog : ', h('b', { text: ({ notion: 'Notion', jira: 'Jira' })[E.source.type] || 'fichiers locaux' })));
    const errs = [E.features.erreur, E.bugs.erreur, E.questions.erreur, E.activite.erreur].filter(Boolean);
    bandeau(errs.length ? [...new Set(errs)].join(' · ') : '', true);
    const L = E.modeLibre || {}, bl = $('#bandeau-libre');
    bl.hidden = !L.actif;
    if (L.actif) vider(bl, h('b', { text: 'Mode sans restriction actif' }), ' — garde et bac à sable levés pour tous les agents' + (L.jusqua ? ', jusqu\'à ' + new Date(L.jusqua).toLocaleString('fr-FR') : ', sans limite de durée') + '. ',
      h('button', { type: 'button', class: 'btn petit', text: 'Rétablir les restrictions', onclick: () => actionner({ op: 'admin.modeLibre', actif: false }, 'Restrictions rétablies').catch(() => {}) }));
    ({ bureau: rendreBureau, backlog: rendreBacklog, agents: rendreAgents, demandes: rendreDemandes, droits: rendreDroits, reglages: rendreReglages, admin: rendreAdmin })[vue]();
  }
  document.querySelectorAll('.tabs button').forEach(bt => bt.addEventListener('click', () => {
    vue = bt.dataset.v; document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', x === bt));
    document.querySelectorAll('.vue').forEach(s => { s.hidden = s.id !== 'v-' + vue; }); rendre();
  }));

  // ---------- Admin : mode sans restriction ----------
  function rendreAdmin() {
    const L = E.modeLibre || {};
    const duree = h('select', { 'aria-label': 'Durée' }, [[1, '1 heure'], [4, '4 heures'], [8, '8 heures'], [24, '24 heures'], [0, 'Jusqu\'à ce que je le désactive']].map(([v, t]) => h('option', { value: v, text: t })));
    const conf = h('input', { placeholder: 'Tapez SANS RESTRICTION', 'aria-label': 'Confirmation', autocomplete: 'off' });
    const vueA = $('#v-admin'); vueA.oninput = () => { vueA.dataset.modifie = '1'; };
    const fin = () => { delete vueA.dataset.modifie; };
    const journal = ((E.droits && E.droits.journal) || []).filter(x => /sans_restriction/.test(x.evenement)).slice(0, 15);
    vider(vueA,
      h('div', { class: 'carte' }, h('h3', { text: 'Mode sans restriction' }),
        h('p', { text: L.actif ? 'Actif' + (L.jusqua ? ' jusqu\'à ' + new Date(L.jusqua).toLocaleString('fr-FR') : ', sans limite de durée') + ' (activé ' + depuis(L.active_le) + ').' : 'Inactif : chaque agent n\'a que les droits de son rôle.' }),
        h('p', { class: 'aide', text: 'Lève toutes les restrictions de tous les agents : la garde laisse tout passer, le bac à sable et les interdictions de Claude Code sont retirés (accès réseau, écriture partout, lecture des secrets, git push, outils du Siège). Chaque action reste journalisée. Les sessions déjà ouvertes gardent leur bac à sable jusqu\'à leur redémarrage ; la garde, elle, change tout de suite.' }),
        L.actif
          ? h('div', { class: 'barre' }, h('button', { type: 'button', class: 'btn prim', text: 'Rétablir les restrictions', onclick: async () => { fin(); await act({ op: 'admin.modeLibre', actif: false }, 'Restrictions rétablies').catch(() => {}); } }))
          : h('div', { class: 'barre' }, duree, conf, h('button', { type: 'button', class: 'btn dang', text: 'Désactiver toutes les restrictions', onclick: async () => {
              if (conf.value.trim() !== 'SANS RESTRICTION') return toast('Tapez SANS RESTRICTION pour confirmer');
              fin(); await act({ op: 'admin.modeLibre', actif: true, duree_h: Number(duree.value), confirmation: 'SANS RESTRICTION' }, 'Restrictions levées').catch(() => {});
            } }))),
      h('div', { class: 'carte' }, h('h3', { text: 'Historique' }), journal.length
        ? h('div', { class: 'fil' }, journal.map(x => h('div', { class: 'com' }, h('small', { text: depuis(x.date) + ' · ' + (x.role || '') }), h('span', { text: x.evenement.replace(/_/g, ' ') + (x.outil ? ' — ' + x.outil + ' ' + (x.detail || '') : '') }))))
        : h('p', { class: 'aide', text: 'Aucun passage en mode sans restriction.' })));
  }

  // ---------- Bureau ----------
  const ETAT = { au_poste: ['on', 'Au poste'], en_attente: ['attend', 'En attente'], termine: ['', 'Terminé'], interrompu: ['err', 'Interrompu'] };
  function missionDe(agent, fil) {
    return E.activite.missions.find(m => m.agent === agent && ['au_poste', 'en_attente'].includes(m.etat) &&
      (!fil || m.filiale.toLowerCase().startsWith(fil.nom.toLowerCase()) || m.story.startsWith(fil.prefixe + '-')));
  }
  function poste(nom, libelle, mission, onclick, extra) {
    const cl = mission ? (mission.etat === 'au_poste' ? 'on' : 'attend') : '';
    return h('button', { type: 'button', class: 'poste ' + cl, onclick, 'aria-label': libelle + (mission ? ', ' + ETAT[mission.etat][1] : ', libre') },
      h('span', { class: 'av' }, initiales(nom), mission && mission.etat === 'au_poste' ? h('span', { class: 'clavier', 'aria-hidden': 'true' }, h('b'), h('b'), h('b')) : null),
      h('span', { class: 'nm', text: libelle }),
      h('span', { class: 'st', text: extra || (mission ? (mission.story || 'mission') + ' · ' + ETAT[mission.etat][1].toLowerCase() : 'Libre') }));
  }
  function etage(cl, titre, info, postes) {
    return h('div', { class: 'etage ' + cl }, h('div', { class: 'etage-h' }, h('h2', { text: titre }), h('small', { text: info })), h('div', { class: 'postes' }, postes));
  }
  function rendreBureau() {
    const ag = E.agents, groupe = ag.filter(a => a.portee === 'groupe'), roles = E.rolesFiliale.filter(r => ag.some(a => a.nom === r));
    const d = E.activite.direction, q = E.questions.liste.length;
    const dirTxt = { travaille: 'Travaille', attend_ceo: 'Attend votre validation', absent: 'Aucune session ouverte' }[d.etat];
    const fils = E.filiales.filter(f => f.prefixe !== 'GRP');
    vider($('#v-bureau'),
      h('p', { class: 'aide', text: 'Les agents s\'allument quand Claude Code travaille dans le Siège. Cliquez un poste pour voir sa fiche.' }),
      h('div', { class: 'immeuble' },
        etage('direction', 'Direction', '', [
          poste('CEO', 'Vous — CEO', null, () => $(`.tabs [data-v=${enAttente().length ? 'droits' : 'backlog'}]`).click(),
            [q ? q + ' question(s)' : '', enAttente().length ? enAttente().length + ' exception(s)' : ''].filter(Boolean).join(' · ') || 'Rien en attente'),
          poste('Directeur', 'Directeur de programme', d.etat === 'absent' ? null : { etat: d.etat === 'travaille' ? 'au_poste' : 'en_attente', story: '' }, null, dirTxt)
        ]),
        etage('services', 'Services partagés du groupe', groupe.length + ' agents',
          groupe.map(a => poste(a.nom, a.nom, missionDe(a.nom), () => ficheAgent(a)))),
        fils.map(f => etage('filiale', f.nom, f.prefixe + ' · ' + f.dossier, roles.map(r => poste(r, r, missionDe(r, f), () => ficheAgent(ag.find(a => a.nom === r), f)))))),
      h('div', { class: 'carte' }, h('h3', { text: 'Journal des missions' }),
        E.activite.missions.length ? h('div', { class: 'journal' }, E.activite.missions.slice(0, 15).map(m => h('div', {},
          h('span', { class: 'muted', text: depuis(m.derniere) }), h('span', { class: 'mono', text: m.agent }),
          h('span', {}, h('span', { class: 'pastille ' + ETAT[m.etat][0] }, h('i'), ETAT[m.etat][1])),
          h('span', { text: [m.story, m.filiale, m.resume].filter(Boolean).join(' · ') }))))
          : h('p', { class: 'aide', text: 'Aucune mission encore. Lancez un ticket depuis le backlog.' })));
  }

  // ---------- Tiroir ----------
  function ouvrir(titre, ...contenu) {
    tiroirOuvert = true; $('#voile').hidden = false; const t = $('#tiroir'); t.hidden = false;
    vider(t, h('div', { class: 'tiroir-h' }, h('h2', { id: 'tiroir-titre', text: titre }), h('button', { type: 'button', class: 'btn petit', onclick: fermer, text: 'Fermer' })), contenu);
    t.querySelector('input,textarea,select,button')?.focus();
  }
  function fermer() { tiroirOuvert = false; $('#voile').hidden = true; $('#tiroir').hidden = true; }
  $('#voile').addEventListener('click', fermer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && tiroirOuvert) fermer(); });

  function ficheAgent(a, fil) {
    if (!a) return;
    const missions = E.activite.missions.filter(m => m.agent === a.nom && (!fil || m.story.startsWith(fil.prefixe + '-') || m.filiale.toLowerCase().startsWith(fil.nom.toLowerCase())));
    ouvrir(a.nom + (fil ? ' · ' + fil.nom : ''),
      h('p', { class: 'aide', text: a.description }),
      h('div', { class: 'chips' }, h('span', { class: 'tag', text: 'Modèle : ' + (a.modele || 'hérité') }), a.outils.map(o => h('span', { class: 'tag', text: o }))),
      h('div', { class: 'barre' }, h('button', { type: 'button', class: 'btn', text: 'Modifier l\'agent', onclick: () => editeurAgent(a) })),
      h('h3', { text: 'Missions récentes' }),
      missions.length ? h('div', { class: 'journal' }, missions.slice(0, 20).map(m => h('div', {}, h('span', { class: 'muted', text: depuis(m.derniere) }), h('span', { class: 'mono', text: m.story || '—' }), h('span', {}, h('span', { class: 'pastille ' + ETAT[m.etat][0] }, h('i'), ETAT[m.etat][1])), h('span', { text: m.resume }))))
        : h('p', { class: 'aide', text: 'Aucune mission sur les 7 derniers jours.' }));
  }

  // ---------- Backlog ----------
  const schema = () => E.schemas[coll];
  const elements = () => E[coll].elements;
  const parRang = (a, b) => (a.rang || Infinity) - (b.rang || Infinity) || a.id.localeCompare(b.id);
  const questionSur = id => E.questions.liste.find(x => x.id === id);
  function visibles() {
    const q = filtre.q.toLowerCase();
    return elements().filter(e => (!filtre.filiale || e.filiale === filtre.filiale) && (!q || (e.id + ' ' + e.titre + ' ' + (e.description || '')).toLowerCase().includes(q))).sort(parRang);
  }
  function carteTicket(e) {
    const att = coll === 'features' && E.file.enAttente.some(x => x.id === e.id), qu = questionSur(e.id);
    const c = h('button', { type: 'button', class: 'ticket', draggable: 'true', 'data-id': e.id, onclick: () => ficheTicket(e) },
      h('span', { class: 'haut' }, h('span', { class: 'id', text: e.id }), h('span', { class: 'rang', text: e.rang ? '#' + e.rang : '' }),
        e.gravite ? h('span', { class: 'tag ' + e.gravite.toLowerCase(), text: e.gravite }) : null,
        e.filiale ? h('span', { class: 'tag', text: e.filiale }) : null, att ? h('span', { class: 'tag attente', text: 'attend ' + e.dependances.join(', ') }) : null,
        qu ? h('span', { class: 'tag question', text: 'question' }) : null,
        e.etapes_desactivees && e.etapes_desactivees.length ? h('span', { class: 'tag', title: 'Étapes désactivées par le CEO', text: 'sans étape ' + e.etapes_desactivees.join(', ') }) : null),
      h('span', { class: 't', text: e.titre }),
      e.etape ? h('span', { class: 'muted', text: e.etape + (e.agent ? ' · ' + e.agent : '') }) : null);
    c.addEventListener('dragstart', ev => { glisse = e.id; c.classList.add('glisse'); ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', e.id); });
    c.addEventListener('dragend', () => { glisse = null; c.classList.remove('glisse'); });
    c.addEventListener('dragover', ev => { if (glisse && glisse !== e.id) { ev.preventDefault(); c.classList.add('avant'); } });
    c.addEventListener('dragleave', () => c.classList.remove('avant'));
    c.addEventListener('drop', ev => { ev.preventDefault(); ev.stopPropagation(); c.classList.remove('avant'); deposer(glisse, e.statut, e.id); });
    return c;
  }
  // Déposer un ticket avant un autre (ou en fin de colonne) : nouveau statut si besoin, puis rangs 1..n recalculés
  async function deposer(id, statut, avantId) {
    if (!id) return;
    const tous = elements().slice().sort(parRang), x = tous.find(e => e.id === id);
    if (x.statut !== statut) await act({ op: 'ticket.modifier', collection: coll, id, champs: { statut } });
    const ordre = tous.filter(e => e.id !== id);
    let i = avantId ? ordre.findIndex(e => e.id === avantId) : -1;
    if (i < 0) { const dernier = [...ordre].reverse().find(e => e.statut === statut); i = dernier ? ordre.indexOf(dernier) + 1 : ordre.length; }
    ordre.splice(i, 0, x);
    await act({ op: 'ticket.reclasser', collection: coll, ids: ordre.map(e => e.id) }, 'Priorités mises à jour');
  }
  function lancer(id) {
    act({ op: 'lancer', id }).then(r => {
      if (r.lance) toast('Claude Code s\'ouvre dans le Terminal sur ' + id);
      else { navigator.clipboard?.writeText(r.commande).catch(() => {}); toast('Commande copiée : ' + r.commande); }
    }).catch(() => {});
  }
  function rendreBacklog() {
    const s = schema(), statuts = s.champs.statut.options, fils = E.filiales.map(f => f.nom), vis = visibles();
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Tableau' }, ['features', 'bugs'].map(n => h('button', { type: 'button', 'aria-pressed': coll === n, text: E.schemas[n].libelle + ' (' + E[n].elements.length + ')', onclick: () => { coll = n; rendre(); } })));
    const selF = h('select', { 'aria-label': 'Filiale', onchange: ev => { filtre.filiale = ev.target.value; rendre(); } }, h('option', { value: '', text: 'Toutes les filiales' }), fils.map(n => h('option', { value: n, text: n, selected: filtre.filiale === n })));
    const rech = h('input', { type: 'search', placeholder: 'Chercher…', value: filtre.q, 'aria-label': 'Chercher un ticket', oninput: ev => { filtre.q = ev.target.value; clearTimeout(rech.t); rech.t = setTimeout(rendre, 250); } });
    const ordre = E.file.ordre.slice(0, 6);
    vider($('#v-backlog'),
      h('div', { class: 'carte' }, h('div', { class: 'barre' }, h('h3', { text: 'File de travail' }), h('span', { class: 'aide', text: 'bugs bloquants, puis features prêtes par rang, puis autres bugs' })),
        ordre.length ? h('div', { class: 'file' }, ordre.map((e, i) => h('div', { class: 'file-l' }, h('span', { class: 'n', text: i + 1 }), h('span', { class: 'mono', text: e.id }),
          h('span', { text: e.titre }), h('button', { type: 'button', class: 'btn petit prim', text: 'Lancer', onclick: () => lancer(e.id) })))) : h('p', { class: 'aide', text: 'Rien de prêt : tout est livré ou attend une dépendance.' }),
        E.questions.liste.length ? h('div', { class: 'file' }, h('h3', { text: 'Questions des agents' }), E.questions.liste.map(x => h('div', { class: 'file-l' }, h('span', { class: 'n', text: '?' }), h('span', { class: 'mono', text: x.id }),
          h('span', { text: '(' + x.question.auteur + ') ' + x.question.texte }), h('button', { type: 'button', class: 'btn petit', text: 'Répondre', onclick: () => { coll = x.collection; ficheTicket(E[x.collection].elements.find(e => e.id === x.id)); } })))) : null),
      carteRedaction(),
      h('div', { class: 'barre' }, seg, selF, rech, h('button', { type: 'button', class: 'btn prim', text: coll === 'bugs' ? 'Nouveau bug' : 'Nouvelle feature', onclick: () => ficheTicket(null) })),
      h('p', { class: 'aide', text: 'Glissez une carte pour changer son statut ou sa priorité (le rang 1 passe en premier).' }),
      h('div', { class: 'kanban' }, statuts.map(st => {
        const cartes = vis.filter(e => e.statut === st), col = h('div', { class: 'colonne', 'data-statut': st },
          h('div', { class: 'colonne-h' }, h('span', { text: st }), h('span', { class: 'muted', text: cartes.length })), cartes.map(carteTicket));
        col.addEventListener('dragover', ev => { if (glisse) { ev.preventDefault(); col.classList.add('cible'); } });
        col.addEventListener('dragleave', () => col.classList.remove('cible'));
        col.addEventListener('drop', ev => { ev.preventDefault(); col.classList.remove('cible'); deposer(glisse, st, null); });
        return col;
      })));
  }
  // ---------- Demande en langage courant → ticket rédigé par l'IA → validation du CEO ----------
  const CHAMPS_PROPOSITION = { features: ['titre', 'filiale', 'priorite', 'dependances', 'description'], bugs: ['titre', 'filiale', 'gravite', 'story', 'reproduction', 'attendu', 'obtenu'] };
  function carteRedaction() {
    const vueB = $('#v-backlog'), sale = () => { vueB.dataset.modifie = '1'; }, propre = () => { delete vueB.dataset.modifie; };
    const zone = h('textarea', { placeholder: 'Ex. : je veux ajouter un journal de log sur la fiche de chaque modèle', 'aria-label': 'Décrire une demande', oninput: sale });
    const envoyer = h('button', { type: 'button', class: 'btn prim', text: 'Rédiger le ticket avec l\'IA', onclick: async () => {
      if (zone.value.trim().length < 10) return toast('Décrivez la demande en une ou deux phrases');
      envoyer.disabled = true; propre();
      await act({ op: 'redaction.demander', texte: zone.value }, 'Demande envoyée : le directeur rédige le ticket').catch(() => { envoyer.disabled = false; });
    } });
    const liste = (E.redactions || []).map(x => {
      const tete = h('div', { class: 'barre' }, h('span', { class: 'mono', text: x.id }), h('span', { class: 'tag', text: x.statut }), h('span', { class: 'aide', text: depuis(x.maj_le) }));
      const dem = h('p', { class: 'aide', text: '« ' + x.demande + ' »' });
      if (x.statut === 'En rédaction') return h('div', { class: 'carte redaction' }, tete, dem, h('p', { class: 'aide', text: 'Le directeur rédige la proposition (lecture seule du code et des fiches)…' }));
      if (x.statut === 'Créée') return h('div', { class: 'carte redaction' }, tete, dem, h('p', {}, 'Ticket créé : ', h('button', { type: 'button', class: 'btn petit', text: x.ticket, onclick: () => { coll = /^BUG-/.test(x.ticket) ? 'bugs' : 'features'; ficheTicket(E[coll].elements.find(e => e.id === x.ticket)); } })));
      if (x.statut === 'Abandonnée') return h('div', { class: 'carte redaction' }, tete, dem);
      const rem = h('textarea', { placeholder: 'Ce qu\'il faut changer dans la rédaction…', 'aria-label': 'Remarque pour ' + x.id, oninput: sale });
      const actions = h('div', { class: 'barre' },
        x.statut === 'À valider' ? h('button', { type: 'submit', class: 'btn prim', text: 'Créer le ticket' }) : null,
        h('button', { type: 'button', class: 'btn', text: x.statut === 'Erreur' ? 'Réessayer' : 'Corriger la rédaction', onclick: async () => {
          const r = rem.value.trim() || (x.statut === 'Erreur' ? 'Nouvel essai' : ''); if (!r) return toast('Écrivez ce qu\'il faut changer');
          propre(); await act({ op: 'redaction.corriger', id: x.id, remarque: r }, 'Nouvelle rédaction demandée').catch(() => {});
        } }),
        h('button', { type: 'button', class: 'btn dang', text: 'Abandonner', onclick: async () => { propre(); await act({ op: 'redaction.abandonner', id: x.id }, 'Demande abandonnée').catch(() => {}); } }));
      if (x.statut === 'Erreur') return h('div', { class: 'carte redaction' }, tete, dem, h('p', { class: 'erreur-red', text: x.erreur }), rem, actions);
      const p = x.proposition || {}, col = p.collection === 'bugs' ? 'bugs' : 'features', sch = E.schemas[col].champs;
      const form = h('form', { class: 'carte redaction', oninput: sale, onsubmit: async ev => {
        ev.preventDefault();
        const prop = { collection: col };
        for (const k of CHAMPS_PROPOSITION[col]) { const el = form.elements[k]; if (el) prop[k] = el.value; }
        try { propre(); const r = await act({ op: 'redaction.valider', id: x.id, proposition: prop }, 'Ticket créé'); coll = r.collection; ficheTicket(E[coll].elements.find(e => e.id === r.id)); } catch {}
      } }, tete, dem, h('p', { class: 'aide', text: 'Proposition de l\'IA (' + (col === 'bugs' ? 'bug' : 'feature') + ') : relisez, modifiez si besoin, puis créez le ticket.' }),
        CHAMPS_PROPOSITION[col].filter(k => sch[k]).map(k => champ(k, sch[k], p[k])), rem, actions);
      return form;
    });
    return h('div', { class: 'carte' }, h('div', { class: 'barre' }, h('h3', { text: 'Décrire une demande' }), h('span', { class: 'aide', text: 'le directeur rédige le ticket, vous le validez avant qu\'il entre au backlog' })),
      zone, h('div', { class: 'barre' }, envoyer), liste);
  }
  function champ(k, d, v) {
    const lib = h('span', {}, h('b', { text: d.libelle }), d.requis ? ' *' : '');
    let inp;
    if (d.type === 'choix') {
      const opts = d.options || (k === 'filiale' ? E.filiales.map(f => f.nom) : [...new Set(E[coll].elements.map(e => e[k]).filter(Boolean))]);
      inp = h('select', { name: k }, !d.defaut && k !== 'filiale' ? h('option', { value: '', text: '—' }) : null, k === 'filiale' && !v ? h('option', { value: '', text: 'Choisir…' }) : null, opts.map(o => h('option', { value: o, text: o, selected: o === v })));
    } else if (d.type === 'nombre') inp = h('input', { name: k, type: 'number', min: 1, value: v == null ? '' : v });
    else if (d.auto) inp = h('input', { name: k, value: v || '', readonly: true, title: 'Tenu par l\'outil GitHub du Siège' });
    else if (d.type === 'liste') inp = h('input', { name: k, value: (v || []).join(', '), placeholder: 'ex. COL-001, GRP-001' });
    else if (d.max > 300) inp = h('textarea', { name: k, text: v || '' });
    else inp = h('input', { name: k, value: v || '' });
    return h('label', { class: 'champ' + (d.max > 300 || d.type === 'titre' ? ' large' : '') }, lib, inp);
  }
  // Étapes du circuit à désactiver pour un ticket (ex. pas de plan de tests ni de recette pour un petit changement).
  // Étape 0 (cadrage) toujours active. L'état est tenu dans `desact` (numéros d'étapes désactivées).
  function etapesCircuit(desact) {
    const noms = schema().champs.etape.options || [], avertir = h('p', { class: 'aide avert', role: 'status' });
    const bilan = () => {
      const sans = [...desact].sort((a, b) => a - b);
      const cles = sans.filter(n => n === 6 || n === 7).map(n => noms[n]);
      avertir.textContent = cles.length ? 'Attention : ' + cles.join(' et ') + ' désactivée' + (cles.length > 1 ? 's' : '') + ' : la revue ou la sécurité ne sera pas faite.' : '';
    };
    const cases = noms.map((nom, n) => h('label', { class: 'etape-case' }, h('input', { type: 'checkbox', checked: !desact.has(n), disabled: n === 0,
      onchange: ev => { if (ev.target.checked) desact.delete(n); else desact.add(n); bilan(); } }), h('span', { text: nom })));
    bilan();
    return h('fieldset', { class: 'carte etapes' }, h('legend', { text: 'Étapes du circuit' }),
      h('p', { class: 'aide', text: 'Décochez une étape pour la sauter sur ce ticket. Le cadrage reste obligatoire.' }), h('div', { class: 'grille2' }, cases), avertir);
  }
  function ficheTicket(e) {
    const s = schema(), nouveau = !e, val = e || {};
    const desact = new Set(((val.etapes_desactivees) || []).map(Number));
    const circuit = coll === 'features' ? etapesCircuit(desact) : null;
    const form = h('form', { class: 'carte', onsubmit: async ev => {
      ev.preventDefault();
      const champs = {}; for (const [k, d] of Object.entries(s.champs)) { const el = form.elements[k]; if (!el || d.auto) continue; champs[k] = d.type === 'nombre' ? (el.value === '' ? null : Number(el.value)) : el.value; }
      if (circuit) champs.etapes_desactivees = [...desact].sort((a, b) => a - b).map(String);
      try {
        if (nouveau) { const r = await act({ op: 'ticket.creer', collection: coll, ticket: champs }, 'Ticket créé'); fermer(); ficheTicket(E[coll].elements.find(x => x.id === r.id)); }
        else { await act({ op: 'ticket.modifier', collection: coll, id: e.id, champs }, 'Enregistré'); }
      } catch {}
    } },
      Object.entries(s.champs).filter(([k, d]) => d.type === 'titre').map(([k, d]) => champ(k, d, val[k])),
      h('div', { class: 'grille2' }, Object.entries(s.champs).filter(([k, d]) => d.type !== 'titre' && !(d.max > 300) && k !== 'etapes_desactivees').map(([k, d]) => champ(k, d, val[k]))),
      circuit,
      Object.entries(s.champs).filter(([, d]) => d.max > 300).map(([k, d]) => champ(k, d, val[k])),
      h('div', { class: 'barre' }, h('button', { type: 'submit', class: 'btn prim', text: nouveau ? 'Créer' : 'Enregistrer' }),
        !nouveau ? h('button', { type: 'button', class: 'btn', text: 'Lancer dans Claude Code', onclick: () => lancer(e.id) }) : null,
        !nouveau && e.notion ? h('a', { class: 'btn', href: e.notion.url, target: '_blank', rel: 'noopener', text: 'Ouvrir dans Notion' }) : null,
        !nouveau && e.jira ? h('a', { class: 'btn', href: e.jira.url, target: '_blank', rel: 'noopener', text: 'Ouvrir ' + e.jira.cle + ' dans Jira' }) : null,
        !nouveau ? h('button', { type: 'button', class: 'btn dang', text: 'Supprimer', onclick: async () => { if (confirm('Supprimer ' + e.id + ' ?')) { await act({ op: 'ticket.supprimer', collection: coll, id: e.id }, 'Supprimé').catch(() => {}); fermer(); } } }) : null));
    const fil = h('div', { class: 'fil' }, h('p', { class: 'aide', text: 'Chargement des commentaires…' }));
    const rep = h('textarea', { placeholder: 'Votre réponse ou votre consigne (CEO)…', 'aria-label': 'Commentaire' });
    ouvrir(nouveau ? (coll === 'bugs' ? 'Nouveau bug' : 'Nouvelle feature') : e.id + ' — ' + e.titre, form,
      !nouveau ? h('div', { class: 'carte' }, h('h3', { text: 'Suivi et questions' }), fil, rep,
        h('div', { class: 'barre' }, h('button', { type: 'button', class: 'btn prim', text: 'Répondre', onclick: async () => {
          if (!rep.value.trim()) return toast('Écrivez votre réponse');
          await act({ op: 'ticket.commenter', collection: coll, id: e.id, texte: rep.value }, 'Réponse ajoutée').catch(() => {}); rep.value = ''; chargerFil(e.id, fil);
        } }))) : null);
    if (!nouveau) chargerFil(e.id, fil);
  }
  async function chargerFil(id, el) {
    const r = await fetch('/api/commentaires?id=' + encodeURIComponent(id)).then(x => x.json()).catch(() => ({ erreur: 'Commentaires indisponibles' }));
    if (r.erreur) return vider(el, h('p', { class: 'aide', text: r.erreur }));
    vider(el, r.commentaires.length ? r.commentaires.map(c => h('div', { class: 'com ' + (c.auteur === 'CEO' ? 'ceo' : c.type) },
      h('small', { text: (c.type === 'question' ? 'Question' : c.type === 'reponse' ? 'Réponse' : 'Suivi') + ' · ' + c.auteur + ' · ' + depuis(c.date) }), h('span', { text: c.texte })))
      : h('p', { class: 'aide', text: 'Aucun commentaire. Les agents y notent leur avancement et leurs questions.' }));
  }

  // ---------- Agents ----------
  // Moteurs d'agents présents sur la machine et leurs modèles, activés ou non par le CEO
  function carteMoteurs() {
    const ajout = {};
    return h('div', { class: 'carte' }, h('div', { class: 'barre' }, h('h3', { text: 'Moteurs d\'agents et modèles' }),
        btn2('Détecter à nouveau', () => act({ op: 'moteurs.detecter' }, 'Moteurs détectés'))),
      h('p', { class: 'aide', text: 'Ce qui est installé sur cette machine. Claude Code fait tourner le directeur et ses sous-agents ; un autre moteur (Codex, GitHub Copilot CLI) reçoit du directeur une tâche précise d\'un ticket (node siege/agent.js), dans le repo de la filiale, sous la garde du Siège. Un moteur ou un modèle désactivé est refusé par la garde et par l\'outil.' }),
      h('div', { class: 'moteurs' }, E.moteurs.map(m => h('div', { class: 'moteur' + (m.actif ? '' : ' eteint') },
        h('div', { class: 'barre' }, h('b', { text: m.libelle }), ' ',
          m.installe ? h('span', { class: 'muted mono', text: m.version }) : h('span', { class: 'tag attente', text: 'non installé' }),
          m.installe && m.nom !== 'claude' ? btn2(m.demande ? 'Désactiver' : 'Activer', () => act({ op: 'moteur.activer', nom: m.nom, oui: !m.demande }, m.demande ? m.libelle + ' désactivé' : m.libelle + ' activé'), false, m.demande ? '' : 'prim')
            : m.nom === 'claude' ? h('span', { class: 'tag ok', text: 'toujours actif (directeur)' }) : null),
        h('p', { class: 'aide', text: m.sousAgents ? 'Sous-agents du directeur (modèle choisi par agent).' : m.externe ? 'Agents lancés par le directeur pour une tâche précise.' : 'Détecté seulement : pas encore utilisable par le Siège.' }),
        m.modeles.length ? h('ul', { class: 'modeles' }, m.modeles.map(x => h('li', {},
          h('label', { class: 'coche' }, h('input', { type: 'checkbox', checked: x.actif, disabled: !m.installe, onchange: ev => act({ op: 'modele.activer', moteur: m.nom, id: x.id, oui: ev.target.checked }, x.id + (ev.target.checked ? ' activé' : ' désactivé')).catch(() => {}) }),
            ' ', h('span', { text: x.libelle }), ' ', h('span', { class: 'muted mono', text: x.id + (x.source === 'ajouté' ? ' · ajouté' : '') })),
          x.source === 'ajouté' ? h('button', { type: 'button', class: 'btn petit', text: 'Retirer', onclick: () => act({ op: 'modele.retirer', moteur: m.nom, id: x.id }, 'Retiré').catch(() => {}) }) : null)))
          : h('p', { class: 'aide', text: m.installe ? 'Aucun modèle détecté : ajoutez ceux que vous voulez autoriser.' : '' }),
        m.installe ? h('div', { class: 'barre' }, ajout[m.nom] = h('input', { placeholder: 'identifiant de modèle', 'aria-label': 'Ajouter un modèle à ' + m.libelle }),
          btn2('Ajouter', () => act({ op: 'modele.ajouter', moteur: m.nom, id: ajout[m.nom].value }, 'Modèle ajouté'))) : null))));
  }

  function rendreAgents() {
    vider($('#v-agents'), carteMoteurs(),
      h('div', { class: 'barre' }, h('p', { class: 'aide', text: 'Chaque agent est un fichier .claude/agents/<nom>.md lu par Claude Code. Les rôles de filiale servent toutes les filiales.' }),
        h('button', { type: 'button', class: 'btn prim', text: 'Nouvel agent', onclick: () => editeurAgent(null) })),
      ['filiale', 'groupe'].map(p => [h('h2', { text: p === 'filiale' ? 'Équipe de filiale' : 'Services partagés' }),
        h('div', { class: 'agents' }, E.agents.filter(a => a.portee === p).map(a => h('div', { class: 'carte agent' },
          h('div', { class: 'barre' }, h('h3', { text: a.nom }), h('span', { class: 'tag', text: a.modele || 'hérité' })),
          h('p', { text: a.description }), h('div', { class: 'meta' }, a.outils.map(o => h('span', { class: 'tag', text: o }))),
          h('div', { class: 'barre' }, h('button', { type: 'button', class: 'btn petit', text: 'Modifier', onclick: () => editeurAgent(a) })))))]));
  }
  function editeurAgent(a) {
    const nouveau = !a, v = a || { nom: '', description: '', modele: 'sonnet', outils: ['Read', 'Grep', 'Glob'], consigne: '' };
    const form = h('form', { class: 'carte', onsubmit: async ev => {
      ev.preventDefault();
      const agent = { nom: form.elements.nom.value.trim(), description: form.elements.description.value, modele: form.elements.modele.value, consigne: form.elements.consigne.value };
      try { await act({ op: nouveau ? 'agent.creer' : 'agent.modifier', agent }, nouveau ? 'Agent créé' : 'Agent enregistré'); fermer(); } catch {}
    } },
      h('label', { class: 'champ' }, h('span', {}, h('b', { text: 'Nom' }), ' (minuscules et tirets)'), h('input', { name: 'nom', value: v.nom, readonly: !nouveau, required: true, pattern: '[a-z][a-z0-9-]{1,40}' })),
      h('label', { class: 'champ' }, h('span', {}, h('b', { text: 'Description' }), ' — quand le directeur doit faire appel à lui'), h('textarea', { name: 'description', text: v.description, required: true })),
      h('label', { class: 'champ' }, h('span', {}, h('b', { text: 'Modèle' })), h('select', { name: 'modele' }, E.modeles.filter(m => m.actif || m.id === v.modele).map(m => h('option', { value: m.id, text: (m.id || '(par défaut)') + (m.actif ? '' : ' — désactivé'), selected: m.id === v.modele })))),
      h('div', { class: 'champ' }, h('span', {}, h('b', { text: 'Droits et skills' })),
        nouveau ? h('p', { class: 'aide', text: 'Un nouvel agent démarre en lecture seule. Ses droits (outils, dossiers, commandes, GitHub) se définissent dans droits/roles.json, ses skills dans l\'onglet Droits.' })
          : h('div', { class: 'meta' }, v.outils.map(o => h('span', { class: 'tag', text: o })), (v.skills || []).map(s => h('span', { class: 'tag question', text: s })))),
      h('label', { class: 'champ' }, h('span', {}, h('b', { text: 'Consigne' })), h('textarea', { name: 'consigne', class: 'code', text: v.consigne, required: true })),
      h('div', { class: 'barre' }, h('button', { type: 'submit', class: 'btn prim', text: nouveau ? 'Créer l\'agent' : 'Enregistrer' }),
        !nouveau ? h('button', { type: 'button', class: 'btn dang', text: 'Supprimer', onclick: async () => { if (confirm('Supprimer l\'agent ' + v.nom + ' ? Le directeur ne pourra plus lui confier de mission.')) { await act({ op: 'agent.supprimer', nom: v.nom }, 'Agent supprimé').catch(() => {}); fermer(); } } }) : null));
    ouvrir(nouveau ? 'Nouvel agent' : 'Agent ' + v.nom, form);
  }

  // ---------- Droits ----------
  const enAttente = () => ((E && E.droits && E.droits.exceptions) || []).filter(x => x.statut === 'demandee');
  const STATUT_EXC = { demandee: ['attend', 'À décider'], accordee: ['', 'Accordée, à activer'], active: ['on', 'Active'], terminee: ['', 'Terminée'], refusee: ['err', 'Refusée'] };
  const libRole = n => ((E.droits.roles.find(r => r.nom === n) || {}).libelle) || n;
  function carteException(x) {
    const com = h('input', { placeholder: 'Commentaire (facultatif)', 'aria-label': 'Commentaire', style: 'flex:1;min-width:180px' });
    return h('div', { class: 'carte' },
      h('div', { class: 'barre' }, h('span', { class: 'mono', text: x.id }), h('span', { class: 'pastille ' + STATUT_EXC[x.statut][0] }, h('i'), STATUT_EXC[x.statut][1]),
        h('span', { class: 'tag', text: x.agent }), x.ticket ? h('span', { class: 'tag', text: x.ticket }) : null, h('span', { class: 'muted', text: depuis(x.demandee_le) })),
      h('div', {}, h('b', { text: x.type + ' : ' }), h('span', { class: 'mono', text: x.motif })),
      h('p', { class: 'aide', text: x.justification }),
      x.commentaire_ceo ? h('p', { class: 'aide', text: 'Votre commentaire : ' + x.commentaire_ceo }) : null,
      x.statut === 'demandee' ? h('div', { class: 'barre' }, com,
        h('button', { type: 'button', class: 'btn prim', text: 'Accorder', onclick: () => act({ op: 'exception.accorder', id: x.id, commentaire: com.value }, x.id + ' accordée : le directeur peut l\'activer').catch(() => {}) }),
        h('button', { type: 'button', class: 'btn dang', text: 'Refuser', onclick: () => act({ op: 'exception.refuser', id: x.id, commentaire: com.value }, x.id + ' refusée').catch(() => {}) })) : null,
      ['accordee', 'active'].includes(x.statut) ? h('div', { class: 'barre' }, x.utilisations ? h('span', { class: 'aide', text: x.utilisations + ' utilisation(s)' }) : null,
        h('button', { type: 'button', class: 'btn petit', text: 'Révoquer', onclick: () => act({ op: 'exception.terminer', id: x.id }, x.id + ' révoquée').catch(() => {}) })) : null);
  }
  function rendreDroits() {
    const D = E.droits; if (D.erreur) return vider($('#v-droits'), h('p', { class: 'bandeau err', text: D.erreur }));
    const enCours = D.exceptions.filter(x => ['demandee', 'accordee', 'active'].includes(x.statut)), passees = D.exceptions.filter(x => !enCours.includes(x)).slice(0, 10);
    const typeA = h('select', { 'aria-label': 'Type' }, Object.entries({ domaine: 'Domaine réseau', commande: 'Commande hors bac à sable', regle: 'Commande pour un rôle' }).map(([v, t]) => h('option', { value: v, text: t })));
    const roleA = h('select', { 'aria-label': 'Rôle' }, D.roles.filter(r => r.nom !== 'directeur').map(r => h('option', { value: r.nom, text: r.nom })));
    const valA = h('input', { placeholder: 'pypi.org · npx playwright test · ^npx playwright test\\b', 'aria-label': 'Valeur', style: 'flex:1;min-width:220px' });
    const motA = h('input', { placeholder: 'Motif : pourquoi en permanence', 'aria-label': 'Motif', style: 'flex:1;min-width:220px' });
    const majRole = () => { roleA.hidden = typeA.value !== 'regle'; }; typeA.addEventListener('change', majRole); majRole();
    vider($('#v-droits'),
      h('p', { class: 'aide', text: 'Environnement fermé : chaque agent n\'a que les droits de son rôle ; le réseau est limité à GitHub et Notion. Vous seul accordez les exceptions et les autorisations permanentes.' }),
      h('h2', { text: 'Exceptions' }),
      enCours.length ? enCours.map(carteException) : h('p', { class: 'aide', text: 'Aucune exception en cours. Un agent bloqué passe par le directeur, qui vous la soumet ici.' }),
      passees.length ? h('details', {}, h('summary', { text: 'Historique (' + passees.length + ')' }), h('div', { class: 'file' }, passees.map(carteException))) : null,
      h('h2', { text: 'Refus récents de la garde' }),
      D.journal.length ? h('div', { class: 'journal' }, D.journal.slice(0, 15).map(j => h('div', {}, h('span', { class: 'muted', text: depuis(j.date) }), h('span', { class: 'mono', text: j.role }),
        h('span', {}, h('span', { class: 'pastille ' + (j.evenement === 'refus' ? 'err' : 'on') }, h('i'), { refus: 'Refus', exception_utilisee: 'Exception', exception_terminee: 'Fermée', erreur_garde: 'Erreur' }[j.evenement] || j.evenement)),
        h('span', { text: j.raison || j.exception || j.erreur || '' })))) : h('p', { class: 'aide', text: 'Aucun refus enregistré.' }),
      h('h2', { text: 'Autorisations permanentes hors bac à sable' }),
      h('div', { class: 'carte' },
        h('p', { class: 'aide', text: 'Toujours autorisés : ' + D.domainesBase.join(', ') + '. Ajoutez ici ce qui doit l\'être durablement ; .claude/settings.json est régénéré.' }),
        D.autorisations.liste.length ? h('div', { class: 'file' }, D.autorisations.liste.map(a => h('div', { class: 'file-l' }, h('span', { class: 'n', text: '+' }), h('span', { class: 'mono', text: a.id }),
          h('span', { text: `${a.type}${a.role ? ' (' + a.role + ')' : ''} : ${a.valeur} — ${a.motif}` }),
          h('button', { type: 'button', class: 'btn petit dang', text: 'Retirer', onclick: () => confirm('Retirer ' + a.id + ' ?') && act({ op: 'autorisation.retirer', id: a.id }, 'Autorisation retirée').catch(() => {}) })))) : null,
        h('div', { class: 'barre' }, typeA, roleA, valA),
        h('div', { class: 'barre' }, motA, h('button', { type: 'button', class: 'btn prim', text: 'Autoriser', onclick: () => act({ op: 'autorisation.ajouter', type: typeA.value, role: roleA.value, valeur: valA.value, motif: motA.value }, 'Autorisation ajoutée').catch(() => {}) })),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: D.autorisations.sandbox_obligatoire, onchange: ev => act({ op: 'sandbox.obligatoire', oui: ev.target.checked }, 'Réglage enregistré').catch(() => {}) }),
          ' Bac à sable obligatoire (Claude Code refuse de démarrer s\'il est indisponible)')),
      h('h2', { text: 'Droits par rôle' }),
      h('div', { class: 'agents' }, D.roles.map(r => h('div', { class: 'carte agent' },
        h('div', { class: 'barre' }, h('h3', { text: r.nom }), h('span', { class: 'muted', text: r.libelle })),
        h('p', {}, h('b', { text: 'Écrit dans : ' }), r.ecriture.length ? r.ecriture.join(', ') : 'rien (outils du Siège seulement)'),
        h('p', {}, h('b', { text: 'Commandes : ' }), r.commandes + ' règle(s)'),
        h('p', {}, h('b', { text: 'GitHub : ' }), Object.entries(r.github).map(([k, v]) => k + ' ' + v).join(', ') || 'aucun'),
        h('div', { class: 'meta' }, r.outils.map(o => h('span', { class: 'tag', text: o }))),
        r.nom !== 'directeur' ? h('div', { class: 'meta' }, r.skills.map(s => h('span', { class: 'tag', text: s })), r.skillsEntreprise.map(s => h('span', { class: 'tag question', text: s + ' (entreprise)' }))) : null))),
      h('h2', { text: 'Skills' }),
      h('div', { class: 'barre' }, h('p', { class: 'aide', text: 'Le socle est fourni avec l\'entreprise. Ajoutez vos skills (conventions, stack, métier) et choisissez les types d\'agents qui les reçoivent.' }),
        h('button', { type: 'button', class: 'btn prim', text: 'Nouvelle skill', onclick: editeurSkill })),
      h('div', { class: 'agents' }, D.skills.map(s => h('div', { class: 'carte agent' },
        h('div', { class: 'barre' }, h('h3', { text: s.nom }), h('span', { class: 'tag' + (s.socle ? '' : ' question'), text: s.commune ? 'tous les agents' : s.socle ? 'socle' : 'entreprise' })),
        h('p', { text: s.description }),
        s.commune ? null : h('div', { class: 'chips' }, D.roles.filter(r => r.nom !== 'directeur').map(r => {
          const base = r.skills.includes(s.nom);
          return h('label', {}, h('input', { type: 'checkbox', checked: base || r.skillsEntreprise.includes(s.nom), disabled: base,
            onchange: ev => act({ op: 'skill.affecter', nom: s.nom, role: r.nom, actif: ev.target.checked }, 'Skill ' + (ev.target.checked ? 'ajoutée à ' : 'retirée de ') + r.nom).catch(() => {}) }), r.nom);
        })),
        !s.socle ? h('div', { class: 'barre' }, h('button', { type: 'button', class: 'btn petit dang', text: 'Supprimer', onclick: () => confirm('Supprimer la skill ' + s.nom + ' ?') && act({ op: 'skill.supprimer', nom: s.nom }, 'Skill supprimée').catch(() => {}) })) : null))));
  }
  function editeurSkill() {
    const form = h('form', { class: 'carte', onsubmit: async ev => {
      ev.preventDefault();
      const roles = [...form.querySelectorAll('input[name=role]:checked')].map(x => x.value);
      try { await act({ op: 'skill.creer', skill: { nom: form.elements.nom.value.trim(), description: form.elements.description.value, contenu: form.elements.contenu.value, roles } }, 'Skill créée et préchargée chez ' + (roles.join(', ') || 'personne')); fermer(); } catch {}
    } },
      h('label', { class: 'champ' }, h('span', {}, h('b', { text: 'Nom' }), ' (minuscules et tirets, ex. conventions-api-kompta)'), h('input', { name: 'nom', required: true, pattern: '[a-z0-9][a-z0-9-]{1,63}' })),
      h('label', { class: 'champ' }, h('span', {}, h('b', { text: 'Description' }), ' — quand l\'agent doit l\'utiliser'), h('textarea', { name: 'description', required: true })),
      h('fieldset', { class: 'champ', style: 'border:0;padding:0;margin:0' }, h('legend', { text: 'Types d\'agents qui la reçoivent' }),
        h('div', { class: 'chips' }, E.droits.roles.filter(r => r.nom !== 'directeur').map(r => h('label', {}, h('input', { type: 'checkbox', name: 'role', value: r.nom }), r.nom)))),
      h('label', { class: 'champ' }, h('span', {}, h('b', { text: 'Contenu' }), ' (Markdown : méthode, conventions, exemples)'), h('textarea', { name: 'contenu', class: 'code', required: true })),
      h('div', { class: 'barre' }, h('button', { type: 'submit', class: 'btn prim', text: 'Créer la skill' })));
    ouvrir('Nouvelle skill', form);
  }

  // ---------- Réglages : intégrations du CEO (backlog Fichiers / Notion / Jira, App GitHub) ----------
  const retoursInteg = { jira: null, github: null };
  const btn2 = (text, f, disabled, cls) => h('button', { type: 'button', class: 'btn' + (cls ? ' ' + cls : ''), text, disabled: !!disabled, onclick: () => f().catch(() => {}) });

  // ---------- Demandes des collaborateurs (Telegram) ----------
  function rendreDemandes() {
    const T = E.messagerie, L = E.demandes, ouv = L.filter(x => !['Acceptée', 'Refusée', 'Close'].includes(x.statut));
    const fil = x => h('div', { class: 'fil' }, x.messages.map(m => h('p', { class: 'msg ' + (m.de === 'collaborateur' ? 'lui' : m.de === 'CEO' ? 'ceo' : 'dir') },
      h('b', { text: m.de === 'collaborateur' ? x.auteur.nom : m.de === 'CEO' ? 'CEO' : 'Directeur' }), ' ', h('span', { class: 'muted', text: new Date(m.date).toLocaleString('fr-FR') }), h('br'), m.texte)));
    vider($('#v-demandes'),
      h('div', { class: 'carte' }, h('h3', { text: 'Demandes des collaborateurs' }),
        h('p', { class: 'aide', text: T.canauxActifs.length ? `${T.canauxActifs.join(' et ')} actif${T.canauxActifs.length > 1 ? 's' : ''} · ${ouv.length} ouverte(s) · ${T.sessionsAujourdhui}/${T.plafondJour} sessions du directeur aujourd'hui` + (T.enCours ? ' · le directeur traite ' + T.enCours : '') + (T.file.length ? ' · en file : ' + T.file.join(', ') : '')
          : 'Ni Telegram ni Slack n\'est actif (Intégrations) : aucune demande n\'arrive.' })),
      L.length ? L.map(x => h('details', { class: 'carte demande', open: ['Chez le CEO', 'À valider', 'Nouvelle'].includes(x.statut) },
        h('summary', {}, h('b', { text: x.id }), ' ', h('span', { class: 'tag' + (x.statut === 'Chez le CEO' ? ' question' : ['Acceptée'].includes(x.statut) ? ' ok' : ''), text: x.statut }), ' ', x.auteur.nom,
          x.type ? ' · ' + x.type : '', x.ticket ? ' → ' + x.ticket : '', ' — ', h('span', { class: 'muted', text: (x.resume || (x.messages[0] || {}).texte || '').slice(0, 90) })),
        fil(x),
        !['Acceptée', 'Refusée', 'Close'].includes(x.statut) ? h('div', { class: 'barre' }, btn2('Relancer le directeur', () => act({ op: 'demande.relancer', id: x.id }, 'Relancé'))) : null))
        : h('p', { class: 'aide', text: 'Aucune demande pour l\'instant.' }));
  }   // résultats d'initialisation / de test, gardés d'un rendu à l'autre
  function rendreReglages() {
    const vue = $('#v-reglages'); delete vue.dataset.modifie;
    vue.oninput = () => { vue.dataset.modifie = '1'; };
    const I = E.integrations, J = I.jira.config || {}, G = I.github;
    const mot = (ph, label) => h('input', { type: 'password', placeholder: ph, autocomplete: 'off', 'aria-label': label });
    const champ = (label, el) => h('label', { class: 'champ' }, h('span', { text: label }), el);
    const etat = (ok, oui, non) => h('span', { class: 'tag' + (ok ? ' ok' : ' attente'), text: ok ? oui : non });
    const LIB = { fichier: 'Fichiers locaux', notion: 'Notion', jira: 'Jira' };

    // Où vit le backlog
    const sources = h('div', { class: 'carte' }, h('h3', { text: 'Où vit le backlog' }),
      h('p', { class: 'aide' }, 'Actif : ', h('b', { text: LIB[I.actif] }), '. Les agents passent toujours par node siege/backlog.js, quelle que soit la source. Changer de source ne modifie ni ne supprime rien dans les autres.'),
      h('div', { class: 'barre' },
        h('button', { type: 'button', class: 'btn', text: 'Fichiers locaux', disabled: I.actif === 'fichier', onclick: () => act({ op: 'source.fichier' }, 'Backlog : fichiers locaux').catch(() => {}) }),
        h('button', { type: 'button', class: 'btn', text: 'Notion', disabled: I.actif === 'notion' || !I.notion.configure, onclick: () => act({ op: 'source.notion' }, 'Backlog : Notion').catch(() => {}) }),
        h('button', { type: 'button', class: 'btn', text: 'Jira', disabled: I.actif === 'jira' || !(J.initialise), onclick: () => act({ op: 'source.jira' }, 'Backlog : Jira').catch(() => {}) }),
        h('button', { type: 'button', class: 'btn', text: 'Importer le backlog local dans la source active', disabled: I.actif === 'fichier', onclick: () => act({ op: 'backlog.importer' }).then(r => toast('Importés : ' + r.features + ' features, ' + r.bugs + ' bugs')).catch(() => {}) })));

    // Notion
    const jN = mot('ntn_…', 'Jeton Notion'), page = h('input', { placeholder: 'https://www.notion.so/… (page partagée avec l\'intégration)', 'aria-label': 'Page Notion', style: 'flex:1;min-width:240px' });
    const notion = h('div', { class: 'carte' }, h('h3', {}, 'Notion ', etat(I.notion.configure, 'bases créées', 'non branché')),
      h('ol', { class: 'aide' },
        h('li', {}, 'Créez une intégration interne sur ', h('a', { href: 'https://www.notion.so/profile/integrations', target: '_blank', rel: 'noopener', text: 'notion.so/profile/integrations' }), ' : lire, mettre à jour et insérer du contenu ; lire et insérer des commentaires.'),
        h('li', { text: 'Collez son jeton (gardé dans ~/.siege, jamais dans le dépôt), puis le lien d\'une page partagée avec elle : le Siège y crée les bases Features et Bugs.' })),
      h('div', { class: 'barre' }, jN, h('button', { type: 'button', class: 'btn', text: I.notion.jeton ? 'Remplacer le jeton' : 'Enregistrer le jeton', onclick: () => act({ op: 'notion.jeton', jeton: jN.value }, 'Jeton Notion enregistré').then(() => { jN.value = ''; }).catch(() => {}) })),
      h('div', { class: 'barre' }, page, h('button', { type: 'button', class: 'btn prim', text: 'Créer les bases', disabled: I.notion.configure || !I.notion.jeton, onclick: () => act({ op: 'notion.init', page: page.value }, 'Bases Notion créées').catch(() => {}) })));

    // Jira
    const f = {
      mode: h('select', {}, [['cloud', 'Jira Cloud (…atlassian.net)'], ['dc', 'Jira Data Center / Server']].map(([v, t]) => h('option', { value: v, text: t, selected: (J.mode || 'cloud') === v }))),
      url: h('input', { value: J.url || '', placeholder: 'https://entreprise.atlassian.net' }),
      email: h('input', { value: J.email || '', placeholder: 'compte du jeton (Cloud seulement)', type: 'email' }),
      projet: h('input', { value: J.projet || '', placeholder: 'PROJ (où les tickets sont créés)' }),
      etiquette: h('input', { value: J.etiquette || 'bureau-ia' }),
      typeFeature: h('input', { value: (J.types || {}).features || 'Story' }), typeBug: h('input', { value: (J.types || {}).bugs || 'Bug' }),
      restreindre: h('input', { type: 'checkbox', checked: !!J.restreindre })
    };
    const statuts = [...new Set([...E.schemas.features.champs.statut.options, ...E.schemas.bugs.champs.statut.options])];
    const corresp = Object.fromEntries(statuts.map(st => [st, h('input', { value: (J.statuts || {})[st] || '', placeholder: 'même nom' })]));
    const jJ = mot('jeton d\'API ou jeton personnel', 'Jeton Jira'), retour = h('div', { class: 'aide' });
    const majMail = () => { f.email.closest('label').hidden = f.mode.value !== 'cloud'; };
    f.mode.onchange = majMail;
    const jiraC = h('div', { class: 'carte' }, h('h3', {}, 'Jira ', etat(J.initialise, 'initialisé', 'non branché')),
      h('ol', { class: 'aide' },
        h('li', {}, 'Cloud : créez un jeton d\'API sur ', h('a', { href: 'https://id.atlassian.com/manage-profile/security/api-tokens', target: '_blank', rel: 'noopener', text: 'id.atlassian.com' }), '. Data Center : profil › Jetons d\'accès personnels. Le compte doit être administrateur Jira pour créer les champs « Siège … ».'),
        h('li', { text: 'Le Siège ne voit que les tickets de type Story (Features) et Bug (Bugs) portant l\'étiquette ci-dessous, parmi tous vos tableaux. L\'identifiant du Siège (COL-001, BUG-001) fait foi ; la clé Jira sert de lien.' }),
        h('li', { text: 'Initialiser : vérifie l\'accès et le projet, crée les champs manquants (rien n\'est supprimé) et les ajoute à l\'écran par défaut. Un avertissement dit ce qu\'un admin doit ajouter aux écrans propres au projet.' })),
      h('div', { class: 'barre' }, jJ, h('button', { type: 'button', class: 'btn', text: I.jira.jeton ? 'Remplacer le jeton' : 'Enregistrer le jeton', onclick: () => act({ op: 'jira.jeton', jeton: jJ.value }, 'Jeton Jira enregistré').then(() => { jJ.value = ''; }).catch(() => {}) })),
      h('div', { class: 'grille2' }, champ('Type de Jira', f.mode), champ('Adresse', f.url), champ('E-mail', f.email), champ('Projet', f.projet),
        champ('Étiquette', f.etiquette), champ('Type des Features', f.typeFeature), champ('Type des Bugs', f.typeBug),
        h('label', { class: 'champ coche' }, f.restreindre, h('span', { text: 'Ne lire que ce projet (sinon : étiquette sur tous les projets)' }))),
      h('details', {}, h('summary', { text: 'Statuts Jira correspondants (facultatif)' }),
        h('p', { class: 'aide', text: 'Le statut du Siège est toujours gardé dans « Siège Statut ». Si le workflow Jira a une transition vers le statut indiqué (ou du même nom), le Siège la fait pour que vos tableaux suivent.' }),
        h('div', { class: 'grille2' }, statuts.map(st => champ(st, corresp[st])))),
      h('div', { class: 'barre' }, h('button', { type: 'button', class: 'btn prim', text: J.initialise ? 'Réinitialiser (champs manquants seulement)' : 'Initialiser Jira', disabled: !I.jira.jeton, onclick: () => {
        const op = { op: 'jira.init', ...Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.type === 'checkbox' ? el.checked : el.value])), statuts: Object.fromEntries(Object.entries(corresp).map(([k, el]) => [k, el.value])) };
        act(op).then(r => { retoursInteg.jira = r; toast('Jira initialisé'); rendreReglages(); }).catch(() => {});
      } })), retour);
    if (retoursInteg.jira) { const r = retoursInteg.jira; vider(retour, h('p', { text: 'Connecté en tant que ' + r.moi + '. Champs créés : ' + (r.crees.join(', ') || 'aucun (déjà là)') + '.' }), r.avertissements.length ? h('ul', {}, r.avertissements.map(a => h('li', { class: 'attention', text: a }))) : null); }
    setTimeout(majMail);

    // GitHub
    const gUrl = h('input', { value: G.url || 'https://github.com', placeholder: 'https://github.com ou https://<nom>.ghe.com ou https://github.entreprise.fr', 'aria-label': 'Adresse GitHub' });
    const gApp = h('input', { value: G.app_id || '', placeholder: '123456', inputmode: 'numeric' }), gInst = h('input', { value: G.installation_id || '', placeholder: '98765432', inputmode: 'numeric' });
    const gRepos = Object.fromEntries(G.dossiers.map(d => [d, h('input', { value: G.repos[d] || '', placeholder: 'compte/repo' })]));
    const pem = h('textarea', { placeholder: '-----BEGIN RSA PRIVATE KEY-----\n…', 'aria-label': 'Clé privée de l\'App', rows: 3, autocomplete: 'off' });
    const fichierPem = h('input', { type: 'file', accept: '.pem', 'aria-label': 'Fichier .pem' });
    fichierPem.onchange = () => { const x = fichierPem.files[0]; if (x) x.text().then(t => { pem.value = t; }); };
    const retourG = h('div', { class: 'aide' });
    const github = h('div', { class: 'carte' }, h('h3', {}, 'GitHub ', etat(G.configure && G.cle, 'App configurée', 'non branché')),
      h('ol', { class: 'aide' },
        h('li', { text: 'Adresse GitHub : github.com, ou celle de votre GitHub Enterprise (Cloud avec résidence des données : https://<nom>.ghe.com ; Server : https://<votre serveur>). API, push et réseau du bac à sable suivent cette adresse.' }),
        h('li', {}, 'Créez une App GitHub (', h('a', { href: (G.url || 'https://github.com') + '/settings/apps/new', target: '_blank', rel: 'noopener', text: (G.url || 'https://github.com').replace('https://', '') + '/settings/apps/new' }), ', ou dans les réglages de l\'organisation) : Contents, Pull requests, Commit statuses en lecture-écriture, Metadata en lecture. Installez-la sur les repos des filiales seulement.'),
        h('li', { text: 'Renseignez l\'App ID, l\'Installation ID et la clé privée (.pem, gardée dans ~/.siege, jamais dans le dépôt), puis le repo GitHub de chaque filiale. Chaque agent reçoit un jeton d\'une heure limité à un repo et à son rôle.' })),
      h('div', { class: 'grille2' }, champ('Adresse GitHub', gUrl), champ('App ID', gApp), champ('Installation ID', gInst), G.dossiers.map(d => champ('Repo de ' + d, gRepos[d]))),
      h('div', { class: 'barre' }, h('button', { type: 'button', class: 'btn prim', text: 'Enregistrer', onclick: () => act({ op: 'github.config', url: gUrl.value.trim(), app_id: gApp.value, installation_id: gInst.value, repos: Object.fromEntries(Object.entries(gRepos).map(([k, el]) => [k, el.value.trim()])) }, 'GitHub enregistré').catch(() => {}) })),
      champ(G.cle ? 'Remplacer la clé privée' : 'Clé privée de l\'App', pem), h('div', { class: 'barre' }, fichierPem,
        h('button', { type: 'button', class: 'btn', text: 'Enregistrer la clé', onclick: () => act({ op: 'github.cle', pem: pem.value }, 'Clé enregistrée').then(() => { pem.value = ''; fichierPem.value = ''; }).catch(() => {}) }),
        h('button', { type: 'button', class: 'btn', text: 'Tester la connexion', disabled: !(G.configure && G.cle), onclick: () => act({ op: 'github.tester' }).then(r => { retoursInteg.github = r; rendreReglages(); }).catch(() => {}) })), retourG);
    if (retoursInteg.github) { const r = retoursInteg.github; vider(retourG,
      h('p', { text: 'App « ' + r.app + ' » : ' + r.accessibles.length + ' repo(s) accessible(s).' }),
      r.manquants.length ? h('p', { class: 'attention', text: 'Repos déclarés mais non accessibles à l\'App (installez-la dessus) : ' + r.manquants.join(', ') }) : h('p', { text: 'Tous les repos déclarés sont accessibles.' })); }

    // Messagerie : Telegram et Slack (mêmes fonctions), file et plafond communs
    const M = E.messagerie, plaf = h('input', { type: 'number', min: 1, max: 1000, value: M.plafondJour, 'aria-label': 'Plafond', style: 'width:90px' });
    const pers = (p, boutons) => h('li', {}, h('b', { text: p.nom }), p.username ? ' @' + p.username : '', ' ', h('span', { class: 'muted mono', text: '#' + p.id }), ' ', boutons);
    const btn = (t, op, msg, cls) => h('button', { type: 'button', class: 'btn petit' + (cls ? ' ' + cls : ''), text: t, onclick: () => act(op, msg).catch(() => {}) });
    // Les personnes d'un canal : CEO, demandes d'accès, collaborateurs autorisés
    const personnes = (nom, X, premierMot) => [
      h('h4', { text: 'CEO' }), X.ceo ? h('ul', {}, pers(X.ceo, btn('Retirer', { op: nom + '.retirer', id: X.ceo.id }, 'Retiré'))) : h('p', { class: 'aide', text: 'Pas encore désigné.' }),
      h('h4', { text: 'Demandes d\'accès (' + X.enAttente.length + ')' }),
      X.enAttente.length ? h('ul', {}, X.enAttente.map(a => pers(a, h('span', {}, btn('Autoriser', { op: nom + '.autoriser', id: a.id }, 'Accès ouvert', 'prim'), ' ', btn('C\'est moi, le CEO', { op: nom + '.ceo', id: a.id }, 'CEO enregistré'), ' ', btn('Refuser', { op: nom + '.retirer', id: a.id }, 'Refusé'))))) : h('p', { class: 'aide', text: 'Aucune. ' + premierMot }),
      h('h4', { text: 'Collaborateurs autorisés (' + X.collaborateurs.length + ')' }),
      X.collaborateurs.length ? h('ul', {}, X.collaborateurs.map(c => pers(c, btn('Retirer', { op: nom + '.retirer', id: c.id }, 'Accès retiré')))) : h('p', { class: 'aide', text: 'Aucun.' })];
    const messagerieC = h('div', { class: 'carte' }, h('h3', {}, 'Messagerie des collaborateurs ', etat(M.canauxActifs.length, M.canauxActifs.join(' + ') || '', 'inactive')),
      h('p', { class: 'aide', text: 'Option, sur Teams, Telegram et/ou Slack : les collaborateurs écrivent au directeur (bug, évolution) ; chaque message lance une courte session du directeur, qui leur répond, leur fait valider un résumé, crée le ticket et vous transmet ce qui doit l\'être. Il vous prévient aussi des questions d\'agents et des exceptions à décider (que vous tranchez toujours ici). Les collaborateurs n\'ont jamais accès au Siège.' }),
      h('div', { class: 'barre' }, h('span', { class: 'aide', text: 'Sessions automatiques du directeur (tous canaux) : ' + M.sessionsAujourdhui + ' aujourd\'hui, plafond par jour ' }), plaf,
        btn2('Enregistrer', () => act({ op: 'messagerie.plafond', n: Number(plaf.value) }, 'Plafond enregistré'))));

    const T = E.telegram, jT = mot('123456789:AA…', 'Jeton du bot Telegram');
    const telegram = h('div', { class: 'carte' }, h('h3', {}, 'Telegram ', etat(T.actif, 'actif', T.jeton ? 'inactif' : 'non branché')),
      h('ol', { class: 'aide' },
        h('li', {}, 'Créez un bot avec ', h('a', { href: 'https://t.me/BotFather', target: '_blank', rel: 'noopener', text: '@BotFather' }), ' (/newbot) et collez son jeton.'),
        h('li', { text: 'Activez, puis envoyez /start au bot depuis votre compte : vous apparaissez ci-dessous, désignez-vous comme CEO.' }),
        h('li', { text: 'Chaque collaborateur envoie /start au bot : autorisez-le ici. Un inconnu n\'obtient jamais de réponse du directeur.' })),
      h('div', { class: 'barre' }, jT, btn2(T.jeton ? 'Remplacer le jeton' : 'Enregistrer le jeton', () => act({ op: 'telegram.jeton', jeton: jT.value }, 'Jeton du bot enregistré').then(() => { jT.value = ''; })),
        btn2('Tester', () => act({ op: 'telegram.tester' }).then(r => toast('Bot @' + r.bot + ' joignable')), !T.jeton),
        btn2(T.actif ? 'Désactiver' : 'Activer', () => act({ op: 'telegram.activer', oui: !T.actif }, T.actif ? 'Telegram désactivé' : 'Telegram activé'), !T.jeton, T.actif ? '' : 'prim')),
      T.bot ? h('p', { class: 'aide' }, 'Bot : ', h('a', { href: 'https://t.me/' + T.bot, target: '_blank', rel: 'noopener', text: '@' + T.bot })) : null,
      personnes('telegram', T, 'Une personne apparaît ici dès qu\'elle écrit au bot.'));

    const S = E.slack, jB = mot('xoxb-…', 'Jeton du bot Slack'), jA = mot('xapp-…', 'Jeton de l\'app Slack');
    const manif = h('textarea', { readonly: true, rows: 8, class: 'mono', 'aria-label': 'Manifeste de l\'app Slack', text: JSON.stringify(S.manifeste, null, 2) });
    const slack = h('div', { class: 'carte' }, h('h3', {}, 'Slack ', etat(S.actif, S.connecte ? 'connecté' : 'actif', S.jetonBot ? 'inactif' : 'non branché')),
      !S.disponible ? h('p', { class: 'attention', text: 'Slack demande Node 22 ou plus sur ce poste (WebSocket intégré).' }) : null,
      h('ol', { class: 'aide' },
        h('li', {}, 'Sur ', h('a', { href: 'https://api.slack.com/apps?new_app=1', target: '_blank', rel: 'noopener', text: 'api.slack.com/apps' }), ' : Create New App › From a manifest, choisissez votre espace, collez le manifeste ci-dessous, puis Install to Workspace.'),
        h('li', { text: 'Collez le jeton du bot (OAuth & Permissions, xoxb-…) et un jeton d\'app (Basic Information › App-Level Tokens, droit connections:write, xapp-…). Le Siège se connecte lui-même à Slack (Socket Mode) : aucune adresse publique.' }),
        h('li', { text: 'Activez, écrivez au bot en message direct depuis votre compte, désignez-vous comme CEO, puis autorisez chaque collaborateur qui lui écrit. Pour ajouter une consigne à une décision, répondez en fil sous la notification.' })),
      h('details', {}, h('summary', { text: 'Manifeste de l\'app Slack' }), manif, h('div', { class: 'barre' }, btn2('Copier', () => navigator.clipboard.writeText(manif.value).then(() => toast('Manifeste copié'))))),
      h('div', { class: 'barre' }, jB, jA, btn2('Enregistrer les jetons', () => act({ op: 'slack.jetons', bot: jB.value, app: jA.value }, 'Jetons Slack enregistrés').then(() => { jB.value = ''; jA.value = ''; })),
        btn2('Tester', () => act({ op: 'slack.tester' }).then(r => toast('Slack joignable : ' + r.equipe + ' (bot ' + r.bot + ')')), !(S.jetonBot && S.jetonApp)),
        btn2(S.actif ? 'Désactiver' : 'Activer', () => act({ op: 'slack.activer', oui: !S.actif }, S.actif ? 'Slack désactivé' : 'Slack activé'), !(S.jetonBot && S.jetonApp && S.disponible), S.actif ? '' : 'prim')),
      S.equipe ? h('p', { class: 'aide', text: 'Espace Slack : ' + S.equipe }) : null,
      personnes('slack', S, 'Une personne apparaît ici dès qu\'elle écrit au bot en message direct.'));

    // GitHub Copilot : connexion comme dans l'extension Copilot des IDE (github.com ou GitHub Enterprise Cloud)
    const C = E.copilot, cMode = h('select', { 'aria-label': 'Connexion Copilot' }, [['github.com', 'GitHub.com'], ['ghe.com', 'GitHub Enterprise Cloud (<nom>.ghe.com)']].map(([v, t]) => h('option', { value: v, text: t, selected: C.connexion === v })));
    const cHote = h('input', { value: C.hote || '', placeholder: 'entreprise.ghe.com', 'aria-label': 'Adresse GitHub Enterprise Cloud' }), cJeton = mot('github_pat_… (facultatif)', 'Jeton Copilot');
    const majHote = () => { cHote.closest('label').hidden = cMode.value !== 'ghe.com'; }; cMode.onchange = majHote; setTimeout(majHote);
    const copilotC = h('div', { class: 'carte' }, h('h3', {}, 'GitHub Copilot ', etat(E.moteurs.some(m => m.nom === 'copilot' && m.installe), 'CLI installé', 'CLI non installé')),
      h('p', { class: 'aide', text: 'Pour les agents Copilot (Siège › Agents › Moteurs). Connexion comme dans l\'extension Copilot de votre IDE : GitHub.com, ou l\'adresse de votre GitHub Enterprise Cloud.' }),
      h('div', { class: 'grille2' }, champ('Connexion', cMode), champ('Adresse', cHote)),
      h('div', { class: 'barre' }, btn2('Enregistrer', () => act({ op: 'copilot.connexion', connexion: cMode.value, hote: cHote.value }, 'Connexion Copilot enregistrée'))),
      h('ol', { class: 'aide' },
        h('li', {}, 'Une fois sur ce poste, dans un terminal : ', h('code', { text: C.commande }), ' (navigateur ou code d\'appareil ; le jeton reste dans le gestionnaire d\'identification du système).'),
        h('li', { text: 'Ou, sans session ouverte, un jeton fin (github_pat_…) avec la permission « Copilot Requests » : gardé dans ~/.siege, jamais renvoyé à la page. Les jetons classiques (ghp_…) ne sont pas acceptés par Copilot CLI.' })),
      h('div', { class: 'barre' }, cJeton, btn2(C.jeton ? 'Remplacer le jeton' : 'Enregistrer le jeton', () => act({ op: 'copilot.jeton', jeton: cJeton.value }, 'Jeton Copilot enregistré').then(() => { cJeton.value = ''; })),
        C.jeton ? btn2('Oublier le jeton', () => act({ op: 'copilot.oublier' }, 'Jeton oublié')) : null,
        btn2('Tester (1 requête)', () => act({ op: 'copilot.tester' }).then(r => toast('Copilot répond : ' + r.sortie)))));

    // Teams : compte Directeur (Microsoft 365) lu par Graph, sans adresse publique
    const TM = E.teams, tTen = h('input', { value: TM.tenant || '', placeholder: 'entreprise.onmicrosoft.com ou ID d\'annuaire', 'aria-label': 'Tenant' }), tCli = h('input', { value: TM.clientId || '', placeholder: '00000000-0000-0000-0000-000000000000', 'aria-label': 'ID d\'application' });
    const teamsC = h('div', { class: 'carte' }, h('h3', {}, 'Microsoft Teams ', etat(TM.actif && TM.connecte, 'actif', TM.connecte ? 'inactif' : 'non branché')),
      h('ol', { class: 'aide' },
        h('li', { text: 'Avec votre administrateur Microsoft 365 : un compte dédié « Directeur » (licence Teams) et une inscription d\'application Entra : client public autorisé (Allow public client flows), permissions déléguées User.Read, Chat.ReadWrite et offline_access, consentement de l\'administrateur. Aucune adresse publique n\'est nécessaire : le Siège lit les conversations par Microsoft Graph.' }),
        h('li', { text: 'Renseignez le tenant et l\'ID d\'application, puis « Connecter le compte Directeur » : ouvrez le lien, saisissez le code et connectez-vous avec ce compte (aucun mot de passe n\'est gardé).' }),
        h('li', { text: 'Activez. Écrivez au compte Directeur dans Teams depuis votre compte, désignez-vous CEO ; chaque collaborateur lui écrit, vous l\'autorisez. Pas de boutons sur Teams : on répond « oui » / « non », et vous « accepter DEM-… », « refuser DEM-… » ou « DEM-… : consigne ».' })),
      h('div', { class: 'grille2' }, champ('Tenant', tTen), champ('ID d\'application (client)', tCli)),
      h('div', { class: 'barre' }, btn2('Enregistrer', () => act({ op: 'teams.config', tenant: tTen.value, clientId: tCli.value }, 'Teams enregistré')),
        btn2(TM.connecte ? 'Reconnecter le compte Directeur' : 'Connecter le compte Directeur', () => act({ op: 'teams.connexion' }).then(() => {}), !(TM.tenant && TM.clientId)),
        TM.connecte ? btn2('Déconnecter', () => act({ op: 'teams.deconnecter' }, 'Compte déconnecté')) : null,
        btn2(TM.actif ? 'Désactiver' : 'Activer', () => act({ op: 'teams.activer', oui: !TM.actif }, TM.actif ? 'Teams désactivé' : 'Teams activé'), !TM.connecte, TM.actif ? '' : 'prim')),
      TM.connexion && TM.connexion.etat === 'en_attente' ? h('p', { class: 'attention' }, 'Ouvrez ', h('a', { href: TM.connexion.url, target: '_blank', rel: 'noopener', text: TM.connexion.url }), ' et saisissez le code ', h('b', { class: 'mono', text: TM.connexion.code }), ' (connexion avec le compte Directeur).') : null,
      TM.connexion && TM.connexion.etat === 'echec' ? h('p', { class: 'attention', text: 'La connexion n\'a pas abouti (code expiré ou refusé) : recommencez.' }) : null,
      TM.moi ? h('p', { class: 'aide', text: 'Connecté : ' + TM.moi.nom }) : null,
      personnes('teams', TM, 'Une personne apparaît ici dès qu\'elle écrit au compte Directeur dans Teams.'));

    vider($('#v-reglages'), sources, copilotC, messagerieC, teamsC, telegram, slack, jiraC, notion, github,
      h('div', { class: 'carte' }, h('h3', { text: 'Siège' }), h('p', { class: 'mono muted', text: E.racine }),
        h('p', { class: 'aide', text: 'Jetons et clé privée restent sur ce poste (~/.siege, droits 600) et ne sont jamais renvoyés à la page.' })));
  }

  charger();
  setInterval(() => { if (!document.hidden) charger(true); }, 10e3);
})();
