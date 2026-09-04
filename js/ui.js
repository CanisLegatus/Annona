/**
 * ANNONA — Модуль пользовательского интерфейса (UI Renderer)
 * Отрисовка таблиц, графиков, KPI и обновление интерфейса
 */

import { $, fmt, fmtMoney, escapeHtml } from './utils.js';
import { state, getSettings, updateSettings, getAnalyzedItems, getExcludedItems, getAllCubes, getStoreInfo, destroyAllCharts, setChart, getCurrentTab, setCurrentTab } from './state.js';
import { analyzeAll } from './analyzer.js';

/**
 * Главная функция отрисовки приложения
 */
export function renderApp() {
  const uploadScreen = $('uploadScreen');
  const mainApp = $('mainApp');
  const reloadBtn = $('reloadBtn');
  const storeInfo = $('storeInfo');
  const storeNameEl = $('storeName');
  const orderMetaEl = $('orderMeta');

  if (uploadScreen) uploadScreen.classList.add('hidden');
  if (mainApp) mainApp.classList.remove('hidden');
  if (reloadBtn) reloadBtn.classList.remove('hidden');

  const { storeName, orderInfo } = getStoreInfo();
  
  if (storeName || orderInfo) {
    if (storeInfo) storeInfo.classList.remove('hidden');
    if (storeNameEl) storeNameEl.textContent = storeName || '—';
    if (orderMetaEl) orderMetaEl.textContent = orderInfo || '';
  }

  updateKPI();
  renderCharts();
  renderTable();
}

/**
 * Отрисовка фильтров кубов в настройках
 */
export function renderCubeFilters() {
  const box = $('cubeFilters');
  if (!box) return;

  box.innerHTML = '';
  const allCubes = getAllCubes();
  const settings = getSettings();

  allCubes.forEach(cube => {
    const excl = settings.excludedCubes.includes(cube);
    const div = document.createElement('div');
    div.className = 'flex items-center gap-3 p-2 rounded-lg hover:bg-[rgba(168,132,44,0.06)]';
    div.innerHTML = `
      <input type="checkbox" class="checkbox-custom" data-cube="${escapeHtml(cube)}" ${excl ? 'checked' : ''}>
      <span class="text-base text-[#2f2b23] flex-1 cursor-pointer">${escapeHtml(cube)}</span>
      <span class="text-xs font-bold ${excl ? 'text-[#b3392b]' : 'text-[#5f7d2a]'}">${excl ? 'исключён' : 'в расчёте'}</span>`;
    
    const cb = div.querySelector('input');
    const lbl = div.querySelector('span:last-child');
    
    cb.addEventListener('change', () => {
      lbl.textContent = cb.checked ? 'исключён' : 'в расчёте';
      lbl.className = 'text-xs font-bold ' + (cb.checked ? 'text-[#b3392b]' : 'text-[#5f7d2a]');
    });
    
    box.appendChild(div);
  });
}

/**
 * Обновление KPI показателей
 */
