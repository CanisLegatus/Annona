/**
 * ANNONA — Бизнес-логика анализа данных (Analyzer)
 * Классификация товаров, расчёт рекомендаций, определение статусов
 */

import { state, getSettings, setAnalyzedItems, getExcludedItems } from './state.js';
import { num } from './utils.js';

/**
 * Анализ всех товаров
 */
export function analyzeAll() {
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

export { orderChangeText };
