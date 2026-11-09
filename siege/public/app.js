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

  async function charger() {
    try { const r = await fetch('/api/etat', { cache: 'no-store' }); E = await r.json(); rendre(); }
    catch { bandeau('Le serveur du Siège ne répond pas.', true); }
  }
  async function act(op, ok) {
    const r = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Siege-Csrf': E.csrf }, body: JSON.stringify(op) });
    const j = await r.json().catch(() => ({ erreur: 'Réponse illisible' }));
    if (!r.ok) { toast(j.erreur || 'Erreur'); throw new Error(j.erreur); }
    if (ok) toast(ok); await charger(); return j.resultat;
  }
  function bandeau(m, err) { const b = $('#bandeau'); b.hidden = !m; b.textContent = m || ''; b.classList.toggle('err', !!err); }

  // ---------- Rendu global ----------
  function rendre() {
    const f = E.features.elements, b = E.bugs.elements, act = E.activite.missions.filter(m => m.etat === 'au_poste');
    vider($('#counts'),
      h('span', {}, h('b', { text: f.filter(x => x.statut === 'Livré').length + '/' + f.length }), 'features livrées'),
      h('span', {}, h('b', { text: b.filter(x => ['Ouvert', 'En correction', 'À vérifier'].includes(x.statut)).length }), 'bugs ouverts'),
      h('span', { class: E.questions.liste.length ? 'alerte' : '' }, h('b', { text: E.questions.liste.length }), 'question(s) pour vous'),
      h('span', { class: enAttente().length ? 'alerte' : '' }, h('b', { text: enAttente().length }), 'exception(s) à décider'),
      h('span', {}, h('b', { text: act.length }), 'agent(s) au poste'),
      h('span', {}, 'Backlog : ', h('b', { text: E.source.type === 'notion' ? 'Notion' : 'fichiers locaux' })));
    const errs = [E.features.erreur, E.bugs.erreur, E.questions.erreur, E.activite.erreur].filter(Boolean);
    bandeau(errs.length ? [...new Set(errs)].join(' · ') : '', true);
    ({ bureau: rendreBureau, backlog: rendreBacklog, agents: rendreAgents, droits: rendreDroits, reglages: rendreReglages })[vue]();
  }
  document.querySelectorAll('.tabs button').forEach(bt => bt.addEventListener('click', () => {
    vue = bt.dataset.v; document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', x === bt));
    document.querySelectorAll('.vue').forEach(s => { s.hidden = s.id !== 'v-' + vue; }); rendre();
  }));

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
        qu ? h('span', { class: 'tag question', text: 'question' }) : null),
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
  function ficheTicket(e) {
    const s = schema(), nouveau = !e, val = e || {};
    const form = h('form', { class: 'carte', onsubmit: async ev => {
      ev.preventDefault();
      const champs = {}; for (const [k, d] of Object.entries(s.champs)) { const el = form.elements[k]; if (!el || d.auto) continue; champs[k] = d.type === 'nombre' ? (el.value === '' ? null : Number(el.value)) : el.value; }
      try {
        if (nouveau) { const r = await act({ op: 'ticket.creer', collection: coll, ticket: champs }, 'Ticket créé'); fermer(); ficheTicket(E[coll].elements.find(x => x.id === r.id)); }
        else { await act({ op: 'ticket.modifier', collection: coll, id: e.id, champs }, 'Enregistré'); }
      } catch {}
    } },
      Object.entries(s.champs).filter(([k, d]) => d.type === 'titre').map(([k, d]) => champ(k, d, val[k])),
      h('div', { class: 'grille2' }, Object.entries(s.champs).filter(([, d]) => d.type !== 'titre' && !(d.max > 300)).map(([k, d]) => champ(k, d, val[k]))),
      Object.entries(s.champs).filter(([, d]) => d.max > 300).map(([k, d]) => champ(k, d, val[k])),
      h('div', { class: 'barre' }, h('button', { type: 'submit', class: 'btn prim', text: nouveau ? 'Créer' : 'Enregistrer' }),
        !nouveau ? h('button', { type: 'button', class: 'btn', text: 'Lancer dans Claude Code', onclick: () => lancer(e.id) }) : null,
        !nouveau && e.notion ? h('a', { class: 'btn', href: e.notion.url, target: '_blank', rel: 'noopener', text: 'Ouvrir dans Notion' }) : null,
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
  function rendreAgents() {
    vider($('#v-agents'),
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
      h('label', { class: 'champ' }, h('span', {}, h('b', { text: 'Modèle' })), h('select', { name: 'modele' }, E.modeles.map(m => h('option', { value: m, text: m || '(par défaut)', selected: m === v.modele })))),
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

  // ---------- Réglages ----------
  function rendreReglages() {
    const s = E.source, jeton = h('input', { type: 'password', placeholder: 'ntn_…', autocomplete: 'off', 'aria-label': 'Jeton Notion' });
    const page = h('input', { placeholder: 'https://www.notion.so/… (page partagée avec l\'intégration)', 'aria-label': 'Page Notion', style: 'flex:1;min-width:240px' });
    vider($('#v-reglages'),
      h('div', { class: 'carte' }, h('h3', { text: 'Où vit le backlog' }),
        h('p', { class: 'aide', text: s.type === 'notion' ? 'Notion' + (s.configure ? '' : ' (bases non configurées)') + ' — jeton ' + (s.jeton ? 'présent' : 'absent') : 'Fichiers locaux : portfolio/features.json, portfolio/bugs.json, portfolio/commentaires.json' }),
        s.type === 'notion' ? h('div', { class: 'barre' }, h('button', { type: 'button', class: 'btn', text: 'Revenir aux fichiers locaux', onclick: () => confirm('Le backlog local sera de nouveau utilisé (Notion n\'est pas modifié). Continuer ?') && act({ op: 'source.fichier' }, 'Backlog local') })) : null),
      h('div', { class: 'carte' }, h('h3', { text: 'Brancher Notion' }),
        h('ol', { class: 'aide' },
          h('li', {}, 'Créez une intégration interne sur ', h('a', { href: 'https://www.notion.so/profile/integrations', target: '_blank', rel: 'noopener', text: 'notion.so/profile/integrations' }), ' avec les droits : lire, mettre à jour et insérer du contenu ; lire et insérer des commentaires.'),
          h('li', { text: 'Collez son jeton ci-dessous (gardé dans ~/.siege, jamais dans le dépôt).' }),
          h('li', { text: 'Dans Notion, partagez une page avec l\'intégration (menu ••• › Connexions), puis collez son lien : le Siège y crée les bases Features et Bugs.' }),
          h('li', { text: 'Importez le backlog local : l\'équipe travaille ensuite directement dans Notion.' })),
        h('div', { class: 'barre' }, jeton, h('button', { type: 'button', class: 'btn', text: 'Enregistrer le jeton', onclick: () => act({ op: 'notion.jeton', jeton: jeton.value }, 'Jeton enregistré').then(() => { jeton.value = ''; }).catch(() => {}) })),
        h('div', { class: 'barre' }, page, h('button', { type: 'button', class: 'btn prim', text: 'Créer les bases', disabled: s.type === 'notion' && s.configure, onclick: () => act({ op: 'notion.init', page: page.value }, 'Bases Notion créées').catch(() => {}) })),
        h('div', { class: 'barre' }, h('button', { type: 'button', class: 'btn', text: 'Importer le backlog local dans Notion', disabled: s.type !== 'notion', onclick: () => act({ op: 'notion.importer' }).then(r => toast('Importés : ' + r.features + ' features, ' + r.bugs + ' bugs')).catch(() => {}) }))),
      h('div', { class: 'carte' }, h('h3', { text: 'Siège' }), h('p', { class: 'mono muted', text: E.racine }),
        h('p', { class: 'aide', text: 'Les agents utilisent la même intégration en ligne de commande : node siege/backlog.js (file, voir, maj, creer, commenter, questions).' })));
  }

  charger();
  setInterval(() => { if (!document.hidden) charger(); }, 10e3);
})();