function updateKPI() {
  const items = getAnalyzedItems();
  const c = { critical: 0, understock: 0, overstock: 0, anomalies: 0, promo: 0, normal: 0 };
  
  items.forEach(it => c[it.status]++);

  const elements = {
    kpiTotalSku: items.length,
    kpiCritical: c.critical,
    kpiUnderstock: c.understock,
    kpiOverstock: c.overstock,
    kpiAnomalies: c.anomalies,
    kpiNormal: c.normal
  };

  Object.keys(elements).forEach(key => {
    const el = $(key);
    if (el) el.textContent = fmt(elements[key]);
  });

  // Счётчики вкладок
  const tabCounts = {
    countCritical: c.critical,
    countUnderstock: c.understock,
    countOverstock: c.overstock,
    countAnomalies: c.anomalies,
    countPromo: c.promo,
    countNormal: c.normal
  };

  Object.keys(tabCounts).forEach(key => {
    const el = $(key);
    if (el) el.textContent = tabCounts[key];
  });

  // Исключено
  const excludedCount = getExcludedItems().length;
  const excludedEl = $('excludedCount');
  if (excludedEl) excludedEl.textContent = fmt(excludedCount);

  // Финансы
  const sumCur = items.reduce((s, it) => s + it.orderFinal * it.costPrice, 0);
  const sumOpt = items.reduce((s, it) => s + it.smartOrder * it.costPrice, 0);
  const delta = sumOpt - sumCur;
  const pct = sumCur > 0 ? delta / sumCur * 100 : 0;

  const sumCurrentEl = $('sumCurrent');
  const sumOptimizedEl = $('sumOptimized');
  const sumDeltaEl = $('sumDelta');

  if (sumCurrentEl) sumCurrentEl.textContent = fmtMoney(sumCur);
  if (sumOptimizedEl) sumOptimizedEl.textContent = fmtMoney(sumOpt);
  if (sumDeltaEl) {
    const deltaClass = delta < 0 ? 'text-[#5f7d2a]' : delta > 0 ? 'text-[#b3392b]' : 'text-[#8a8171]';
    const deltaText = delta < 0 ? '↓ экономия' : delta > 0 ? '↑ рост' : '=';
    sumDeltaEl.innerHTML = `<span class="${deltaClass}">${deltaText} ${fmtMoney(Math.abs(delta))} (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)</span>`;
  }
}

/**
 * Отрисовка графиков
 */
