// Génère un rapport de posture de sécurité imprimable (→ « Enregistrer en PDF » du
// navigateur). Aucune dépendance : on ouvre un document HTML autonome et on lance
// l'impression. L'utilisateur choisit « PDF » comme destination.

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

export function openPostureReport(containers = [], stats = {}) {
  const cve = { critical: 0, high: 0, medium: 0, low: 0 };
  let scanned = 0;
  containers.forEach((c) => {
    cve.critical += c.cve_critical || 0;
    cve.high += c.cve_high || 0;
    cve.medium += c.cve_medium || 0;
    cve.low += c.cve_low || 0;
    if (c.scanned) scanned += 1;
  });
  const cveTotal = cve.critical + cve.high + cve.medium + cve.low;
  const hosts = new Set(containers.map((c) => c.host_name).filter(Boolean));
  const date = new Date().toLocaleString('fr-FR');
  const total = stats.total != null ? stats.total : containers.length;
  const secure = stats.secure != null ? stats.secure : containers.filter((c) => (c.score || 0) >= 75).length;
  const grade = stats.globalGrade || '—';
  const score = stats.globalScore != null ? stats.globalScore : '—';

  const rows = [...containers]
    .sort((a, b) => (a.score || 0) - (b.score || 0))
    .map((c) => {
      const cveCell = c.scanned
        ? `${c.cve_critical || 0} / ${c.cve_high || 0} / ${c.cve_medium || 0} / ${c.cve_low || 0}`
        : 'non scanné';
      const secrets = (c.secret_leaks || []).length;
      return `<tr>
        <td>${esc(c.name)}</td>
        <td>${esc(c.host_name)}</td>
        <td class="mono">${esc(c.image_name)}:${esc(c.image_tag)}</td>
        <td class="center b">${esc(c.grade)} <span class="muted">(${esc(c.score)})</span></td>
        <td class="center mono">${cveCell}</td>
        <td class="center">${c.is_root ? '⚠ root' : 'ok'}</td>
        <td class="center">${c.is_privileged ? '⚠ priv.' : 'ok'}</td>
        <td class="center ${secrets > 0 ? 'bad' : ''}">${secrets > 0 ? secrets : 'ok'}</td>
      </tr>`;
    })
    .join('');

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>SafeDock — Rapport de posture de sécurité</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1a1a1a; margin: 28px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0; }
  .sub { color: #666; font-size: 12px; margin-top: 2px; }
  .brand { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 3px solid #EA580C; padding-bottom: 10px; }
  .cards { display: flex; gap: 12px; margin: 18px 0; }
  .card { flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 12px; }
  .card .lbl { color: #777; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
  .card .val { font-size: 22px; font-weight: 700; margin-top: 4px; }
  .sev { display: inline-block; padding: 2px 8px; border-radius: 6px; margin-right: 6px; font-weight: 700; }
  .crit { background: #fde2e1; color: #b91c1c; }
  .high { background: #ffe9d6; color: #c2410c; }
  .med { background: #fef3c7; color: #92400e; }
  .low { background: #fef9c3; color: #854d0e; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #e2e2e2; padding: 5px 7px; text-align: left; }
  th { background: #f5f5f5; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  td.center, th.center { text-align: center; }
  .mono { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; }
  .b { font-weight: 700; }
  .muted { color: #888; }
  .bad { color: #b91c1c; font-weight: 700; }
  .foot { margin-top: 18px; color: #888; font-size: 10px; border-top: 1px solid #e2e2e2; padding-top: 8px; }
  @media print { body { margin: 12mm; } tr { break-inside: avoid; } }
</style></head><body>
  <div class="brand">
    <div>
      <h1>🛡️ SafeDock — Rapport de posture de sécurité</h1>
      <div class="sub">${esc(total)} conteneur(s) sur ${hosts.size || 1} hôte(s) · ${scanned} scanné(s)</div>
    </div>
    <div class="sub">Généré le ${esc(date)}</div>
  </div>

  <div class="cards">
    <div class="card"><div class="lbl">Posture globale</div><div class="val">${esc(grade)} <span class="muted" style="font-size:14px">${esc(score)}/100</span></div></div>
    <div class="card"><div class="lbl">Conteneurs sains</div><div class="val">${esc(secure)}/${esc(total)}</div></div>
    <div class="card"><div class="lbl">Vulnérabilités (CVE)</div><div class="val">${cveTotal}</div></div>
  </div>

  <div style="margin:6px 0 14px">
    <span class="sev crit">${cve.critical} critiques</span>
    <span class="sev high">${cve.high} élevées</span>
    <span class="sev med">${cve.medium} moyennes</span>
    <span class="sev low">${cve.low} faibles</span>
  </div>

  <table>
    <thead><tr>
      <th>Conteneur</th><th>Hôte</th><th>Image</th><th class="center">Note</th>
      <th class="center">CVE (C/É/M/F)</th><th class="center">Root</th><th class="center">Privilèges</th><th class="center">Secrets</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="8" class="center muted">Aucun conteneur.</td></tr>'}</tbody>
  </table>

  <div class="foot">Document généré par SafeDock — Pare-feu de déploiement &amp; supervision SecOps. Confidentiel.</div>
  <script>window.onload = function () { window.print(); };</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) {
    alert("Le navigateur a bloqué l'ouverture de la fenêtre du rapport. Autorisez les pop-ups pour ce site.");
    return;
  }
  w.document.write(html);
  w.document.close();
}
