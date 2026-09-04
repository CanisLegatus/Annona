/**
 * ANNONA — Утилиты (Utils)
 * Вспомогательные функции для работы с данными и DOM
 */

/**
 * Получение элемента по ID
 * @param {string} id - ID элемента
 * @returns {HTMLElement|null}
 */
$ = (id) => document.getElementById(id);

/**
 * Преобразование значения в число
 * @param {*} v - Значение
 * @returns {number}
 */
function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const p = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return isNaN(p) ? 0 : p;
}

/**
 * Форматирование числа с разделителями тысяч
 * @param {number} n - Число
 * @returns {string}
 */
function fmt(n) {
  return new Intl.NumberFormat('ru-RU').format(Math.round(n));
}

/**
 * Форматирование денежной суммы
 * @param {number} n - Число
 * @returns {string}
 */
function fmtMoney(n) {
  return fmt(n) + ' ₽';
}

/**
 * Экранирование HTML-сущностей
 * @param {string} s - Строка
 * @returns {string}
 */
function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Показ уведомления (toast)
 * @param {string} msg - Сообщение
 */
function showToast(msg) {
  const toast = $('toast');
  if (!toast) return;
  
  toast.textContent = msg;
  toast.style.transform = 'translateY(0)';
  toast.style.opacity = '1';
  
  setTimeout(() => {
    toast.style.transform = 'translateY(20px)';
    toast.style.opacity = '0';
  }, 3200);
}

/**
 * Проверка поддержки drag & drop
 * @returns {boolean}
 */
function isDragDropSupported() {
  return 'draggable' in document.createElement('div');
}

/**
 * Проверка расширения файла
 * @param {string} filename - Имя файла
 * @returns {boolean}
 */
function isValidExcelFile(filename) {
  return /\.xlsx?$/i.test(filename);
}
/**
 * ANNONA — Модуль состояния (State Management)
 * Хранит все данные приложения и настройки
 */

  rawItems: [],
  analyzedItems: [],
  excludedItems: [],
  currentTab: 'critical',
  settings: {
    targetDaysMin: 24,
    targetDaysMax: 30,
    overstockThreshold: 60,
    leadTimeDays: 6,
    anomalyMultiplier: 2,
    deadStockThreshold: 2,
    excludedCubes: ['!ВНЕ_АМ-1', 'ЗО', 'ЗО вр', 'ЗО сеть']
  },
  storeName: '',
  orderInfo: '',
  charts: {},
  allCubes: []
};

function getCurrentTab() {
  return state.currentTab;
}

function setCurrentTab(tab) {
  state.currentTab = tab;
}

function getSettings() {
  return { ...state.settings };
}

function updateSettings(newSettings) {
  Object.assign(state.settings, newSettings);
}

function getAnalyzedItems() {
  return state.analyzedItems;
}

function setAnalyzedItems(items) {
  state.analyzedItems = items;
}

function getExcludedItems() {
  return state.excludedItems;
}

function getRawItems() {
  return state.rawItems;
}

function setRawItems(items) {
  state.rawItems = items;
}

function getAllCubes() {
  return state.allCubes;
}

function setAllCubes(cubes) {
  state.allCubes = cubes;
}

function getStoreInfo() {
  return { storeName: state.storeName, orderInfo: state.orderInfo };
}

function setStoreInfo(storeName, orderInfo) {
  state.storeName = storeName;
  state.orderInfo = orderInfo;
}

function getCharts() {
  return state.charts;
}

function setChart(name, chart) {
  state.charts[name] = chart;
}

function destroyAllCharts() {
  Object.values(state.charts).forEach(ch => ch && ch.destroy());
  state.charts = {};
}
/**
 * ANNONA — Бизнес-логика анализа данных (Analyzer)
 * Классификация товаров, расчёт рекомендаций, определение статусов
 */


/**
 * Анализ всех товаров
 */