export function renderCharts() {
  destroyAllCharts();

  // Настройка Chart.js по умолчанию
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#6f6757';
    Chart.defaults.font.family = 'Cormorant Garamond';
    Chart.defaults.font.size = 13;
  }

  const items = getAnalyzedItems();
  const c = { critical: 0, understock: 0, overstock: 0, anomalies: 0, promo: 0, normal: 0 };
  items.forEach(it => c[it.status]++);

  // График статусов (doughnut)
  const chartStatusEl = $('chartStatus');
  if (chartStatusEl && typeof Chart !== 'undefined') {
    setChart('status', new Chart(chartStatusEl, {
      type: 'doughnut',
      data: {
        labels: ['Критический', 'Недосток', 'Пересток', 'Аномалии', 'Промо', 'Норма'],
        datasets: [{
          data: [c.critical, c.understock, c.overstock, c.anomalies, c.promo, c.normal],
          backgroundColor: ['#b3392b', '#c07818', '#5f7d2a', '#8b2635', '#a8842c', '#2e5090'],
          borderColor: '#fdfbf4',
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, padding: 10 } }
        }
      }
    }));
  }

  // График сравнения (bar)
  const chartCompareEl = $('chartCompare');
  if (chartCompareEl && typeof Chart !== 'undefined') {
    const top = [...items]
      .filter(it => it.costPrice > 0 && (it.orderFinal > 0 || it.smartOrder > 0))
      .sort((a, b) => b.orderFinal * b.costPrice - a.orderFinal * a.costPrice)
      .slice(0, 10);

    setChart('compare', new Chart(chartCompareEl, {
      type: 'bar',
      data: {
        labels: top.map(it => it.code),
        datasets: [
          {
            label: 'Было',
            data: top.map(it => it.orderFinal * it.costPrice),
            backgroundColor: 'rgba(179,57,43,0.55)',
            borderRadius: 4
          },
          {
            label: 'Стало',
            data: top.map(it => it.smartOrder * it.costPrice),
            backgroundColor: 'rgba(46,80,144,0.75)',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { boxWidth: 10 } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: {
            grid: { color: 'rgba(168,132,44,0.08)' },
            ticks: { callback: v => fmt(v) + '₽', font: { size: 10 } }
          }
        }
      }
    }));
  }

  // График запаса дней (bar)
  const chartDaysEl = $('chartDays');
  if (chartDaysEl && typeof Chart !== 'undefined') {
    const buckets = { '0–7': 0, '8–14': 0, '15–30': 0, '31–60': 0, '60+': 0 };
    
    items.forEach(it => {
      if (it.dailySales === 0) return;
      const d = it.smartStockDays;
      if (d <= 7) buckets['0–7']++;
      else if (d <= 14) buckets['8–14']++;
      else if (d <= 30) buckets['15–30']++;
      else if (d <= 60) buckets['31–60']++;
      else buckets['60+']++;
    });

    setChart('days', new Chart(chartDaysEl, {
      type: 'bar',
      data: {
        labels: Object.keys(buckets),
        datasets: [{
          data: Object.values(buckets),
          backgroundColor: ['#b3392b', '#c07818', '#5f7d2a', '#2e5090', '#8b2635'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            title: { display: true, text: 'Дней запаса (план)', font: { family: 'Cinzel', size: 10 } },
            grid: { display: false }
          },
          y: { grid: { color: 'rgba(168,132,44,0.08)' } }
        }
      }
    }));
  }
}

/**
 * Отрисовка таблицы товаров
 */
export function renderTable() {
  const searchInput = $('searchInput');
  const search = searchInput ? searchInput.value.toLowerCase() : '';
  
  let filtered = getAnalyzedItems().filter(it => it.status === getCurrentTab());
  
  if (search) {
    filtered = filtered.filter(it =>
      it.code.toLowerCase().includes(search) ||
      it.name.toLowerCase().includes(search)
    );
  }

  const tbody = $('tableBody');
  const emptyState = $('emptyState');

  if (!tbody) return;

  tbody.innerHTML = '';
  
  if (!filtered.length) {
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }
  
  if (emptyState) emptyState.classList.add('hidden');

  // Сортировка по степени изменения заказа
  filtered.sort((a, b) =>
    Math.abs(b.smartOrder - b.orderFinal) - Math.abs(a.smartOrder - a.orderFinal)
  );

  filtered.forEach(it => {
    const tr = document.createElement('tr');
    const changed = it.smartOrder !== it.orderFinal;
    const orderClass = it.smartOrder > it.orderFinal
      ? 'text-[#5f7d2a]'
      : it.smartOrder < it.orderFinal
        ? 'text-[#b3392b]'
        : 'text-[#2f2b23]';
    
    const planDays = it.smartStockDays;
    const daysClass = planDays < 14
      ? 'text-[#b3392b]'
      : planDays > 60
        ? 'text-[#c07818]'
        : 'text-[#5f7d2a]';
    
    const factClass = it.factDaysCalc < 7
      ? 'text-[#b3392b]'
      : it.factDaysCalc > 60
        ? 'text-[#c07818]'
        : 'text-[#6f6757]';

    tr.innerHTML = `
      <td class="font-mono text-sm text-[#8a6d1f] font-bold">${escapeHtml(it.code)}</td>
      <td class="max-w-xs">
        <div class="text-[#2f2b23] font-semibold truncate" title="${escapeHtml(it.name)}">${escapeHtml(it.name)}</div>
        ${it.promo ? `<div class="text-xs text-[#a8842c] font-bold mt-0.5">🎯 ${escapeHtml(it.promo)}</div>` : ''}
      </td>
      <td class="text-right text-[#6f6757]">${fmt(it.stock)}</td>
      <td class="text-right text-[#6f6757]">${it.weeklySales.toFixed(1)}</td>
      <td class="text-right ${factClass} font-semibold">${isFinite(it.factDaysCalc) ? Math.round(it.factDaysCalc) : '∞'}</td>
      <td class="text-right text-[#6f6757]">${fmt(it.orderFinal)}</td>
      <td class="text-right font-bold ${orderClass} text-base">${fmt(it.smartOrder)} ${changed ? (it.smartOrder > it.orderFinal ? '↑' : '↓') : ''}</td>
      <td class="text-right ${daysClass} font-bold">${isFinite(planDays) ? Math.round(planDays) : '∞'}</td>
      <td class="text-sm text-[#6f6757] max-w-md">${escapeHtml(it.statusReason)}</td>`;
    
    tbody.appendChild(tr);
  });
}

/**
 * Инициализация обработчиков событий UI
 */
export function initUIHandlers() {
  // Переключение вкладок
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setCurrentTab(btn.dataset.tab);
      renderTable();
    });
  });

  // Поиск
  const searchInput = $('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', renderTable);
  }

  // Настройки
  const settingsBtn = $('settingsBtn');
  const closeSettings = $('closeSettings');
  const settingsPanel = $('settingsPanel');

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      if (settingsPanel) settingsPanel.classList.add('open');
    });
  }

  if (closeSettings) {
    closeSettings.addEventListener('click', () => {
      if (settingsPanel) settingsPanel.classList.remove('open');
    });
  }

  // Применение настроек
  const applySettings = $('applySettings');
  if (applySettings) {
    applySettings.addEventListener('click', applySettingsHandler);
  }

  // Перезагрузка
  const reloadBtn = $('reloadBtn');
  const fileInput = $('fileInput');
  
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      if (!confirm('Загрузить новый файл? Текущий анализ будет сброшен.')) return;
      
      state.rawItems = [];
      state.analyzedItems = [];
      state.excludedItems = [];
      destroyAllCharts();
      
      const mainApp = $('mainApp');
      const uploadScreen = $('uploadScreen');
      const storeInfo = $('storeInfo');
      
      if (mainApp) mainApp.classList.add('hidden');
      if (uploadScreen) uploadScreen.classList.remove('hidden');
      if (reloadBtn) reloadBtn.classList.add('hidden');
      if (storeInfo) storeInfo.classList.add('hidden');
      if (fileInput) fileInput.value = '';
    });
  }

  // Экспорт
  const exportBtn = $('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportToExcel);
  }
}

