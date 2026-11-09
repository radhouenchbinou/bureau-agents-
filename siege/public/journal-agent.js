// Section « Journal » de la fiche d'un agent (EIA-017). Testable sans navigateur : h, vider, lire et ouvrirTicket sont injectés.
// Tout texte venu du journal est inséré comme texte (option `text` de h) : jamais de HTML construit à partir des données.
'use strict';
(function (racine) {
  const PAGE = 20;
  const NATURES = { refus: 'Refus de la garde', exception_demandee: 'Exception demandée', exception_accordee: 'Exception accordée', exception_refusee: 'Exception refusée', exception_activee: 'Exception activée', exception_terminee: 'Exception fermée' };
  const PASTILLE = { 'en cours': 'on', 'terminé': '', 'échec': 'err', 'interrompu': 'attend' };

  const dateLocale = iso => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }); };
  function duree(s) {
    if (typeof s !== 'number' || !isFinite(s) || s < 0) return '—';
    const m = Math.floor(s / 60), r = Math.round(s % 60);
    return m ? m + ' min ' + r + ' s' : r + ' s';
  }

  function section(role, { h, vider, lire, ouvrirTicket, ticketConnu }) {
    const etat = { entrees: [], suite: false, ignorees: 0, ecriture: null, charge: false, erreur: false, fini: false };
    const conteneur = h('div', { class: 'jr' });

    function evenement(ev) {
      return h('li', { class: 'jr-ev' },
        h('span', { class: 'muted', text: dateLocale(ev.date) + ' · ' }),
        h('strong', { text: NATURES[ev.nature] || String(ev.nature || 'Événement') }),
        ev.outil ? h('span', { class: 'mono', text: ' ' + ev.outil }) : null,
        ev.motif ? h('span', { class: 'mono', text: ' : ' + ev.motif }) : null,
        ev.raison ? h('span', { text: ' (' + ev.raison + ')' }) : null,
        ev.exception ? h('span', { class: 'tag', text: ev.exception }) : null,
        ev.incertain ? h('span', { class: 'muted', text: ' rattachement incertain' }) : null);
    }

    function ticket(id) {
      if (!id) return h('span', { class: 'mono muted', text: '—' });
      const ouvrable = typeof ouvrirTicket === 'function' && (typeof ticketConnu !== 'function' || ticketConnu(id));
      return ouvrable ? h('button', { type: 'button', class: 'btn petit mono', text: id, onclick: () => ouvrirTicket(id) }) : h('span', { class: 'mono', text: id });
    }

    function ligne(e) {
      const evs = Array.isArray(e.evenements) ? e.evenements : [];
      const aDetail = !!e.extrait || evs.length > 0;
      return h('article', { class: 'jr-entree' },
        h('div', { class: 'jr-tete' },
          h('time', { datetime: e.debut || '', text: dateLocale(e.debut) }),
          ticket(e.ticket),
          h('span', { text: e.etape || '—' }),
          h('span', { class: 'muted', text: [e.moteur, e.modele].filter(Boolean).join(' / ') || '—' }),
          h('span', { text: duree(e.duree) }),
          h('span', { class: 'pastille ' + (PASTILLE[e.etat] || '') }, h('i'), e.etat || '—'),
          h('span', { class: 'mono', text: 'code ' + (e.code == null ? '—' : e.code) })),
        h('details', { class: 'jr-detail' },
          h('summary', { text: 'Détail' }),
          aDetail ? [
            evs.length ? h('ul', { class: 'jr-evs' }, evs.map(evenement)) : null,
            e.extrait ? h('pre', { class: 'jr-extrait mono', tabindex: '0', 'aria-label': 'Extrait de sortie', text: e.extrait }) : null
          ] : h('p', { class: 'aide', text: 'Aucune sortie ni événement de garde pour ce lancement.' })));
    }

    function rendre(focusDepuis) {
      const enfants = [h('h3', { text: 'Journal de l\'agent' })];
      if (etat.ecriture) enfants.push(h('div', { class: 'bandeau err', role: 'alert', text: 'Écriture du journal impossible : ' + String(etat.ecriture.erreur || 'erreur inconnue') + '. Les agents ne sont pas bloqués ; certains lancements peuvent manquer.' }));
      if (etat.ignorees > 0) enfants.push(h('p', { class: 'aide', text: etat.ignorees + ' ligne' + (etat.ignorees > 1 ? 's' : '') + ' illisible' + (etat.ignorees > 1 ? 's' : '') + ' ignorée' + (etat.ignorees > 1 ? 's' : '') + ' dans le journal.' }));
      const lignes = etat.entrees.map(ligne);
      if (lignes.length) enfants.push(h('div', { class: 'jr-liste' }, lignes));
      else if (etat.fini && !etat.erreur) enfants.push(h('p', { class: 'aide', text: 'Aucun journal pour cet agent' }));
      if (etat.charge) enfants.push(h('p', { class: 'aide', role: 'status', text: 'Chargement du journal…' }));
      if (etat.erreur) enfants.push(h('div', { class: 'bandeau err', role: 'alert' }, h('span', { text: 'Journal indisponible pour le moment. ' }), h('button', { type: 'button', class: 'btn petit', text: 'Réessayer', onclick: charger })));
      else if (etat.suite && !etat.charge) enfants.push(h('button', { type: 'button', class: 'btn', text: 'Charger plus', onclick: charger }));
      vider(conteneur, enfants);
      // Garde le clavier au bon endroit : le bouton cliqué disparaît, le focus passe à la première entrée ajoutée.
      if (focusDepuis != null) { const nouvelle = lignes[focusDepuis]; const s = nouvelle && nouvelle.querySelector && nouvelle.querySelector('summary'); if (s && s.focus) s.focus(); }
    }

    async function charger() {
      const avant = etat.entrees.length;
      etat.charge = true; etat.erreur = false; rendre();
      try {
        const r = await lire(avant, PAGE);
        etat.entrees = etat.entrees.concat(Array.isArray(r.entrees) ? r.entrees : []);
        etat.suite = !!r.suite; etat.ignorees = r.ignorees || 0; etat.ecriture = r.erreur_ecriture || null; etat.fini = true;
        etat.charge = false; rendre(avant > 0 ? avant : null);
      } catch {
        etat.charge = false; etat.erreur = true; rendre();
      }
    }

    charger();
    return conteneur;
  }

  const api = { section, PAGE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else racine.JournalAgent = api;
})(typeof window !== 'undefined' ? window : globalThis);
