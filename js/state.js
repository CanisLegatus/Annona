/**
 * ANNONA — Модуль состояния (State Management)
 * Хранит все данные приложения и настройки
 */

export const state = {
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

export function getCurrentTab() {
  return state.currentTab;
}

export function setCurrentTab(tab) {
  state.currentTab = tab;
}

export function getSettings() {
  return { ...state.settings };
}

export function updateSettings(newSettings) {
  Object.assign(state.settings, newSettings);
}

export function getAnalyzedItems() {
  return state.analyzedItems;
}

export function setAnalyzedItems(items) {
  state.analyzedItems = items;
}

export function getExcludedItems() {
  return state.excludedItems;
}

export function getRawItems() {
  return state.rawItems;
}

export function setRawItems(items) {
  state.rawItems = items;
}

export function getAllCubes() {
  return state.allCubes;
}

export function setAllCubes(cubes) {
  state.allCubes = cubes;
}

export function getStoreInfo() {
  return { storeName: state.storeName, orderInfo: state.orderInfo };
}

export function setStoreInfo(storeName, orderInfo) {
  state.storeName = storeName;
  state.orderInfo = orderInfo;
}

export function getCharts() {
  return state.charts;
}

export function setChart(name, chart) {
  state.charts[name] = chart;
}

export function destroyAllCharts() {
  Object.values(state.charts).forEach(ch => ch && ch.destroy());
  state.charts = {};
}
