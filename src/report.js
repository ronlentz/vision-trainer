// "Export for doctor": CSV (opens in Excel) + one-page HTML summary.
// Pure string builders over the export-JSON shape ({sessions, staircase,
// program}) so they also run in Node against synced snapshots.

function esc(s) {
  const t = String(s ?? '');
  return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

export function buildCSV(data) {
  const head = [
    'date', 'start_time', 'minutes', 'activities', 'staircase_success',
    'staircase_attempts', 'accuracy_pct', 'bubble_pop', 'brick_breaker',
    'ring_toss', 'double_vision_events', 'checkin_double_vision',
    'checkin_strain', 'checkin_paddle_visibility', 'final_contrast',
  ];
  const rows = [head.join(',')];
  for (const s of data.sessions) {
    if (!s.activities?.length && !(s.activeMinutes > 0)) continue; // skip empty entries
    const ck = s.events.find((e) => e.type === 'checkin') || {};
    const dv = s.events.filter((e) => e.type === 'double-vision').length;
    const game = (k) => {
      const g = s.games?.[k];
      return g ? `${g.success}/${g.attempts}` : '';
    };
    rows.push(
      [
        s.day,
        new Date(s.startTs).toLocaleTimeString(),
        s.activeMinutes ?? 0,
        (s.activities || []).join('+'),
        s.success,
        s.attempts,
        s.attempts > 0 ? Math.round((s.success / s.attempts) * 100) : '',
        game('bubble-pop'),
        game('brick-breaker'),
        game('ring-toss'),
        dv,
        ck.doubleVision ?? '',
        ck.strain ?? '',
        ck.paddleVisibility ?? '',
        s.finalContrast,
      ]
        .map(esc)
        .join(','),
    );
  }
  return '﻿' + rows.join('\r\n') + '\r\n'; // BOM so Excel reads UTF-8
}

export function buildHTML(data) {
  const sessions = data.sessions.filter((s) => s.activities?.length || s.activeMinutes > 0);
  const days = [...new Set(sessions.map((s) => s.day))].sort();
  const totalMin = Math.round(sessions.reduce((a, s) => a + (s.activeMinutes || 0), 0));
  const log = data.staircase?.log || [];
  const contrastNow = data.staircase?.contrast ?? '?';
  const start = data.program?.startDay || (days[0] ?? '—');
  const dvEvents = sessions.flatMap((s) =>
    s.events.filter((e) => e.type === 'double-vision').map((e) => ({ day: s.day, ...e })),
  );
  const calibs = sessions.flatMap((s) => s.events.filter((e) => e.type === 'calibration'));
  const verg = sessions.flatMap((s) =>
    s.events.filter((e) => e.type === 'vergence').map((e) => ({ day: s.day, ...e })),
  );
  const succ = sessions.reduce((a, s) => a + s.success, 0);
  const att = sessions.reduce((a, s) => a + s.attempts, 0);

  // contrast-over-time step chart from the staircase log
  const pts = log.filter((l) => typeof l.to === 'number').map((l) => ({ t: l.ts, v: l.to }));
  let chart = '<p>(no contrast changes recorded yet)</p>';
  if (pts.length) {
    const t0 = pts[0].t;
    const t1 = pts[pts.length - 1].t || t0 + 1;
    const W = 640, H = 200, PX = 45, PY = 16;
    const x = (t) => PX + ((t - t0) / Math.max(1, t1 - t0)) * (W - PX - 10);
    const y = (v) => H - PY - ((v - 0) / 1.0) * (H - 2 * PY);
    let d = '';
    pts.forEach((p, i) => {
      const xi = pts.length === 1 ? PX : x(p.t);
      d += (i === 0 ? `M ${xi} ${y(p.v)}` : ` H ${xi} V ${y(p.v)}`);
    });
    d += ` H ${W - 10}`;
    const grid = [0.2, 0.4, 0.6, 0.8, 1.0]
      .map(
        (v) =>
          `<line x1="${PX}" y1="${y(v)}" x2="${W - 10}" y2="${y(v)}" stroke="#ddd"/>` +
          `<text x="4" y="${y(v) + 4}" font-size="11" fill="#666">${v.toFixed(1)}</text>`,
      )
      .join('');
    chart = `<svg width="${W}" height="${H}" style="max-width:100%">${grid}<path d="${d}" fill="none" stroke="#2563eb" stroke-width="2.5"/></svg>`;
  }

  const row = (l, v) => `<tr><td style="color:#555;padding:2px 14px 2px 0">${l}</td><td><b>${v}</b></td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Vision training summary</title></head>
<body style="font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#111">
<h2 style="margin-bottom:2px">Dichoptic vision training — summary</h2>
<div style="color:#666;margin-bottom:14px">Generated ${new Date(
    Date.parse(data.exportedAt) || Date.now(),
  ).toLocaleDateString()} · program start ${start} · training aid used alongside optometrist care — not a treatment</div>
<div style="font-size:40px;font-weight:700">${typeof contrastNow === 'number' ? contrastNow.toFixed(2) : contrastNow}
  <span style="font-size:15px;font-weight:400;color:#555">current strong-eye (fellow-eye) contrast — goal 1.00, weak eye always 1.00</span></div>
<h3>Contrast over time (the headline number)</h3>
${chart}
<h3>Totals</h3>
<table>${row('Days trained', days.length)}${row('Total minutes', totalMin)}${row(
    'Overall game accuracy (staircase games)',
    att ? Math.round((succ / att) * 100) + '% of ' + att : 'n/a',
  )}${row('Double-vision events', dvEvents.length)}</table>
<h3>Double-vision events</h3>
${
  dvEvents.length
    ? '<ul>' + dvEvents.map((e) => `<li>${e.day} — during ${e.activity || '?'} (contrast ${e.contrastBefore ?? '?'} → ${e.contrastAfter ?? '?'})</li>`).join('') + '</ul>'
    : '<p>None reported.</p>'
}
<h3>Suppression / fusion checks</h3>
${
  calibs.length
    ? '<ul>' + calibs.map((c) => `<li>ring seen: ${c.suppressionSeen ? 'yes' : 'NO'} · fusion: ${c.fusion}</li>`).join('') + '</ul>'
    : '<p>Not run yet.</p>'
}
<h3>Vergence (convergence break / recovery)</h3>
${
  verg.length
    ? verg
        .map(
          (v) =>
            `<p>${v.day}: ` +
            v.cycles
              .map(
                (c, i) =>
                  `R${i + 1} break ${c.break === null ? 'none' : Math.round(c.break * 100) + 'cm'} / recovery ${c.recovery === null ? 'none' : Math.round(c.recovery * 100) + 'cm'}`,
              )
              .join(' · ') +
            '</p>',
        )
        .join('')
    : '<p>Not run yet.</p>'
}
<p style="color:#666;font-size:13px;margin-top:22px">Protocol: fellow-eye contrast starts 0.20 (or measured balance point), ±0.10 once per day (≥30 min play, ≥75% fixed target), floor 0.10, ceiling 1.00. Weak-eye contrast never reduced. Full session table in the accompanying CSV.</p>
</body></html>`;
}
