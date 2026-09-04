/**
 * ANNONA — Модуль работы с файлами (File Handler)
 * Загрузка, чтение и парсинг Excel-файлов
 */

import { $, num, showToast, isValidExcelFile } from './utils.js';
import { state, setStoreInfo, setRawItems, getAllCubes, setAllCubes, getSettings } from './state.js';
import { analyzeAll } from './analyzer.js';
import { renderApp, renderCubeFilters } from './ui.js';

/**
 * Инициализация обработчиков загрузки файлов
 */
export function initFileHandlers(onFileLoaded) {
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