function analyzeAll() {
  const s = getSettings();
  const baseTarget = (s.targetDaysMin + s.targetDaysMax) / 2;

  // Разделение на исключённые и основные товары
  const excludedItems = [];
  const pool = [];
  
  state.rawItems.forEach(it => {
    if (it.cubeCategory && s.excludedCubes.includes(it.cubeCategory)) {
      excludedItems.push(it);
    } else {
      pool.push(it);
    }
  });

  state.excludedItems = excludedItems;

  // Анализ каждого товара из пула
  const analyzedItems = pool.map(raw => analyzeItem(raw, s, baseTarget));
  
  setAnalyzedItems(analyzedItems);
  
  return analyzedItems;
}

/**
 * Анализ одного товара
 * @param {Object} raw - Исходные данные товара
 * @param {Object} s - Настройки
 * @param {number} baseTarget - Целевой запас (среднее)
 * @returns {Object}
 */
function analyzeItem(raw, s, baseTarget) {
  const it = { ...raw };

  // 1. Прогноз продаж: обрезка аномалий + взвешенное среднее
  const weeks = [it.salesW1, it.salesW2, it.salesW3, it.salesW4];
  const adjusted = [...weeks];
  it.anomalyFlag = false;
  it.anomalyWeek = 0;
  it.anomalyValue = 0;

  for (let i = 0; i < 4; i++) {
    if (weeks[i] < 3) continue;
    
    const others = weeks.filter((_, k) => k !== i);
    const othersSum = others.reduce((a, b) => a + b, 0);
    const othersAvg = othersSum / 3;
    const spike = othersSum === 0 ? true : weeks[i] > othersAvg * s.anomalyMultiplier;
    
    if (spike) {
      it.anomalyFlag = true;
      it.anomalyWeek = i + 1;
      it.anomalyValue = weeks[i];
      adjusted[i] = Math.max(othersAvg, 1);
      break;
    }
  }

  const weights = [0.4, 0.3, 0.2, 0.1];
  it.weeklySales = adjusted.reduce((sum, w, i) => sum + w * weights[i], 0);
  it.dailySales = it.weeklySales / 7;

  // 2. Проверка отсутствия спроса
  const hasOrderSignal = it.orderFinal > 0 || it.rec > 0 || it.orderUM > 0;
  
  if (it.dailySales === 0) {
    it.criticalGap = false;
    it.isDeadStock = false;
    
    if (it.stock === 0) {
      it.smartOrder = hasOrderSignal ? it.orderFinal : 0;
      it.smartStockDays = it.smartOrder > 0 ? 999 : 0;
      it.factDaysCalc = 0;
      it.status = 'normal';
      it.statusReason = hasOrderSignal
        ? `💤 Продаж и остатка нет, но заказ ${it.orderFinal} шт сохранён (решение системы/УМ). Проверьте: возможно новинка или был out-of-stock.`
        : '💤 Продаж нет, остатка нет — заказ не требуется.';
      return it;
    }
    
    it.isDeadStock = true;
  } else {
    it.isDeadStock = it.salesTotal <= s.deadStockThreshold && it.stock > 0;
  }

  // 3. Основные метрики
  const leadSales = it.dailySales * s.leadTimeDays;
  it.criticalGap = (it.stock + it.goodsInTransit) < leadSales;
  it.factDaysCalc = it.stock / it.dailySales;

  const promoBoost = it.promo ? 1.3 : 1;
  const tMin = s.targetDaysMin * promoBoost;
  const tMax = s.targetDaysMax * promoBoost;

  // 4. Умный заказ через оценку кандидатов
  let smart = 0;
  let minBatchNote = false;

  if (it.isDeadStock && !it.criticalGap) {
    smart = 0;
  } else {
    const targetAtDelivery = it.dailySales * baseTarget * promoBoost;
    const availableAtDelivery = it.stock - leadSales + it.goodsInTransit + it.goodsInDelivery;
    const ideal = targetAtDelivery - availableAtDelivery;

    if (ideal <= 0) {
      smart = 0;
    } else {
      const cand = new Set([0]);
      
      if (it.minBatch > 0) {
        cand.add(Math.floor(ideal / it.minBatch) * it.minBatch);
        cand.add(Math.ceil(ideal / it.minBatch) * it.minBatch);
      } else {
        cand.add(Math.floor(ideal));
        cand.add(Math.ceil(ideal));
      }

      let best = null;
      cand.forEach(c => {
        if (c < 0) return;
        if (c === 0 && it.criticalGap) return; // железное правило: пустая полка недопустима
        
        const atDel = (it.stock + c + it.goodsInTransit + it.goodsInDelivery - leadSales) / it.dailySales;
        let score = 0;
        
        if (atDel < tMin) score -= (tMin - atDel) * 2;      // недозапас хуже перестока
        else if (atDel > tMax) score -= (atDel - tMax);
        if (atDel > s.overstockThreshold) score -= (atDel - s.overstockThreshold) * 5;
        score -= c * 1e-6; // при прочих равных — меньший заказ
        
        if (!best || score > best.score) best = { c, atDel };
      });

      smart = best ? best.c : 0;
      if (best && it.minBatch > 0 && best.atDel > s.targetDaysMax) minBatchNote = true;
    }
  }

  // 5. Применение МТЗ (минимальной товарной заполненности)
  it.mtzApplied = false;
  if (it.mtz > 0 && it.dailySales > 0 && !it.isDeadStock && it.stock + smart < it.mtz) {
    let need = it.mtz - it.stock;
    if (it.minBatch > 0) need = Math.ceil(need / it.minBatch) * it.minBatch;
    need = Math.max(need, 0);
    if (need > smart) {
      smart = need;
      it.mtzApplied = true;
    }
  }

  it.smartOrder = smart;
  it.minBatchNote = minBatchNote;

  // 6. Плановый запас дней
  const totalAvail = it.stock + smart + it.goodsInTransit + it.goodsInDelivery;
  it.smartStockDays = it.dailySales > 0 ? totalAvail / it.dailySales : (totalAvail > 0 ? 999 : 0);
  it.atDeliveryDays = it.dailySales > 0 ? (totalAvail - leadSales) / it.dailySales : it.smartStockDays;

  // Классификация товара
  classifyItem(it, s);
  
  return it;
}

