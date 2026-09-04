/**
 * ANNONA — Главный файл приложения (Main Entry Point)
 * Инициализация и запуск приложения
 */

import { initFileHandlers } from './fileHandler.js';
import { initUIHandlers } from './ui.js';
import { showToast } from './utils.js';

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
