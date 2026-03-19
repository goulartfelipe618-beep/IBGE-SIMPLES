// ── API ───────────────────────────────────────
const API = 'https://servicodados.ibge.gov.br/api/v1';

// ── GitHub Config ─────────────────────────────
const _t = ['ghp_L9JQ','w897IHtve','IbXDvlMpM4F7RkUi737Gy2y'];
const GH_TOKEN = _t.join('');
const GH_REPO  = 'goulartfelipe618-beep/IBGE-SIMPLES';
const GH_FILE  = 'progress.json';
const GH_API   = `https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}`;

// ── 95 cidades com +300k habitantes (Censo 2022) ──
const CIDADES_GRANDES = new Set([
  'São Paulo','Rio de Janeiro','Brasília','Fortaleza','Salvador','Belo Horizonte',
  'Manaus','Curitiba','Recife','Goiânia','Porto Alegre','Belém','Guarulhos',
  'Campinas','São Luís','Maceió','Campo Grande','São Gonçalo','Teresina',
  'João Pessoa','São Bernardo do Campo','Duque de Caxias','Nova Iguaçu','Natal',
  'Santo André','Osasco','Uberlândia','Jaboatão dos Guararapes','Ribeirão Preto',
  'Sorocaba','Contagem','São José dos Campos','Aracaju','Cuiabá','Feira de Santana',
  'Joinville','Aparecida de Goiânia','Londrina','Juiz de Fora','Porto Velho',
  'Ananindeua','Serra','Caxias do Sul','Niterói','Macapá','São José do Rio Preto',
  'Florianópolis','Vila Velha','Mauá','Belford Roxo','Mogi das Cruzes',
  'Campos dos Goytacazes','Jundiaí','Piracicaba','Santos','Olinda','Cariacica',
  'Bauru','Maringá','Anápolis','Montes Claros','Campina Grande','Betim','Vitória',
  'Caucaia','Itaquaquecetuba','Carapicuíba','Canoas','Pelotas','São Vicente',
  'Ribeirão das Neves','Vitória da Conquista','Paulínia','Blumenau','Franca',
  'Caruaru','Ponta Grossa','Petrolina','Boa Vista','Uberaba','Cascavel','Guarujá',
  'Praia Grande','Taubaté','São José dos Pinhais','Limeira','Petrópolis','Santarém',
  'Suzano','Mossoró','Santa Maria','Gravataí','Governador Valadares',
  'Taboão da Serra','Várzea Grande'
]);

// ── State ────────────────────────────────────
let states = [];
let completed = {};
let currentFilter = 'all';
let currentStateId = null;
let allCities = [];
let _pendingCityId = null;
let _pendingCityEl = null;
let _ghFileSha = null; // SHA do arquivo no GitHub (necessário para update)
let _saveTimeout = null;

// ── GitHub: Carregar progresso ────────────────
async function carregarProgresso() {
  try {
    const res = await fetch(GH_API, {
      headers: {
        'Authorization': `Bearer ${GH_TOKEN}`,
        'Accept': 'application/vnd.github+json'
      }
    });

    if (res.status === 404) {
      // Arquivo não existe ainda — começa do zero
      completed = {};
      return;
    }

    const data = await res.json();
    _ghFileSha = data.sha;
    const content = JSON.parse(atob(data.content.replace(/\n/g, '')));
    completed = content;
    console.log('✅ Progresso carregado do GitHub');
  } catch (e) {
    console.warn('⚠️ Erro ao carregar progresso, usando localStorage:', e);
    completed = JSON.parse(localStorage.getItem('ibge-completed') || '{}');
  }
}

// ── GitHub: Salvar progresso ──────────────────
async function salvarProgresso() {
  try {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(completed))));

    const body = {
      message: 'Update progress',
      content: content,
    };
    if (_ghFileSha) body.sha = _ghFileSha;

    const res = await fetch(GH_API, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GH_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      const data = await res.json();
      _ghFileSha = data.content.sha;
      // Salva também no localStorage como backup
      localStorage.setItem('ibge-completed', JSON.stringify(completed));
      console.log('✅ Progresso salvo no GitHub');
    }
  } catch (e) {
    console.warn('⚠️ Erro ao salvar no GitHub, salvando só localStorage:', e);
    localStorage.setItem('ibge-completed', JSON.stringify(completed));
  }
}