/**
 * Классификация товара по статусу
 * @param {Object} it - Товар
 * @param {Object} s - Настройки
 */
function classifyItem(it, s) {
  const r = [];
  const changed = it.smartOrder !== it.orderFinal;

  if (it.criticalGap) {
    it.status = 'critical';
    const deficit = Math.ceil(it.dailySales * s.leadTimeDays - it.stock - it.goodsInTransit);
    r.push(`🔥 КРИТИЧЕСКИЙ РАЗРЫВ: остаток ${it.stock} шт закончится ДО поставки в четверг (не хватает ~${deficit} шт на ${s.leadTimeDays} дней ожидания).`);
    
    if (it.smartOrder > 0) {
      r.push(`Заказ ${it.smartOrder} шт подтверждён, но полка будет пустой до прихода машины — нужно срочное решение (перемещение, ускорение).`);
    } else {
      r.push(`⚠️ Заказ равен 0 — требуется немедленное вмешательство!`);
    }
    
    if (it.smartOrder > it.orderFinal) {
      r.push(`📈 Заказ увеличен с ${it.orderFinal} до ${it.smartOrder} шт.`);
    } else if (it.smartOrder === it.orderFinal && it.smartOrder > 0) {
      r.push(`✓ Автозаказ ${it.orderFinal} шт оставлен без изменений.`);
    }
  } else if (it.isDeadStock) {
    if (changed) {
      it.status = 'anomalies';
      r.push(`🪦 НЕЛИКВИД: продажи ${it.salesTotal} шт за 4 недели при остатке ${it.stock} шт.`);
      r.push(orderChangeText(it));
      if (it.factDaysCalc > s.overstockThreshold) {
        r.push(`Текущий запас покрывает ${Math.round(it.factDaysCalc)} дней — подумай о распродаже.`);
      }
    } else {
      it.status = 'normal';
      r.push('✓ Неликвид, но автозаказ уже нулевой — менять нечего.');
    }
  } else if (it.anomalyFlag && changed) {
    it.status = 'anomalies';
    r.push(`📊 АНОМАЛИЯ ПРОДАЖ: всплеск на неделе -${it.anomalyWeek} (${it.anomalyValue} шт) срезан в прогнозе.`);
    r.push(orderChangeText(it));
    r.push(`Плановый запас: ${Math.round(it.smartStockDays)} дн.`);
  } else if (it.smartOrder < it.orderFinal) {
    it.status = 'overstock';
    r.push(`📦 ЗАЩИТА ОТ ПЕРЕСТОКА: ${orderChangeText(it)}`);
    if (it.smartOrder === 0) {
      r.push(`Текущий остаток ${it.stock} шт сам покрывает ${Math.round(it.factDaysCalc)} дн.`);
    }
    r.push(`Запас на момент поставки: ${Math.round(it.atDeliveryDays)} дн (цель ${s.targetDaysMin}–${s.targetDaysMax}).`);
  } else if (it.smartOrder > it.orderFinal) {
    it.status = it.promo ? 'promo' : 'understock';
    if (it.promo) {
      r.push(`🎯 ПРОМО «${it.promo}»: целевой запас увеличен на 30%.`);
    } else {
      r.push('⚡ РИСК НЕДОСТАКА: текущего заказа недостаточно.');
    }
    r.push(orderChangeText(it));
    r.push(`Запас на момент поставки: ${Math.round(it.atDeliveryDays)} дн.`);
  } else {
    it.status = 'normal';
    r.push(`✓ Автозаказ ${it.orderFinal} шт оптимален. Запас на поставку: ${Math.round(it.atDeliveryDays)} дн.`);
  }

  if (it.minBatchNote && it.smartOrder > 0) {
    r.push(`⚠️ Мин. партия ${it.minBatch} шт: меньше заказать нельзя — получится запас выше цели.`);
  }
  if (it.mtzApplied) {
    r.push(`🔻 Заказ поднят до МТЗ (${it.mtz} шт).`);
  }
  if (it.promo && it.status !== 'promo' && it.status !== 'normal') {
    r.push(`🎯 Участвует в промо «${it.promo}».`);
  }

  it.statusReason = r.join(' ');
}

