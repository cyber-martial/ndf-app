// ===== STORAGE =====
const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function storageKey(y, m) { return `ndf_${y}_${String(m).padStart(2,'0')}`; }

function getSettings() {
  return JSON.parse(localStorage.getItem('ndf_settings') || '{}');
}
function saveSettings(s) { localStorage.setItem('ndf_settings', JSON.stringify(s)); }

function currentPeriod() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function getEntries(year, month) {
  return JSON.parse(localStorage.getItem(storageKey(year, month)) || '[]');
}

function saveEntries(year, month, entries) {
  localStorage.setItem(storageKey(year, month), JSON.stringify(entries));
}

// ===== STATE =====
let { year, month } = currentPeriod();
let entries = getEntries(year, month);
let capturedImageB64 = null;
let editingIndex = null;

// ===== DOM REFS =====
const $ = id => document.getElementById(id);
const headerPeriod = $('header-period');
const entriesList = $('entries-list');

// ===== RENDER =====
function render() {
  // Period header
  headerPeriod.textContent = `${MONTHS_FR[month-1]} ${year}`;

  // Totals
  let totRepas = 0, totTaxis = 0, totHotel = 0, totDivers = 0;
  entries.forEach(e => {
    totRepas += e.repas || 0;
    totTaxis += e.taxis || 0;
    totHotel += e.hotel || 0;
    totDivers += e.divers || 0;
  });
  const total = totRepas + totTaxis + totHotel + totDivers;
  $('tot-repas').textContent = fmt(totRepas);
  $('tot-taxis').textContent = fmt(totTaxis);
  $('tot-hotel').textContent = fmt(totHotel);
  $('tot-total').textContent = fmt(total);

  // List
  if (entries.length === 0) {
    entriesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-text">Aucune dépense ce mois</div>
        <div class="empty-sub">Appuie sur + pour photographier un ticket</div>
      </div>`;
    return;
  }

  const sorted = [...entries].map((e, i) => ({...e, _i: i}))
    .sort((a, b) => a.date.localeCompare(b.date));

  entriesList.innerHTML = sorted.map(e => {
    const amount = (e.repas||0)+(e.hotel||0)+(e.taxis||0)+(e.divers||0);
    const type = e.repas ? 'repas' : e.taxis ? 'taxis' : e.hotel ? 'hotel' : 'divers';
    const typeLabel = e.repas ? 'Repas' : e.taxis ? 'Taxi' : e.hotel ? 'Hôtel' : e.kms ? `${e.kms} km` : 'Divers';
    const [y,m2,d] = e.date.split('-');
    return `<div class="entry-card type-${type}" onclick="editEntry(${e._i})">
      <div class="entry-top">
        <div class="entry-libelle">${e.libelle || '—'}</div>
        <div class="entry-amount">${fmt(amount)}</div>
      </div>
      <div class="entry-meta">
        <div class="entry-date">${d}/${m2}/${y}</div>
        <div class="entry-type">${typeLabel}</div>
      </div>
      <div class="entry-delete" onclick="deleteEntry(event,${e._i})">✕</div>
    </div>`;
  }).join('');
}

function fmt(n) {
  if (!n) return '0 €';
  return n.toFixed(2).replace('.',',') + ' €';
}

// ===== MODALS =====
function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

// Close on overlay click
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => {
    if (e.target === el) closeModal(el.id);
  });
});

// ===== FAB / ADD =====
$('fab-add').addEventListener('click', () => {
  capturedImageB64 = null;
  $('capture-zone').innerHTML = `<div class="capture-icon">🧾</div><div class="capture-hint">Appuie pour prendre ou<br>sélectionner une photo</div>`;
  $('capture-zone').classList.remove('has-image');
  $('analyze-btn').disabled = true;
  $('add-content').style.display = 'block';
  openModal('modal-add');
});

$('capture-zone').addEventListener('click', () => $('file-input').click());

$('file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    capturedImageB64 = ev.target.result.split(',')[1];
    $('capture-zone').innerHTML = `<img src="${ev.target.result}" alt="ticket">`;
    $('capture-zone').classList.add('has-image');
    $('analyze-btn').disabled = false;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

$('analyze-btn').addEventListener('click', analyzeTicket);

async function analyzeTicket() {
  const settings = getSettings();
  if (!settings.apiKey) {
    showToast('⚠️ Configure ta clé API Gemini dans les paramètres', 'error');
    closeModal('modal-add');
    openSettings();
    return;
  }

  $('add-content').innerHTML = `
    <div class="loader-wrap">
      <div class="loader"></div>
      <div class="loader-text">Analyse du ticket en cours…<br>Ça prend 5 à 10 secondes</div>
    </div>`;

  try {
    const result = await callGemini(capturedImageB64, settings.apiKey);
    closeModal('modal-add');
    fillForm(result);
    editingIndex = null;
    openModal('modal-form');
  } catch(err) {
    $('add-content').innerHTML = `<div style="color:var(--danger);padding:20px;text-align:center;font-size:13px;">
      ❌ Erreur d'analyse<br><br>${err.message}<br><br>
      <button class="save-btn" onclick="location.reload()">Réessayer</button>
    </div>`;
    console.error(err);
  }
}

// ===== GEMINI API =====
async function callGemini(imageB64, apiKey) {
  const prompt = `Tu analyses une photo de ticket de caisse ou de reçu de paiement français.
Extrait ces informations et réponds UNIQUEMENT en JSON valide, sans markdown, sans texte avant ou après :
{
  "date": "YYYY-MM-DD",
  "libelle": "nom du commerce ou description courte",
  "repas": null ou montant en euros (nombre),
  "hotel": null ou montant en euros (nombre),
  "taxis": null ou montant en euros (nombre),
  "divers": null ou montant en euros (nombre)
}

Règles de catégorisation :
- repas: restaurant, café, brasserie, fast-food, déjeuner, dîner, self
- hotel: hôtel, nuit, hébergement
- taxis: taxi, VTC, Uber, péage, parking, transport
- divers: tout le reste (carburant, fournitures, etc.)
- Un seul champ de montant doit être rempli (le montant total TTC du ticket)
- Si la date n'est pas lisible, utilise la date d'aujourd'hui : ${new Date().toISOString().split('T')[0]}
- libelle doit être court (max 40 caractères)`;

  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: 'image/jpeg', data: imageB64 } }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 300 }
    })
  });

  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.error?.message || `HTTP ${resp.status}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ===== FORM =====
function fillForm(data) {
  const today = new Date().toISOString().split('T')[0];
  $('f-date').value = data.date || today;
  $('f-libelle').value = data.libelle || '';
  $('f-repas').value = data.repas || '';
  $('f-hotel').value = data.hotel || '';
  $('f-taxis').value = data.taxis || '';
  $('f-divers').value = data.divers || '';
  $('f-kms').value = data.kms || '';
}

function editEntry(idx) {
  editingIndex = idx;
  fillForm(entries[idx]);
  openModal('modal-form');
}

function deleteEntry(evt, idx) {
  evt.stopPropagation();
  if (!confirm('Supprimer cette dépense ?')) return;
  entries.splice(idx, 1);
  saveEntries(year, month, entries);
  render();
  showToast('Dépense supprimée');
}
window.editEntry = editEntry;
window.deleteEntry = deleteEntry;

$('save-entry-btn').addEventListener('click', () => {
  const entry = {
    date: $('f-date').value,
    libelle: $('f-libelle').value,
    repas: parseFloat($('f-repas').value) || null,
    hotel: parseFloat($('f-hotel').value) || null,
    taxis: parseFloat($('f-taxis').value) || null,
    divers: parseFloat($('f-divers').value) || null,
    kms: parseInt($('f-kms').value) || null,
  };
  if (!entry.date) { showToast('⚠️ Date obligatoire', 'error'); return; }

  if (editingIndex !== null) {
    entries[editingIndex] = entry;
    showToast('✅ Dépense modifiée');
  } else {
    entries.push(entry);
    showToast('✅ Dépense ajoutée');
  }
  saveEntries(year, month, entries);
  closeModal('modal-form');
  render();
});

// ===== SETTINGS =====
function openSettings() {
  const s = getSettings();
  $('s-apikey').value = s.apiKey || '';
  $('s-email-to').value = s.emailTo || '';
  $('s-email-from').value = s.emailFrom || '';
  $('s-nom').value = s.nom || 'LEPETIT Martial';
  $('api-warn').style.display = s.apiKey ? 'none' : 'block';
  openModal('modal-settings');
}

$('btn-settings').addEventListener('click', openSettings);

$('save-settings-btn').addEventListener('click', () => {
  const s = {
    apiKey: $('s-apikey').value.trim(),
    emailTo: $('s-email-to').value.trim(),
    emailFrom: $('s-email-from').value.trim(),
    nom: $('s-nom').value.trim(),
  };
  saveSettings(s);
  closeModal('modal-settings');
  showToast('✅ Paramètres sauvegardés');
});

$('reset-month-btn').addEventListener('click', () => {
  if (!confirm(`Effacer TOUTES les dépenses de ${MONTHS_FR[month-1]} ${year} ?`)) return;
  entries = [];
  saveEntries(year, month, entries);
  closeModal('modal-settings');
  render();
  showToast('Mois réinitialisé');
});

// ===== EXPORT =====
$('btn-export').addEventListener('click', () => {
  const info = $('export-info');
  let totRepas=0, totTaxis=0, totHotel=0, totDivers=0;
  entries.forEach(e => {
    totRepas += e.repas||0; totTaxis += e.taxis||0;
    totHotel += e.hotel||0; totDivers += e.divers||0;
  });
  const total = totRepas+totTaxis+totHotel+totDivers;

  info.innerHTML = `
    <div class="export-info-row"><span class="export-info-key">Période</span><span class="export-info-val">${MONTHS_FR[month-1]} ${year}</span></div>
    <div class="export-info-row"><span class="export-info-key">Nb tickets</span><span class="export-info-val">${entries.length}</span></div>
    <div class="export-info-row"><span class="export-info-key">Repas</span><span class="export-info-val">${fmt(totRepas)}</span></div>
    <div class="export-info-row"><span class="export-info-key">Taxis</span><span class="export-info-val">${fmt(totTaxis)}</span></div>
    <div class="export-info-row"><span class="export-info-key">Hôtel</span><span class="export-info-val">${fmt(totHotel)}</span></div>
    <div class="export-info-row"><span class="export-info-key">Divers</span><span class="export-info-val">${fmt(totDivers)}</span></div>
    <div class="export-info-row" style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px">
      <span class="export-info-key" style="color:var(--text)"><strong>Total</strong></span>
      <span class="export-info-val" style="color:var(--accent);font-size:16px">${fmt(total)}</span>
    </div>`;

  openModal('modal-export');
});

$('do-export-btn').addEventListener('click', generateAndDownloadExcel);
$('send-mail-btn').addEventListener('click', sendByMail);

// ===== EXCEL GENERATION (client-side via SheetJS) =====
async function generateAndDownloadExcel() {
  showToast('⏳ Génération du fichier Excel…');
  closeModal('modal-export');

  try {
    // Load SheetJS
    if (!window.XLSX) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    }

    const settings = getSettings();
    const moisStr = MONTHS_FR[month - 1];
    const anneeStr = String(year);
    const nomStr = settings.nom || 'LEPETIT Martial';

    // Build workbook from scratch matching the template structure
    const wb = XLSX.utils.book_new();
    const wsData = buildSheetData(moisStr, anneeStr, nomStr);
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws['!cols'] = [{wch:12},{wch:40},{wch:8},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10}];

    // Merge cells matching template
    ws['!merges'] = [
      {s:{r:0,c:2}, e:{r:0,c:3}}, // MOIS label + value area
      {s:{r:3,c:0}, e:{r:3,c:6}}, // NOTE DE FRAIS
      {s:{r:5,c:0}, e:{r:5,c:6}}, // Identité
      {s:{r:11,c:0}, e:{r:11,c:6}}, // Détail
      {s:{r:44,c:0}, e:{r:44,c:6}}, // Visa
      {s:{r:48,c:0}, e:{r:48,c:6}}, // Validation
      {s:{r:12,c:3}, e:{r:12,c:6}}, // Montant header
      {s:{r:44,c:5}, e:{r:44,c:6}}, // total dépenses
      {s:{r:45,c:5}, e:{r:45,c:6}},
      {s:{r:46,c:5}, e:{r:46,c:6}},
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'NDF');

    const filename = `NDF_${nomStr.replace(' ','_')}_${moisStr}_${anneeStr}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast('✅ Fichier téléchargé !', 'success');
  } catch(err) {
    console.error(err);
    showToast('❌ Erreur génération Excel', 'error');
  }
}

function buildSheetData(moisStr, anneeStr, nomStr) {
  const parts = nomStr.split(' ');
  const prenom = parts.pop() || '';
  const nom = parts.join(' ') || nomStr;

  // 60 rows, 12 cols (A-L)
  const rows = Array.from({length: 60}, () => Array(12).fill(null));

  // Row 2: MOIS header
  rows[1][2] = 'MOIS '; rows[1][3] = moisStr; rows[1][4] = anneeStr;

  // Row 4: title
  rows[3][0] = 'NOTE DE FRAIS';

  // Row 6: section
  rows[5][0] = 'Identité du collaborateur';

  // Row 8: name
  rows[7][0] = 'NOM :'; rows[7][1] = nom;
  rows[7][2] = 'PRENOM :'; rows[7][3] = prenom;

  // Row 9: company
  rows[8][0] = 'Société :'; rows[8][1] = 'COMPAGNIE FRUITIERE France';
  rows[8][2] = 'Etablissement :'; rows[8][4] = 'LYON';

  // Row 10: function
  rows[9][0] = 'Fonction :'; rows[9][1] = 'Commercial';

  // Row 12: section
  rows[11][0] = 'Détail des frais professionnels à rembourser';

  // Row 13: amount header
  rows[12][3] = 'Montant (en € )';

  // Row 14: column headers
  rows[13][0]='Date'; rows[13][1]='LIBELLE'; rows[13][2]='Kms';
  rows[13][3]='Repas'; rows[13][4]='Hotel'; rows[13][5]='Taxis'; rows[13][6]='Divers';

  // Rows 15-41: data
  const sorted = [...entries].sort((a,b) => a.date.localeCompare(b.date));
  sorted.slice(0, 27).forEach((e, i) => {
    const r = 14 + i;
    const [y2,m2,d] = e.date.split('-');
    rows[r][0] = `${d}/${m2}/${y2}`;
    rows[r][1] = e.libelle || '';
    rows[r][2] = e.kms || null;
    rows[r][3] = e.repas || null;
    rows[r][4] = e.hotel || null;
    rows[r][5] = e.taxis || null;
    rows[r][6] = e.divers || null;
  });

  // Row 42: total kms
  rows[41][1] = 'Total Kilomètres'; rows[41][2] = {f:'SUM(C15:C41)'};

  // Row 43: indemnité
  rows[42][1] = 'Indemnité au kilomètre'; rows[42][2] = 0.518;

  // Row 44: TOTAUX
  rows[43][0] = 'TOTAUX';
  rows[43][2] = {f:'C42*C43'};
  rows[43][3] = {f:'SUM(D15:D43)'};
  rows[43][4] = {f:'SUM(E15:E43)'};
  rows[43][5] = {f:'SUM(F15:F43)'};
  rows[43][6] = {f:'SUM(G15:G43)'};

  // Row 45: Commentaires
  rows[44][0] = 'Commentaires';
  rows[44][3] = 'Total dépenses';
  rows[44][5] = {f:'C44+D44+E44+F44+G44'};

  // Row 46: Avance
  rows[45][3] = 'Avance reçue à déduire';

  // Row 47: Montant à rembourser
  rows[46][3] = 'Montant à rembourser';
  rows[46][5] = {f:'F45-F46'};

  // Row 49: Visa
  rows[48][0] = 'Visa du salarié';

  // Row 51: date/sig
  rows[50][0] = 'Date :'; rows[50][2] = 'Signature :';

  // Row 53: validation
  rows[52][0] = 'Validation du Supérieur hiérarchique';
  rows[54][0] = 'Date :'; rows[54][2] = 'Signature :';

  return rows;
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ===== SEND BY MAIL =====
function sendByMail() {
  const s = getSettings();
  if (!s.emailTo) {
    showToast('⚠️ Configure l\'email destinataire dans les paramètres', 'error');
    closeModal('modal-export');
    openSettings();
    return;
  }

  const subject = encodeURIComponent(`Note de frais ${MONTHS_FR[month-1]} ${year} - ${s.nom || 'LEPETIT Martial'}`);
  const body = encodeURIComponent(
    `Bonjour,\n\nVeuillez trouver ci-joint ma note de frais pour le mois de ${MONTHS_FR[month-1]} ${year}.\n\n` +
    `Nb tickets : ${entries.length}\n` +
    `Total : ${fmt((entries.reduce((s,e) => s+(e.repas||0)+(e.hotel||0)+(e.taxis||0)+(e.divers||0), 0)))}\n\n` +
    `Cordialement,\n${s.nom || 'Martial LEPETIT'}`
  );

  // Download file first, then open mail
  generateAndDownloadExcel();

  setTimeout(() => {
    const mailto = `mailto:${s.emailTo}?subject=${subject}&body=${body}`;
    window.location.href = mailto;
    showToast('📬 Client mail ouvert – attache le fichier Excel', 'success');
  }, 1500);

  closeModal('modal-export');
}

// ===== AUTO END-OF-MONTH CHECK =====
function checkEndOfMonth() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  if (now.getDate() === lastDay) {
    const lastNotif = localStorage.getItem('ndf_last_eom_notif');
    const key = `${now.getFullYear()}_${now.getMonth()+1}`;
    if (lastNotif !== key && entries.length > 0) {
      localStorage.setItem('ndf_last_eom_notif', key);
      setTimeout(() => {
        showToast('📅 Fin de mois ! Pense à exporter ta note de frais.', 'success');
      }, 2000);
    }
  }
}

// ===== TOAST =====
function showToast(msg, type='') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (type ? ` ${type}` : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ===== INIT =====
function init() {
  const s = getSettings();
  if (!s.apiKey) {
    setTimeout(() => {
      showToast('⚙️ Configure ta clé API Gemini dans les paramètres', 'error');
    }, 1000);
  }
  render();
  checkEndOfMonth();
}

init();
