// Activité réelle de l'équipe, lue (en lecture seule) dans les historiques de Claude Code (~/.claude) :
// la session principale lancée depuis le Siège = le directeur ; ses sous-agents = les missions confiées aux agents.
// Même principe que la source Claude du projet « bureau-agents », restreint aux sessions du Siège.
'use strict';
const fs = require('fs'), fsp = fs.promises, path = require('path'), os = require('os');

const ACTIF_MS = 3 * 60e3;          // un agent qui a écrit il y a moins de 3 min est « à son poste »
const HORIZON_MS = 7 * 864e5;
const SANS_ENREGISTREMENT_MS = 10 * 60e3; // session sans fichier ~/.claude/sessions : vivante si écrite depuis moins de 10 min
const STORY = /\b([A-Z]{3}-\d{3})\b/;
const FILIALE = /Filiale\s*:\s*([^\n—–-]+?)\s*(?:[—–-]|\n|$)/;

const lireJson = async f => { try { return JSON.parse(await fsp.readFile(f, 'utf8')); } catch { return null; } };
const liste = async d => { try { return await fsp.readdir(d); } catch { return []; } };
const stat = async f => { try { return await fsp.stat(f); } catch { return null; } };
const vivant = pid => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const encoder = p => p.replace(/[^a-zA-Z0-9]/g, '-');

// Premier message utilisateur d'un historique = la mission confiée (lu une fois, au début du fichier)
const tetes = new Map();
async function consigne(f) {
  if (tetes.has(f)) return tetes.get(f);
  let txt = '';
  try { const h = await fsp.open(f, 'r'); const b = Buffer.alloc(96 << 10); const { bytesRead } = await h.read(b, 0, b.length, 0); await h.close(); txt = b.toString('utf8', 0, bytesRead); } catch { return ''; }
  let out = '';
  for (const l of txt.split('\n')) {
    let j; try { j = JSON.parse(l); } catch { continue; }
    if (j.type !== 'user' || !j.message) continue;
    const c = j.message.content; out = typeof c === 'string' ? c : Array.isArray(c) ? c.filter(x => x.type === 'text').map(x => x.text).join('\n') : '';
    if (out) break;
  }
  out = out.slice(0, 1200); if (tetes.size > 2000) tetes.clear(); tetes.set(f, out);
  return out;
}

async function lire({ racine, dossierClaude = process.env.SIEGE_CLAUDE_DIR || path.join(os.homedir(), '.claude'), maintenant = Date.now() }) {
  const ouvertes = new Map();
  for (const f of (await liste(path.join(dossierClaude, 'sessions'))).filter(f => f.endsWith('.json'))) {
    const s = await lireJson(path.join(dossierClaude, 'sessions', f));
    if (s && s.sessionId && vivant(s.pid)) ouvertes.set(s.sessionId, s);
  }
  const prefixe = encoder(racine), projets = path.join(dossierClaude, 'projects');
  const dossiers = (await liste(projets)).filter(d => d === prefixe || d.startsWith(prefixe + '-'));
  const sessions = [], missions = [];
  for (const d of dossiers) {
    const dir = path.join(projets, d);
    for (const e of (await liste(dir)).filter(e => e.endsWith('.jsonl'))) {
      const id = e.slice(0, -6), st = await stat(path.join(dir, e)); if (!st) continue;
      const live = ouvertes.get(id);
      // Session de terminal sans enregistrement dans ~/.claude/sessions : vivante si elle a écrit récemment
      const recente = !live && maintenant - st.mtimeMs < SANS_ENREGISTREMENT_MS;
      const vivante = !!live || recente;
      if (!vivante && maintenant - st.mtimeMs > HORIZON_MS) continue;
      sessions.push({ id, vivante, occupee: !!live && live.status === 'busy', derniere: Math.max(st.mtimeMs, (live && live.statusUpdatedAt) || 0) });
      const sdir = path.join(dir, id, 'subagents');
      for (const f of (await liste(sdir)).filter(f => f.endsWith('.meta.json'))) {
        const aid = f.slice(0, -10), meta = await lireJson(path.join(sdir, f)); if (!meta) continue;
        const jf = path.join(sdir, aid + '.jsonl'), ast = await stat(jf), mt = ast ? ast.mtimeMs : 0;
        if (maintenant - mt > HORIZON_MS) continue;
        const txt = ast ? await consigne(jf) : '', fil = FILIALE.exec(txt), sto = STORY.exec(txt);
        missions.push({
          id: aid, session: id, agent: meta.agentType || 'agent', resume: meta.description || '',
          filiale: fil ? fil[1].trim() : '', story: sto ? sto[1] : '',
          etat: meta.finished ? 'termine' : !(live || recente) ? 'interrompu' : maintenant - mt < ACTIF_MS ? 'au_poste' : 'en_attente',
          derniere: mt
        });
      }
    }
  }
  sessions.sort((a, b) => b.derniere - a.derniere); missions.sort((a, b) => b.derniere - a.derniere);
  const d = sessions.find(s => s.vivante);
  const direction = !d ? { etat: 'absent' } : { etat: d.occupee ? 'travaille' : 'attend_ceo', session: d.id, derniere: d.derniere };
  return { direction, sessions: sessions.slice(0, 30), missions: missions.slice(0, 200) };
}

module.exports = { lire, consigne, encoder };