/**
 * Текст изменения заказа
 * @param {Object} it - Товар
 * @returns {string}
 */
function orderChangeText(it) {
  if (it.smartOrder === 0) return `🚫 Заказ обнулён (было ${it.orderFinal} шт).`;
  if (it.smartOrder < it.orderFinal) return `📉 Заказ сокращён с ${it.orderFinal} до ${it.smartOrder} шт.`;
  if (it.smartOrder > it.orderFinal) return `📈 Заказ увеличен с ${it.orderFinal} до ${it.smartOrder} шт.`;
  return `✓ Заказ без изменений (${it.orderFinal} шт).`;
}

/**
 * ANNONA — Модуль работы с файлами (File Handler)
 * Загрузка, чтение и парсинг Excel-файлов
 */


/**
 * Инициализация обработчиков загрузки файлов
 */
function initFileHandlers(onFileLoaded) {
  const dropZone = $('dropZone');
  const fileInput = $('fileInput');
  const selectFileBtn = $('selectFileBtn');

  if (!dropZone || !fileInput || !selectFileBtn) return;

  selectFileBtn.addEventListener('click', e => {
    e.stopPropagation();
    fileInput.click();
  });

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      handleFile(e.dataTransfer.files[0], onFileLoaded);
    }
  });

  fileInput.addEventListener('change', e => {
    if (e.target.files.length) {
      handleFile(e.target.files[0], onFileLoaded);
    }
  });
}

