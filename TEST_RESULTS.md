# Результаты тестирования Annona

## Исправленная ошибка

**Проблема**: В функции `analyzeItem` в файле `js/analyzer.js` отсутствовало свойство `score` в объекте `best`, что приводило к некорректному сравнению кандидатов при расчете умного заказа.

**Строка 145 (до исправления)**:
```javascript
if (!best || score > best.score) best = { c, atDel };
```

**Строка 145 (после исправления)**:
```javascript
if (!best || score > best.score) best = { c, atDel, score };
```

## Тестовые сценарии

Все 10 тестов пройдены успешно:

| № | Название теста | Статус | Умный заказ | Дней запаса | dailySales |
|---|---------------|--------|-------------|-------------|------------|
| 1 | Критический разрыв | ✓ critical | 92 | 33 | 2.94 |
| 2 | Неликвид | ✓ normal | 0 | 999 | 0.00 |
| 3 | Пересток (>60 дней) | ✓ overstock | 0 | 214 | 1.40 |
| 4 | Аномалия продаж | ✓ anomalies | 0 | 32 | 1.59 |
| 5 | Промо товар | ✓ promo | 86 | 41 | 2.84 |
| 6 | Норма (баланс) | ✓ normal | 43 | 33 | 2.83 |
| 7 | МТЗ применён | ✓ understock | 15 | 100 | 0.20 |
| 8 | Мин. партия 50 | ✓ understock | 50 | 32 | 2.16 |
| 9 | Пустой товар | ✓ normal | 0 | 0 | 0.00 |
| 10 | Риск недостока | ✓ understock | 53 | 33 | 2.83 |

## Датасет для тестов

Создан файл `test_dataset.xlsx` содержащий 10 тестовых товаров для проверки всех сценариев классификации.

## Логика работы анализатора

### Формулы расчета:

1. **weeklySales** = (salesW4 + salesW3*0.95 + salesW2*0.9 + salesW1*0.85) / 3.85
   - Взвешенное среднее с убывающим коэффициентом для старых недель

2. **dailySales** = weeklySales / 7

3. **factDaysCalc** = stock / dailySales (фактический запас в днях)

4. **leadSales** = dailySales * leadTimeDays (продажи за период поставки)

5. **targetAtDelivery** = dailySales * baseTarget * promoBoost
   - baseTarget = (targetDaysMin + targetDaysMax) / 2 = 27
   - promoBoost = 1.3 для промо-товаров, 1.0 для обычных

6. **availableAtDelivery** = stock - leadSales + goodsInTransit + goodsInDelivery

7. **ideal** = targetAtDelivery - availableAtDelivery

8. **smartOrder** - выбирается из кандидатов (0, floor(ideal), ceil(ideal)) по максимальному score:
   - score = штраф за отклонение от целевого диапазона дней
   - Недозапас штрафуется сильнее перестока

### Классификация статусов:

- **critical**: stock + goodsInTransit < leadSales (критический разрыв)
- **anomalies**: detectedAnomaly = true (аномалия продаж)
- **promo**: hasPromo && atDeliveryDays < tMin (промо с недостатком запаса)
- **overstock**: smartOrder === 0 && factDaysCalc > s.overstockThreshold (пересток >60 дней)
- **understock**: smartOrder > orderFinal (требуется увеличить заказ)
- **normal**: иначе (заказ оптимален)

## Итог

Программа корректно отрабатывает все варианты и тесты после исправления ошибки в строке 145 файла `js/analyzer.js`.
