// 執行：在專案根目錄跑 node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const L = require("../app/ledger.js");

const debt = (from, to, amount) => ({ type: "debt", from, to, amount });
const repay = (from, to, amount) => ({ type: "repay", from, to, amount });
const asMap = (edges) => Object.fromEntries(edges.map((e) => [e.from + ">" + e.to, e.amount]));

test("同一對人互欠會自動相減", () => {
  const e = L.pairwise([debt("A", "B", 100), debt("B", "A", 30)]);
  assert.deepEqual(e, [{ from: "A", to: "B", amount: 70 }]);
});

test("還款會減少欠款，還超過會反過來", () => {
  assert.deepEqual(L.pairwise([debt("A", "B", 100), repay("A", "B", 40)]), [{ from: "A", to: "B", amount: 60 }]);
  assert.deepEqual(L.pairwise([debt("A", "B", 100), repay("A", "B", 100)]), []);
  assert.deepEqual(L.pairwise([debt("A", "B", 100), repay("A", "B", 130)]), [{ from: "B", to: "A", amount: 30 }]);
});

test("撤銷的紀錄不算", () => {
  assert.deepEqual(L.pairwise([debt("A", "B", 100), { ...debt("A", "B", 50), voided: true }]), [
    { from: "A", to: "B", amount: 100 },
  ]);
});

test("循環互欠：A→B、B→C、C→A 各 100，抵銷後全部歸零", () => {
  const entries = [debt("A", "B", 100), debt("B", "C", 100), debt("C", "A", 100)];
  const p = L.plan(entries);
  assert.equal(p.current.length, 3);
  assert.deepEqual(p.target, []);
  assert.equal(p.useful, true);
  const after = L.pairwise([...entries, { type: "offset", items: p.items }]);
  assert.deepEqual(after, []);
});

test("債權轉移：A 欠 B 100、B 欠 C 60 → A 欠 B 40、A 欠 C 60", () => {
  const entries = [debt("A", "B", 100), debt("B", "C", 60)];
  const p = L.plan(entries);
  assert.deepEqual(asMap(p.target), { "A>B": 40, "A>C": 60 });
  const after = L.pairwise([...entries, { type: "offset", items: p.items }]);
  assert.deepEqual(asMap(after), { "A>B": 40, "A>C": 60 });
  assert.equal(p.savedFlow, 60);
});

test("已經是最簡的情況，按鈕不需要亮", () => {
  const p = L.plan([debt("A", "B", 100), debt("C", "B", 50)]);
  assert.equal(p.useful, false);
  assert.deepEqual(p.items, []);
});

test("撤銷 offset 後回到抵銷前", () => {
  const entries = [debt("A", "B", 120), debt("B", "C", 80), debt("C", "A", 30)];
  const before = L.pairwise(entries);
  const p = L.plan(entries);
  const offset = { type: "offset", items: p.items };
  assert.notDeepEqual(L.pairwise([...entries, offset]), before);
  assert.deepEqual(L.pairwise([...entries, { ...offset, voided: true }]), before);
});

test("隨機測試 1000 次：每人淨額不變、筆數 ≤ n−1、金額為正整數", () => {
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let round = 0; round < 1000; round++) {
    const n = 2 + Math.floor(rand() * 7); // 2..8 人
    const ids = Array.from({ length: n }, (_, i) => "m" + i);
    const entries = [];
    const count = Math.floor(rand() * 15);
    for (let k = 0; k < count; k++) {
      const a = ids[Math.floor(rand() * n)];
      let b = ids[Math.floor(rand() * n)];
      if (a === b) b = ids[(ids.indexOf(a) + 1) % n];
      const amt = 1 + Math.floor(rand() * 500);
      entries.push(rand() < 0.8 ? debt(a, b, amt) : repay(a, b, amt));
    }
    const p = L.plan(entries);
    const after = L.pairwise([...entries, { type: "offset", items: p.items }]);
    const balBefore = L.balances(p.current);
    const balAfter = L.balances(after);
    for (const id of ids) assert.equal(balAfter[id] || 0, balBefore[id] || 0, `round ${round} ${id}`);
    assert.ok(after.length <= Math.max(0, n - 1), `round ${round}: ${after.length} 筆`);
    assert.deepEqual(asMap(after), asMap(p.target));
    for (const e of [...after, ...p.items]) {
      assert.ok(Number.isInteger(e.amount) && e.amount > 0);
      assert.notEqual(e.from, e.to);
    }
    assert.ok(L.totalFlow(p.target) <= L.totalFlow(p.current));
  }
});