/**
 * Обработка загруженного файла
 * @param {File} file
 * @param {Function} onFileLoaded - Callback после загрузки
 */
function handleFile(file, onFileLoaded) {
  if (!isValidExcelFile(file.name)) {
    showToast('Поддерживается только .xlsx');
    return;
  }

  showToast('Читаю свиток...');

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      parseOrderData(json, onFileLoaded);
    } catch (err) {
      console.error(err);
      showToast('Ошибка чтения: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

/**
 * Парсинг данных заказа из Excel
 * @param {Array<Array>} rows - Данные из Excel
 * @param {Function} onFileLoaded - Callback после загрузки
 */
function parseOrderData(rows, onFileLoaded) {
  let headerIdx = -1;
  let headers = [];

  // Поиск заголовка
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = rows[i];
    if (!row) continue;
    
    const joined = row.map(c => String(c).trim()).join('|');
    if (joined.includes('Код') && joined.includes('Группа') && joined.includes('Остаток факт')) {
      headerIdx = i;
      headers = row.map(c => String(c).trim());
      break;
    }
  }

  if (headerIdx === -1) {
    showToast('Не найдена структура файла заказа');
    return;
  }

  // Извлечение мета-данных (магазин, номер заказа, дата)
  extractMetadata(rows, headerIdx);

  // Построение карты колонок
  const colMap = buildColumnMap(headers);

  // Парсинг товаров
  const cubeSet = new Set();
  const items = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const item = parseItemRow(row, colMap, cubeSet);
    if (item) items.push(item);
  }

  // Сохранение кубов и товаров
  const allCubes = Array.from(new Set([...cubeSet, ...getSettings().excludedCubes])).sort();
  setAllCubes(allCubes);
  renderCubeFilters();

  setRawItems(items);

  if (!items.length) {
    showToast('Не найдено ни одной позиции');
    return;
  }

  // Анализ и отображение
  analyzeAll();
  renderApp();
  
  const excludedCount = state.excludedItems?.length || 0;
  showToast(`Загружено ${items.length} SKU · В расчёте ${state.analyzedItems.length} · Исключено ${excludedCount}`);

  if (onFileLoaded) onFileLoaded();
}

/**
 * Извлечение мета-данных из файла
 * @param {Array<Array>} rows - Данные из Excel
 * @param {number} headerIdx - Индекс строки заголовка
 */
function extractMetadata(rows, headerIdx) {
  let storeName = '';
  let orderInfo = '';

  const prelude = rows.slice(0, headerIdx);
  prelude.forEach(row => {
    if (!row) return;
    
    row.forEach(cell => {
      const s = String(cell);
      if (s.includes('Адрес')) {
        const m = s.replace(/.*Адрес\s*/, '').trim();
        if (m) storeName = m;
      }
    });

    const joined = row.join(' ');
    const codeM = joined.match(/(Б-\d+)/);
    const dateM = joined.match(/(\d{2}\.\d{2}\.\d{4})/);
    
    if (codeM && !orderInfo) {
      orderInfo = codeM[1] + (dateM ? ' от ' + dateM[1] : '');
    }
  });

  setStoreInfo(storeName, orderInfo);
}

/**
 * Построение карты колонок
 * @param {string[]} headers - Заголовки колонок
 * @returns {Object}
 */
function buildColumnMap(headers) {
  const colMap = {};
  const colNames = [
    'Код', 'Группа/Товар', 'Коммерческая категория', 'Мерчендайзинговая категория',
    'Категория торговая', 'Акции', 'Категория цены магазина', 'Категория куб',
    'ТОП100 на дату поставки', 'Мин. партия', 'Всего Кол-во', 'Себестоимость',
    'Цена магазина', 'Наценка факт', 'Дата последней поставки',
    'История продаж (Продажи -4 недели)', 'История продаж (Продажи -3 недели)',
    'История продаж (Продажи -2 недели)', 'История продаж (Продажи -1 неделя)',
    'Продажи всего', 'Остаток факт', 'Запас факт', 'МТЗ', 'Рек', 'Заказ УМ',
    'Заказ итого', 'Запас дней (план)', 'Товар в пути', 'Товар в поставке',
    'Распределения', 'Необработанные заказы', 'Дата окончания продаж',
    'Дата прихода следующей партии товара (контейнера)', 'Склад прихода товара',
    'Комментарий', 'Предупреждения'
  ];

  colNames.forEach(name => {
    const idx = headers.findIndex(h => h === name || h.includes(name));
    if (idx !== -1) colMap[name] = idx;
  });

  return colMap;
}

