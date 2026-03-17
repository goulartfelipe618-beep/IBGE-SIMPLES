// ── API ───────────────────────────────────────
const API = 'https://servicodados.ibge.gov.br/api/v1';

// ── State ────────────────────────────────────
let states = [];
let completed = JSON.parse(localStorage.getItem('ibge-completed') || '{}');
// completed structure: { "SP": { "3550308": true, "3304557": false, ... } }

let currentFilter = 'all';
let currentStateId = null;
let allCities = [];

// ── Init ──────────────────────────────────────
async function init() {
  try {
    const res = await fetch(`${API}/localidades/estados?orderBy=nome`);
    states = await res.json();

    document.getElementById('total-states').textContent = states.length;
    updateDoneCount();
    renderStates(states);

    // Prefetch city counts (optional, best-effort)
    await prefetchCityCounts();
  } catch (e) {
    document.getElementById('states-container').innerHTML =
      '<div class="loading-state"><p>Erro ao carregar estados. Verifique sua conexão.</p></div>';
  }
}

// ── Prefetch all city counts ──────────────────
async function prefetchCityCounts() {
  try {
    const res = await fetch(`${API}/localidades/municipios`);
    const all = await res.json();
    const byState = {};
    all.forEach(m => {
      const uf = m.microrregiao.mesorregiao.UF.sigla;
      byState[uf] = (byState[uf] || 0) + 1;
    });
    window._cityCounts = byState;
    document.getElementById('total-cities').textContent = all.length.toLocaleString('pt-BR');
    renderStates(getFilteredStates());
  } catch {}
}

// ── Render States ─────────────────────────────
function renderStates(list) {
  const container = document.getElementById('states-container');

  if (!list.length) {
    container.innerHTML = '<div class="loading-state"><p class="empty-msg">Nenhum estado encontrado.</p></div>';
    return;
  }

  container.innerHTML = list.map((s, i) => {
    const uf = s.sigla;
    const stateCompleted = completed[uf] || {};
    const totalDone = Object.values(stateCompleted).filter(Boolean).length;
    const totalCities = window._cityCounts?.[uf] || 0;
    const pct = totalCities ? Math.round((totalDone / totalCities) * 100) : 0;
    const isDone = totalCities > 0 && totalDone === totalCities;

    return `
      <div class="state-card ${isDone ? 'done' : ''}" 
           style="animation-delay:${i * 30}ms"
           onclick="openModal('${s.id}', '${uf}', '${s.nome}', '${s.regiao.nome}')">
        <div class="card-top">
          <div>
            <div class="state-abbr">${uf}</div>
            <div class="state-name">${s.nome}</div>
            <div class="state-region">${s.regiao.nome}</div>
          </div>
          <div class="done-badge">✓ Completo</div>
        </div>
        <div class="card-bottom">
          <span class="city-count">${totalDone}/${totalCities || '…'}</span>
          <div class="progress-wrap">
            <div class="progress-bar" style="width:${pct}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ── Filter Logic ─────────────────────────────
function getFilteredStates() {
  const q = document.getElementById('search-input').value.toLowerCase().trim();
  return states.filter(s => {
    const matchText = !q || s.nome.toLowerCase().includes(q) || s.sigla.toLowerCase().includes(q);
    if (!matchText) return false;
    if (currentFilter === 'all') return true;
    const stateCompleted = completed[s.sigla] || {};
    const totalDone = Object.values(stateCompleted).filter(Boolean).length;
    const totalCities = window._cityCounts?.[s.sigla] || 0;
    const isDone = totalCities > 0 && totalDone === totalCities;
    return currentFilter === 'done' ? isDone : !isDone;
  });
}

// ── Modal ─────────────────────────────────────
async function openModal(stateId, uf, name, region) {
  currentStateId = uf;
  document.getElementById('modal-title').textContent = name;
  document.getElementById('modal-region').textContent = region;
  document.getElementById('city-search').value = '';
  document.getElementById('modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  const container = document.getElementById('cities-container');
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Carregando municípios…</p></div>';

  try {
    const res = await fetch(`${API}/localidades/estados/${stateId}/municipios?orderBy=nome`);
    allCities = await res.json();
    renderCities(allCities);
  } catch {
    container.innerHTML = '<div class="loading-state"><p>Erro ao carregar municípios.</p></div>';
  }
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  document.body.style.overflow = '';
  currentStateId = null;
  allCities = [];
}

function renderCities(list) {
  const container = document.getElementById('cities-container');
  const stateCompleted = completed[currentStateId] || {};

  if (!list.length) {
    container.innerHTML = '<p class="empty-msg">Nenhum município encontrado.</p>';
    return;
  }

  container.innerHTML = list.map(c => {
    const isDone = !!stateCompleted[c.id];
    return `
      <div class="city-item ${isDone ? 'done' : ''}" 
           onclick="toggleCity('${c.id}', this)">
        <div class="city-check">
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
            <path d="M1 4L4 7.5L10 1" stroke="#0a0e1a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <span class="city-name">${c.nome}</span>
      </div>
    `;
  }).join('');
}

function toggleCity(cityId, el) {
  if (!currentStateId) return;
  if (!completed[currentStateId]) completed[currentStateId] = {};
  const current = !!completed[currentStateId][cityId];
  completed[currentStateId][cityId] = !current;
  el.classList.toggle('done', !current);
  saveAndUpdate();
}

// ── Mark All ─────────────────────────────────
document.getElementById('btn-mark-all').addEventListener('click', () => {
  if (!currentStateId) return;
  if (!completed[currentStateId]) completed[currentStateId] = {};
  const stateCompleted = completed[currentStateId];
  const totalDone = allCities.filter(c => stateCompleted[c.id]).length;
  const allDone = totalDone === allCities.length;

  allCities.forEach(c => { stateCompleted[c.id] = !allDone; });

  const q = document.getElementById('city-search').value.toLowerCase().trim();
  const visible = q ? allCities.filter(c => c.nome.toLowerCase().includes(q)) : allCities;
  renderCities(visible);
  saveAndUpdate();
});

// ── Save & Refresh ────────────────────────────
function saveAndUpdate() {
  localStorage.setItem('ibge-completed', JSON.stringify(completed));
  updateDoneCount();
  renderStates(getFilteredStates());
}

function updateDoneCount() {
  let total = 0;
  Object.values(completed).forEach(state => {
    total += Object.values(state).filter(Boolean).length;
  });
  document.getElementById('total-done').textContent = total.toLocaleString('pt-BR');
}

// ── Event Listeners ───────────────────────────
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-backdrop').addEventListener('click', closeModal);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

document.getElementById('search-input').addEventListener('input', () => {
  renderStates(getFilteredStates());
});

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    renderStates(getFilteredStates());
  });
});

document.getElementById('city-search').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  const filtered = q ? allCities.filter(c => c.nome.toLowerCase().includes(q)) : allCities;
  renderCities(filtered);
});

// ── Start ─────────────────────────────────────
init();