// ---------- v2：結算整理 ----------
const DAY = 86400000;
let uid = 0;
const mk = (o) => ({ id: "e" + String(++uid).padStart(4, "0"), voided: false, ...o });
const applyCompaction = (entries, now, { deleteOld = true } = {}) => {
  const p = L.compactionPlan(entries, now);
  if (!p) return null;
  let next = [...entries.filter((e) => e.id !== p.id), { id: p.id, ...p.doc }];
  if (deleteOld) {
    const stale = new Set(L.staleIds(next));
    next = next.filter((e) => !stale.has(e.id));
  }
  return { plan: p, entries: next };
};

test("抵銷未滿 3 天不整理；滿 3 天後整理，帳不變", () => {
  const now = 10 * DAY;
  const base = [
    mk({ type: "debt", from: "A", to: "B", amount: 100, createdAt: now - 6 * DAY }),
    mk({ type: "debt", from: "B", to: "C", amount: 60, createdAt: now - 5 * DAY }),
  ];
  const p = L.plan(base);
  const off = mk({ type: "offset", items: p.items, createdAt: now - 2 * DAY });
  const later = mk({ type: "debt", from: "C", to: "A", amount: 25, createdAt: now - DAY });
  const entries = [...base, off, later];
  assert.equal(L.compactionPlan(entries, now), null, "未滿 3 天");
  const before = L.pairwise(entries);
  const keep = applyCompaction(entries, now + 2 * DAY, { deleteOld: false });
  assert.ok(keep, "滿 3 天要整理");
  assert.deepEqual(L.pairwise(keep.entries), before, "舊紀錄還在時不重複計算");
  const del = applyCompaction(entries, now + 2 * DAY);
  assert.deepEqual(L.pairwise(del.entries), before, "刪掉舊紀錄後也一樣");
  assert.deepEqual(del.entries.map((e) => e.type).sort(), ["baseline", "debt"], "只剩結算和之後的那筆");
  assert.equal(del.plan.id, "base-" + off.id);
  assert.equal(L.compactionPlan(del.entries, now + 2 * DAY), null, "不會重複整理");
});

test("撤銷的抵銷不整理", () => {
  const now = 10 * DAY;
  const entries = [
    mk({ type: "debt", from: "A", to: "B", amount: 100, createdAt: now - 9 * DAY }),
    mk({ type: "offset", items: [{ from: "A", to: "B", amount: 1 }], createdAt: now - 8 * DAY, voided: true }),
  ];
  assert.equal(L.compactionPlan(entries, now), null);
});

test("連續兩次整理，舊結算沒刪乾淨也不會復活", () => {
  const now = 30 * DAY;
  let entries = [
    mk({ type: "debt", from: "A", to: "B", amount: 100, createdAt: now - 20 * DAY }),
    mk({ type: "debt", from: "B", to: "C", amount: 100, createdAt: now - 19 * DAY }),
  ];
  entries.push(mk({ type: "offset", items: L.plan(entries).items, createdAt: now - 18 * DAY }));
  const first = applyCompaction(entries, now, { deleteOld: false }); // 第一次只寫結算，沒刪
  entries = first.entries;
  entries.push(mk({ type: "debt", from: "C", to: "A", amount: 40, createdAt: now - 10 * DAY }));
  entries.push(mk({ type: "debt", from: "A", to: "C", amount: 10, createdAt: now - 9 * DAY }));
  entries.push(mk({ type: "offset", items: L.plan(entries).items, createdAt: now - 8 * DAY }));
  const before = L.pairwise(entries);
  const second = applyCompaction(entries, now); // 這次刪乾淨，包含第一次的結算
  assert.deepEqual(L.pairwise(second.entries), before);
  assert.equal(second.entries.length, 1);
  assert.equal(second.entries[0].type, "baseline");
});

