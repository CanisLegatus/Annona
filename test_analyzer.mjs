// Тестовый скрипт для проверки логики analyzer.js

import { analyzeAll } from './js/analyzer.js';
import { state, setRawItems, updateSettings } from './js/state.js';

const testCases = [
  {
    name: "Критический разрыв - остаток меньше чем нужно на период поставки",
    input: {
      code: "TEST-001",
      name: "Товар с критическим разрывом",
      cubeCategory: "TEST",
      stock: 5,
      salesW4: 20,
      salesW3: 18,
      salesW2: 22,
      salesW1: 21,
      salesTotal: 81,
      orderFinal: 10,
      rec: 0,
      orderUM: 0,
      minBatch: 1,
      mtz: 0,
      promo: "",
      goodsInTransit: 0,
      goodsInDelivery: 0,
      costPrice: 100
    },
    expectedStatus: "critical"
  },
  {
    name: "Неликвид - продаж нет, остаток есть",
    input: {
      code: "TEST-002",
      name: "Неликвид",
      cubeCategory: "TEST",
      stock: 50,
      salesW4: 0,
      salesW3: 0,
      salesW2: 0,
      salesW1: 0,
      salesTotal: 0,
      orderFinal: 0,
      rec: 0,
      orderUM: 0,
      minBatch: 1,
      mtz: 0,
      promo: "",
      goodsInTransit: 0,
      goodsInDelivery: 0,
      costPrice: 100
    },
    expectedStatus: "normal",
    expectedDeadStock: true
  },
  {
    name: "Пересток - запас больше 60 дней",
    input: {
      code: "TEST-003",
      name: "Пересток",
      cubeCategory: "TEST",
      stock: 300,
      salesW4: 10,
      salesW3: 12,
      salesW2: 8,
      salesW1: 10,
      salesTotal: 40,
      orderFinal: 20,
      rec: 0,
      orderUM: 0,
      minBatch: 1,
      mtz: 0,
      promo: "",
      goodsInTransit: 0,
      goodsInDelivery: 0,
      costPrice: 100
    },
    expectedStatus: "overstock"
  },
  {
    name: "Аномалия продаж - всплеск на неделе 1",
    input: {
      code: "TEST-004",
      name: "Аномалия",
      cubeCategory: "TEST",
      stock: 50,
      salesW4: 10,
      salesW3: 12,
      salesW2: 11,
      salesW1: 50,
      salesTotal: 83,
      orderFinal: 30,
      rec: 0,
      orderUM: 0,
      minBatch: 1,
      mtz: 0,
      promo: "",
      goodsInTransit: 0,
      goodsInDelivery: 0,
      costPrice: 100
    },
    expectAnomaly: true
  },
  {
    name: "Промо товар - недостаток запаса",
    input: {
      code: "TEST-005",
      name: "Промо товар",
      cubeCategory: "TEST",
      stock: 30,
      salesW4: 15,
      salesW3: 18,
      salesW2: 20,
      salesW1: 22,
      salesTotal: 75,
      orderFinal: 20,
      rec: 0,
      orderUM: 0,
      minBatch: 1,
      mtz: 0,
      promo: "Акция 1",
      goodsInTransit: 0,
      goodsInDelivery: 0,
      costPrice: 100
    },
    // Промо должен увеличить целевой запас на 30%, поэтому при низком запасе будет недокомплект
    // dailySales ≈ 2.84, atDeliveryDays ≈ 11, цель для промо 31.2-39 дней
    expectedStatus: "promo"
  },
  {
    name: "Норма - все в балансе (заказ оптимален)",
    input: {
      code: "TEST-006",
      name: "Нормальный товар",
      cubeCategory: "TEST",
      stock: 50,
      salesW4: 20,
      salesW3: 22,
      salesW2: 18,
      salesW1: 20,
      salesTotal: 80,
      orderFinal: 43,  // Умный заказ тоже будет 43 - значит заказ оптимален
      rec: 0,
      orderUM: 0,
      minBatch: 1,
      mtz: 0,
      promo: "",
      goodsInTransit: 0,
      goodsInDelivery: 0,
      costPrice: 100
    },
    // dailySales ≈ 2.83, stock=50, factDays ≈ 17.7
    // availableAtDelivery = 50 - 17 = 33
    // targetAtDelivery = 2.83 * 27 = 76.4
    // ideal = 76.4 - 33 = 43.4 → smartOrder ≈ 43
    // atDeliveryDays после заказа ≈ 27 дней (в диапазоне 24-30)
    // smartOrder == orderFinal → normal
    expectedStatus: "normal"
  },
  {
    name: "МТЗ - минимальная товарная заполненность",
    input: {
      code: "TEST-007",
      name: "Товар с МТЗ",
      cubeCategory: "TEST",
      stock: 5,
      salesW4: 2,
      salesW3: 1,
      salesW2: 2,
      salesW1: 1,
      salesTotal: 6,
      orderFinal: 0,
      rec: 0,
      orderUM: 0,
      minBatch: 1,
      mtz: 20,
      promo: "",
      goodsInTransit: 0,
      goodsInDelivery: 0,
      costPrice: 100
    },
    expectMtzApplied: true
  },
  {
    name: "Минимальная партия",
    input: {
      code: "TEST-008",
      name: "Товар с мин. партией",
      cubeCategory: "TEST",
      stock: 20,
      salesW4: 15,
      salesW3: 14,
      salesW2: 16,
      salesW1: 15,
      salesTotal: 60,
      orderFinal: 10,
      rec: 0,
      orderUM: 0,
      minBatch: 50,
      mtz: 0,
      promo: "",
      goodsInTransit: 0,
      goodsInDelivery: 0,
      costPrice: 100
    },
    expectMinBatch: 50
  },
  {
    name: "Нет продаж и нет остатка",
    input: {
      code: "TEST-010",
      name: "Пустой товар",
      cubeCategory: "TEST",
      stock: 0,
      salesW4: 0,
      salesW3: 0,
      salesW2: 0,
      salesW1: 0,
      salesTotal: 0,
      orderFinal: 0,
      rec: 0,
      orderUM: 0,
      minBatch: 1,
      mtz: 0,
      promo: "",
      goodsInTransit: 0,
      goodsInDelivery: 0,
      costPrice: 100
    },
    expectedStatus: "normal",
    expectedSmartOrder: 0
  },
  {
    name: "Риск недостока (understock) - запас ниже нормы",
    input: {
      code: "TEST-011",
      name: "Риск недостока",
      cubeCategory: "TEST",
      stock: 40,
      salesW4: 20,
      salesW3: 22,
      salesW2: 18,
      salesW1: 20,
      salesTotal: 80,
      orderFinal: 10,
      rec: 0,
      orderUM: 0,
      minBatch: 1,
      mtz: 0,
      promo: "",
      goodsInTransit: 0,
      goodsInDelivery: 0,
      costPrice: 100
    },
    // dailySales ≈ 2.83, stock=40, factDays ≈ 14.1
    // availableAtDelivery = 40 - 17 = 23
    // targetAtDelivery = 2.83 * 27 = 76.4
    // ideal = 76.4 - 23 = 53.4 → smartOrder ≈ 53
    // smartOrder > orderFinal (53 > 10) → understock
    expectedStatus: "understock"
  }
];