/**
 * Парсинг одной строки товара
 * @param {Array} row - Строка данных
 * @param {Object} colMap - Карта колонок
 * @param {Set} cubeSet - Множество кубов
 * @returns {Object|null}
 */
function parseItemRow(row, colMap, cubeSet) {
  const code = String(row[colMap['Код']] ?? '').trim();
  const name = String(row[colMap['Группа/Товар']] ?? '').trim();
  
  if (!code || !name) return null;

  const cubeCategory = String(row[colMap['Категория куб']] ?? '').trim();
  if (cubeCategory) cubeSet.add(cubeCategory);

  const stock = num(row[colMap['Остаток факт']]);
  const salesTotal = num(row[colMap['Продажи всего']]);
  const orderFinal = num(row[colMap['Заказ итого']]);
  const rec = num(row[colMap['Рек']]);
  const orderUM = num(row[colMap['Заказ УМ']]);
  const totalQty = num(row[colMap['Всего Кол-во']]);

  // Пропуск групповых строк (код вида 700-000)
  if (/-000$/.test(code) && stock === 0 && salesTotal === 0 && orderFinal === 0 && rec === 0 && orderUM === 0) {
    return null;
  }
  
  // Пропуск полностью пустых строк
  if (stock === 0 && salesTotal === 0 && orderFinal === 0 && rec === 0 && orderUM === 0 && totalQty === 0) {
    return null;
  }

  return {
    code,
    name,
    tradeCategory: String(row[colMap['Категория торговая']] ?? '').trim(),
    promo: String(row[colMap['Акции']] ?? '').trim(),
    cubeCategory,
    minBatch: num(row[colMap['Мин. партия']]),
    costPrice: num(row[colMap['Себестоимость']]),
    salesW4: num(row[colMap['История продаж (Продажи -4 недели)']]),
    salesW3: num(row[colMap['История продаж (Продажи -3 недели)']]),
    salesW2: num(row[colMap['История продаж (Продажи -2 недели)']]),
    salesW1: num(row[colMap['История продаж (Продажи -1 неделя)']]),
    salesTotal,
    stock,
    stockDaysFact: num(row[colMap['Запас факт']]),
    mtz: num(row[colMap['МТЗ']]),
    rec,
    orderUM,
    orderFinal,
    goodsInTransit: num(row[colMap['Товар в пути']]),
    goodsInDelivery: num(row[colMap['Товар в поставке']])
  };
}
/**
 * ANNONA — Модуль пользовательского интерфейса (UI Renderer)
 * Отрисовка таблиц, графиков, KPI и обновление интерфейса
 */


/**
 * Главная функция отрисовки приложения
 */
function renderApp() {
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
function renderCubeFilters() {
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
function renderCharts() {
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
function renderTable() {
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
function initUIHandlers() {
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
/**
 * ANNONA — Главный файл приложения (Main Entry Point)
 * Инициализация и запуск приложения
 */


/**
 * Точка входа в приложение
 */
function initApp() {
  console.log('Annona v1.0 — Cura Abundantiae');
  
  // Инициализация обработчиков загрузки файлов
  initFileHandlers(() => {
    console.log('Файл загружен и обработан');
  });

  // Инициализация UI обработчиков
  initUIHandlers();

  // Уведомление о готовности
  showToast('Система готова к работе');
}

// Запуск приложения после загрузки DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
