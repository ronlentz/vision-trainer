// Renders the doctor report as a live page (the Quest browser can't open
// downloaded HTML files, so the report is a URL instead: /report.html).
import { store } from './store.js';
import { buildCSV, buildHTML } from './report.js';

const data = JSON.parse(store.exportJSON());
document.open();
document.write(buildHTML(data));
document.close();

// toolbar: CSV download still available (works on desktop; on Quest the
// page itself is the shareable thing)
const bar = document.createElement('div');
bar.style.cssText =
  'position:fixed;top:8px;right:8px;display:flex;gap:8px;font-family:system-ui';
function btn(label, fn) {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText = 'padding:6px 10px;cursor:pointer';
  b.onclick = fn;
  bar.appendChild(b);
}
btn('Download CSV', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buildCSV(data)], { type: 'text/csv' }));
  a.download = `vision-training-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});
btn('Back to app', () => {
  location.href = './';
});
document.body.appendChild(bar);
