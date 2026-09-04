/**
 * ANNONA — Утилиты (Utils)
 * Вспомогательные функции для работы с данными и DOM
 */

/**
 * Получение элемента по ID
 * @param {string} id - ID элемента
 * @returns {HTMLElement|null}
 */
export const $ = (id) => document.getElementById(id);

/**
 * Преобразование значения в число
 * @param {*} v - Значение
 * @returns {number}
 */
export function num(v) {
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
export function fmt(n) {
  return new Intl.NumberFormat('ru-RU').format(Math.round(n));
}

/**
 * Форматирование денежной суммы
 * @param {number} n - Число
 * @returns {string}
 */
export function fmtMoney(n) {
  return fmt(n) + ' ₽';
}

/**
 * Экранирование HTML-сущностей
 * @param {string} s - Строка
 * @returns {string}
 */
export function escapeHtml(s) {
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
export function showToast(msg) {
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
export function isDragDropSupported() {
  return 'draggable' in document.createElement('div');
}

/**
 * Проверка расширения файла
 * @param {string} filename - Имя файла
 * @returns {boolean}
 */
export function isValidExcelFile(filename) {
  return /\.xlsx?$/i.test(filename);
}