const settings = {
  targetDaysMin: 24,
  targetDaysMax: 30,
  overstockThreshold: 60,
  leadTimeDays: 6,
  anomalyMultiplier: 2,
  deadStockThreshold: 2,
  excludedCubes: []
};

updateSettings(settings);

let passed = 0;
let failed = 0;

console.log("=== ANNONA Analyzer Tests ===\n");

testCases.forEach((tc, idx) => {
  state.rawItems = [tc.input];
  state.analyzedItems = [];
  
  try {
    const results = analyzeAll();
    const result = results[0];
    
    let testPassed = true;
    let errors = [];
    
    // Проверка статуса
    if (tc.expectedStatus && result.status !== tc.expectedStatus) {
      testPassed = false;
      errors.push(`Статус: ожидался "${tc.expectedStatus}", получен "${result.status}"`);
    }
    
    // Проверка неликвида
    if (tc.expectedDeadStock !== undefined && result.isDeadStock !== tc.expectedDeadStock) {
      testPassed = false;
      errors.push(`Неликвид: ожидалось ${tc.expectedDeadStock}, получено ${result.isDeadStock}`);
    }
    
    // Проверка аномалии
    if (tc.expectAnomaly && !result.anomalyFlag) {
      testPassed = false;
      errors.push(`Аномалия: ожидалась аномалия, но anomalyFlag=false`);
    }
    
    // Проверка МТЗ
    if (tc.expectMtzApplied && !result.mtzApplied) {
      testPassed = false;
      errors.push(`МТЗ: ожидалось применение МТЗ, но mtzApplied=false`);
    }
    
    // Проверка умного заказа
    if (tc.expectedSmartOrder !== undefined && result.smartOrder !== tc.expectedSmartOrder) {
      testPassed = false;
      errors.push(`Умный заказ: ожидался ${tc.expectedSmartOrder}, получен ${result.smartOrder}`);
    }
    
    // Проверка мин. партии
    if (tc.expectMinBatch && result.smartOrder % tc.expectMinBatch !== 0) {
      testPassed = false;
      errors.push(`Мин. партия: заказ ${result.smartOrder} не кратен ${tc.expectMinBatch}`);
    }
    
    if (testPassed) {
      passed++;
      console.log(`✓ Тест ${idx + 1}: ${tc.name}`);
    } else {
      failed++;
      console.log(`✗ Тест ${idx + 1}: ${tc.name}`);
      errors.forEach(e => console.log(`  → ${e}`));
    }
    
    console.log(`  Статус: ${result.status}, Заказ: ${result.smartOrder}, Дней запаса: ${Math.round(result.smartStockDays)}, dailySales: ${result.dailySales.toFixed(2)}\n`);
    
  } catch (err) {
    failed++;
    console.log(`✗ Тест ${idx + 1}: ${tc.name} - ОШИБКА: ${err.message}`);
  }
});

console.log(`\n=== Итоги: ${passed} пройдено, ${failed} провалено ===`);
process.exit(failed > 0 ? 1 : 0);