test("隨機：整理後每人淨額不變", () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let round = 0; round < 300; round++) {
    const ids = ["A", "B", "C", "D"].slice(0, 2 + Math.floor(rand() * 3));
    let entries = [];
    let t = 0;
    for (let k = 0; k < 12; k++) {
      t += DAY * rand();
      if (rand() < 0.25 && entries.length) {
        const p = L.plan(entries);
        if (p.useful) entries.push(mk({ type: "offset", items: p.items, createdAt: t }));
        continue;
      }
      const a = ids[Math.floor(rand() * ids.length)];
      let b = ids[Math.floor(rand() * ids.length)];
      if (a === b) b = ids[(ids.indexOf(a) + 1) % ids.length];
      entries.push(mk({ type: rand() < 0.8 ? "debt" : "repay", from: a, to: b, amount: 1 + Math.floor(rand() * 300), createdAt: t, voided: rand() < 0.1 }));
      if (rand() < 0.3) {
        const r = applyCompaction(entries, t + 4 * DAY, { deleteOld: rand() < 0.5 });
        if (r) {
          assert.deepEqual(L.balances(L.pairwise(r.entries)), L.balances(L.pairwise(entries)), `round ${round}`);
          entries = r.entries;
        }
      }
    }
  }
});

// ---------- v2：兩人之間未還項目 ----------
test("還了一部分只剩餘額", () => {
  const entries = [
    mk({ type: "debt", from: "A", to: "B", amount: 120, note: "吃飯", createdAt: 1 }),
    mk({ type: "repay", from: "A", to: "B", amount: 50, note: "還錢", createdAt: 2 }),
  ];
  const r = L.openItems(entries, "A", "B");
  assert.equal(r.from, "A"); assert.equal(r.to, "B");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].remaining, 70);
  assert.equal(r.items[0].original, 120);
  assert.equal(r.items[0].note, "吃飯");
});

test("先進先出：還款先抵最早的那筆，還清的不顯示", () => {
  const entries = [
    mk({ type: "debt", from: "A", to: "B", amount: 100, note: "早餐", createdAt: 1 }),
    mk({ type: "debt", from: "A", to: "B", amount: 80, note: "晚餐", createdAt: 2 }),
    mk({ type: "repay", from: "A", to: "B", amount: 130, createdAt: 3 }),
  ];
  const r = L.openItems(entries, "B", "A"); // 參數順序不影響結果方向
  assert.equal(r.from, "A");
  assert.deepEqual(r.items.map((i) => [i.note, i.remaining]), [["晚餐", 50]]);
});

test("還超過：方向反過來，剩下多還的部分", () => {
  const entries = [
    mk({ type: "debt", from: "A", to: "B", amount: 100, createdAt: 1 }),
    mk({ type: "repay", from: "A", to: "B", amount: 130, createdAt: 2 }),
  ];
  const r = L.openItems(entries, "A", "B");
  assert.equal(r.from, "B"); assert.equal(r.to, "A");
  assert.deepEqual(r.items.map((i) => [i.source, i.remaining]), [["repay", 30]]);
});

test("抵銷轉入的部分也列出來，加總等於淨額", () => {
  const entries = [
    mk({ type: "debt", from: "A", to: "B", amount: 100, createdAt: 1 }),
    mk({ type: "debt", from: "B", to: "C", amount: 60, createdAt: 2 }),
  ];
  entries.push(mk({ type: "offset", items: L.plan(entries).items, createdAt: 3 }));
  const ac = L.openItems(entries, "A", "C");
  assert.deepEqual(ac.items.map((i) => [i.source, i.remaining]), [["offset", 60]]);
  const ab = L.openItems(entries, "A", "B");
  assert.equal(ab.items.reduce((s, i) => s + i.remaining, 0), 40);
  assert.deepEqual(L.openItems(entries, "B", "C").items, []);
});