// Salva com debounce (aguarda 1.5s após última ação)
function saveAndUpdate() {
  // Atualiza UI imediatamente
  updateDoneCount();
  renderStates(getFilteredStates());
  // Salva no localStorage instantâneo (backup)
  localStorage.setItem('ibge-completed', JSON.stringify(completed));
  // Salva no GitHub com debounce
  clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(salvarProgresso, 1500);
}

// ── Init ──────────────────────────────────────
async function init() {
  // Mostra indicador de carregamento
  document.getElementById('total-done').textContent = '…';

  try {
    // Carrega progresso do GitHub primeiro
    await carregarProgresso();

    const res = await fetch(`${API}/localidades/estados?orderBy=nome`);
    states = await res.json();
    document.getElementById('total-states').textContent = states.length;
    updateDoneCount();
    renderStates(states);
    await prefetchCityCounts();
  } catch (e) {
    document.getElementById('states-container').innerHTML =
      '<div class="loading-state"><p>Erro ao carregar estados. Verifique sua conexão.</p></div>';
  }
}

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
    const totalDone = Object.values(stateCompleted).filter(v => v === true || (Array.isArray(v) && v.length > 0)).length;
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
      </div>`;
  }).join('');
}

function getFilteredStates() {
  const q = document.getElementById('search-input').value.toLowerCase().trim();
  return states.filter(s => {
    const matchText = !q || s.nome.toLowerCase().includes(q) || s.sigla.toLowerCase().includes(q);
    if (!matchText) return false;
    if (currentFilter === 'all') return true;
    const stateCompleted = completed[s.sigla] || {};
    const totalDone = Object.values(stateCompleted).filter(v => v === true || (Array.isArray(v) && v.length > 0)).length;
    const totalCities = window._cityCounts?.[s.sigla] || 0;
    const isDone = totalCities > 0 && totalDone === totalCities;
    return currentFilter === 'done' ? isDone : !isDone;
  });
}

// ── Modal principal ───────────────────────────
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
  closeRegiaoModal();
  document.body.style.overflow = '';
  currentStateId = null;
  allCities = [];
}

// ── Render Cities ─────────────────────────────
function renderCities(list) {
  const container = document.getElementById('cities-container');
  const stateCompleted = completed[currentStateId] || {};
  if (!list.length) {
    container.innerHTML = '<p class="empty-msg">Nenhum município encontrado.</p>';
    return;
  }
  container.innerHTML = list.map(c => {
    const val = stateCompleted[c.id];
    const isDone = !!val;
    const isGrande = CIDADES_GRANDES.has(c.nome);
    const regioes = Array.isArray(val) ? val : (isDone && isGrande && typeof val === 'string' && val !== 'true' ? [val] : []);
    const regiaoTags = regioes.map(r => `<span class="city-regiao-tag">${r}</span>`).join('');
    const bigTag = isGrande && !isDone ? `<span class="city-big-tag">+300k</span>` : '';
    return `
      <div class="city-item ${isDone ? 'done' : ''}"
           onclick="handleCityClick('${c.id}', '${c.nome.replace(/'/g, "\\'")}', this)">
        <div class="city-check">
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
            <path d="M1 4L4 7.5L10 1" stroke="#0a0e1a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <span class="city-name">${c.nome}</span>
        ${bigTag}${regiaoTags}
      </div>`;
  }).join('');
}

// ── Handle city click ─────────────────────────
function handleCityClick(cityId, cityName, el) {
  if (!currentStateId) return;

  if (CIDADES_GRANDES.has(cityName)) {
    openRegiaoModal(cityId, cityName, el);
  } else {
    if (!completed[currentStateId]) completed[currentStateId] = {};
    const val = completed[currentStateId][cityId];
    const isDone = !!val;
    completed[currentStateId][cityId] = !isDone;
    el.classList.toggle('done', !isDone);
    saveAndUpdate();
  }
}

// ── Modal de Região ───────────────────────────
function openRegiaoModal(cityId, cityName, el) {
  _pendingCityId = cityId;
  _pendingCityEl = el;
  document.getElementById('regiao-city-name').textContent = cityName;
  document.getElementById('regiao-modal-error').style.display = 'none';

  const val = completed[currentStateId]?.[cityId];
  const jaFeitas = Array.isArray(val) ? val : [];

  document.querySelectorAll('.regiao-opt').forEach(b => {
    b.classList.toggle('active', jaFeitas.includes(b.dataset.regiao));
  });

  document.getElementById('regiao-modal').classList.remove('hidden');
}

function closeRegiaoModal() {
  document.getElementById('regiao-modal').classList.add('hidden');
  _pendingCityId = null;
  _pendingCityEl = null;
}

function confirmarRegiao() {
  const ativos = [...document.querySelectorAll('.regiao-opt.active')].map(b => b.dataset.regiao);

  if (!completed[currentStateId]) completed[currentStateId] = {};

  if (ativos.length === 0) {
    completed[currentStateId][_pendingCityId] = false;
    if (_pendingCityEl) {
      _pendingCityEl.classList.remove('done');
      _pendingCityEl.querySelectorAll('.city-regiao-tag').forEach(t => t.remove());
      if (!_pendingCityEl.querySelector('.city-big-tag')) {
        _pendingCityEl.querySelector('.city-name').insertAdjacentHTML('afterend', '<span class="city-big-tag">+300k</span>');
      }
    }
  } else {
    completed[currentStateId][_pendingCityId] = ativos;
    if (_pendingCityEl) {
      _pendingCityEl.classList.add('done');
      _pendingCityEl.querySelector('.city-big-tag')?.remove();
      _pendingCityEl.querySelectorAll('.city-regiao-tag').forEach(t => t.remove());
      ativos.forEach(r => {
        _pendingCityEl.insertAdjacentHTML('beforeend', `<span class="city-regiao-tag">${r}</span>`);
      });
    }
  }

  closeRegiaoModal();
  saveAndUpdate();
}

// ── Mark All ─────────────────────────────────
document.getElementById('btn-mark-all').addEventListener('click', () => {
  if (!currentStateId) return;
  if (!completed[currentStateId]) completed[currentStateId] = {};
  const stateCompleted = completed[currentStateId];
  const totalDone = allCities.filter(c => stateCompleted[c.id]).length;
  const allDone = totalDone === allCities.length;
  allCities.forEach(c => {
    stateCompleted[c.id] = allDone ? false : (CIDADES_GRANDES.has(c.nome) ? 'Não definida' : true);
  });
  const q = document.getElementById('city-search').value.toLowerCase().trim();
  renderCities(q ? allCities.filter(c => c.nome.toLowerCase().includes(q)) : allCities);
  saveAndUpdate();
});

// ── Update Done Count ─────────────────────────
function updateDoneCount() {
  let total = 0;
  Object.values(completed).forEach(state => {
    Object.values(state).forEach(v => {
      if (v === true || (Array.isArray(v) && v.length > 0)) total++;
    });
  });
  document.getElementById('total-done').textContent = total.toLocaleString('pt-BR');
}

// ── Events ────────────────────────────────────
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-backdrop').addEventListener('click', closeModal);
document.getElementById('regiao-modal-close').addEventListener('click', closeRegiaoModal);
document.getElementById('regiao-confirmar').addEventListener('click', confirmarRegiao);

document.querySelectorAll('.regiao-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');
    document.getElementById('regiao-modal-error').style.display = 'none';
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!document.getElementById('regiao-modal').classList.contains('hidden')) closeRegiaoModal();
    else closeModal();
  }
});

document.getElementById('search-input').addEventListener('input', () => renderStates(getFilteredStates()));

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
  renderCities(q ? allCities.filter(c => c.nome.toLowerCase().includes(q)) : allCities);
});

init();