/**
 * Обработчик применения настроек
 */
function applySettingsHandler() {
  const settings = getSettings();
  
  settings.targetDaysMin = parseInt($('targetDaysMin')?.value) || 24;
  settings.targetDaysMax = parseInt($('targetDaysMax')?.value) || 30;
  settings.overstockThreshold = parseInt($('overstockThreshold')?.value) || 60;
  settings.leadTimeDays = parseInt($('leadTimeDays')?.value) || 6;
  settings.anomalyMultiplier = parseFloat($('anomalyMultiplier')?.value) || 2;
  settings.deadStockThreshold = parseInt($('deadStockThreshold')?.value) || 2;

  const excl = [];
  document.querySelectorAll('#cubeFilters input[type="checkbox"]').forEach(cb => {
    if (cb.checked) excl.push(cb.dataset.cube);
  });
  settings.excludedCubes = excl;

  updateSettings(settings);
  analyzeAll();
  updateKPI();
  renderCharts();
  renderTable();

  const settingsPanel = $('settingsPanel');
  if (settingsPanel) settingsPanel.classList.remove('open');

  showToast('Параметры применены · пересчёт завершён');
}

/**
 * Экспорт в Excel
 */
function exportToExcel() {
  const items = getAnalyzedItems().filter(it => it.status === getCurrentTab());
  
  if (!items.length) {
    showToast('В этой вкладке нет данных для экспорта');
    return;
  }

  const tabNames = {
    critical: 'Критический_разрыв',
    understock: 'Риск_недостока',
    overstock: 'Пересток',
    anomalies: 'Аномалии',
    promo: 'Промо',
    normal: 'Норма'
  };

  const currentTab = getCurrentTab();
  const data = items.map(it => ({
    'Артикул': it.code,
    'Наименование': it.name,
    'Финальная сумма заказа (шт)': it.smartOrder,
    'Сумма (руб)': Math.round(it.smartOrder * it.costPrice),
    'Комментарий': it.statusReason
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 10 }, { wch: 55 }, { wch: 14 }, { wch: 12 }, { wch: 90 }];
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tabNames[currentTab]);
  XLSX.writeFile(wb, `Annona_${tabNames[currentTab]}_${new Date().toISOString().slice(0, 10)}.xlsx`);

  showToast(`Экспортировано ${items.length} позиций`);
}
