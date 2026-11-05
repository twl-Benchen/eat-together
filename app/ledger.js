/* 飯友帳本：純計算邏輯（不碰畫面）。
 * 所有金額都是整數新台幣。
 * entry.type:
 *   "debt"     from 欠 to amount（畫面上說成「to 幫 from 代墊」）
 *   "repay"    from 還 to amount（減少 from 欠 to 的錢）
 *   "offset"   items:[{from,to,amount}]，每一項代表「from 欠 to」再加 amount
 *   "baseline" 結算：items 同上；replaces 列出被它取代、不再計算的紀錄 id
 */
(function (root) {
  "use strict";

  const DAY = 86400000;
  const COMPACT_AFTER = 3 * DAY;

  // 淨額表：key 為 "a|b"（a < b），值 > 0 代表 a 欠 b，< 0 代表 b 欠 a。
  function addTo(net, from, to, amount) {
    if (!from || !to || from === to || !amount) return;
    if (from < to) {
      const k = from + "|" + to;
      net[k] = (net[k] || 0) + amount;
    } else {
      const k = to + "|" + from;
      net[k] = (net[k] || 0) - amount;
    }
  }

  function toInt(n) {
    const v = Math.round(Number(n));
    return Number.isFinite(v) ? v : 0;
  }

  // 所有結算紀錄宣告取代的 id（包含已經被更新的結算取代的舊結算）
  function replacedSet(entries) {
    const s = new Set();
    for (const e of entries || []) {
      if (e && e.type === "baseline" && Array.isArray(e.replaces)) for (const id of e.replaces) s.add(id);
    }
    return s;
  }

  // 還在計算中的紀錄（排除被結算取代的）
  function live(entries) {
    const rep = replacedSet(entries);
    return (entries || []).filter((e) => e && !(e.id && rep.has(e.id)));
  }

  function netOf(entries) {
    const net = {};
    for (const e of live(entries)) {
      if (e.voided) continue;
      if (e.type === "debt") addTo(net, e.from, e.to, toInt(e.amount));
      else if (e.type === "repay") addTo(net, e.from, e.to, -toInt(e.amount));
      else if ((e.type === "offset" || e.type === "baseline") && Array.isArray(e.items)) {
        for (const it of e.items) addTo(net, it.from, it.to, toInt(it.amount));
      }
    }
    return net;
  }

  function sortEdges(list) {
    return list.sort(
      (x, y) => y.amount - x.amount || (x.from + x.to < y.from + y.to ? -1 : 1)
    );
  }

  // 淨額表 → 欠款清單 [{from, to, amount}]，amount 一定 > 0
  function edgesFromNet(net) {
    const out = [];
    for (const k in net) {
      const v = net[k];
      if (!v) continue;
      const [a, b] = k.split("|");
      out.push(v > 0 ? { from: a, to: b, amount: v } : { from: b, to: a, amount: -v });
    }
    return sortEdges(out);
  }

  function netFromEdges(edges) {
    const net = {};
    for (const e of edges) addTo(net, e.from, e.to, e.amount);
    return net;
  }

  // 每兩人之間目前的淨欠款
  function pairwise(entries) {
    return edgesFromNet(netOf(entries));
  }

  // 每個人的淨額：> 0 應收（別人欠他），< 0 應付（他欠別人）
  function balances(edges) {
    const bal = {};
    for (const e of edges) {
      bal[e.from] = (bal[e.from] || 0) - e.amount;
      bal[e.to] = (bal[e.to] || 0) + e.amount;
    }
    return bal;
  }

  // 貪婪配對：欠最多的人先還給被欠最多的人。最多 n-1 筆轉帳。
  // 同時處理「循環互欠」與「債權轉移」。
  function simplify(bal) {
    const creditors = [];
    const debtors = [];
    for (const id in bal) {
      if (bal[id] > 0) creditors.push({ id, left: bal[id] });
      else if (bal[id] < 0) debtors.push({ id, left: -bal[id] });
    }
    const byLeft = (x, y) => y.left - x.left || (x.id < y.id ? -1 : 1);
    creditors.sort(byLeft);
    debtors.sort(byLeft);
    const out = [];
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const d = debtors[i];
      const c = creditors[j];
      const x = Math.min(d.left, c.left);
      if (x > 0) out.push({ from: d.id, to: c.id, amount: x });
      d.left -= x;
      c.left -= x;
      if (d.left === 0) i++;
      if (c.left === 0) j++;
    }
    return sortEdges(out);
  }

  // 要寫進 offset 的調整項：讓「目前」變成「目標」
  function offsetItems(current, target) {
    const a = netFromEdges(current);
    const b = netFromEdges(target);
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    const items = [];
    for (const k of keys) {
      const delta = (b[k] || 0) - (a[k] || 0);
      if (!delta) continue;
      const [x, y] = k.split("|");
      items.push(delta > 0 ? { from: x, to: y, amount: delta } : { from: y, to: x, amount: -delta });
    }
    return sortEdges(items);
  }

  function totalFlow(edges) {
    let s = 0;
    for (const e of edges) s += e.amount;
    return s;
  }

  // 抵銷計畫：目前、抵銷後、要寫入的調整、省下多少
  function plan(entries) {
    const current = pairwise(entries);
    const target = simplify(balances(current));
    const items = offsetItems(current, target);
    const savedCount = current.length - target.length;
    const savedFlow = totalFlow(current) - totalFlow(target);
    return {
      current,
      target,
      items,
      savedCount,
      savedFlow,
      useful: items.length > 0 && (savedCount > 0 || savedFlow > 0),
    };
  }

  // 抵銷滿 3 天後的整理計畫：把那次抵銷和之前的紀錄換成一筆結算。
  // 回傳 null 表示不用整理。
  function compactionPlan(entries, now, after) {
    const wait = after == null ? COMPACT_AFTER : after;
    const all = (entries || []).filter((e) => e && e.id);
    const L = live(all);
    let X = null;
    for (const e of L) {
      if (e.type !== "offset" || e.voided) continue;
      if (now - (e.createdAt || 0) < wait) continue;
      if (!X || e.createdAt > X.createdAt || (e.createdAt === X.createdAt && e.id > X.id)) X = e;
    }
    if (!X) return null;
    const old = L.filter((e) => (e.createdAt || 0) <= X.createdAt);
    const existing = new Set(all.map((e) => e.id));
    const replaces = new Set(old.map((e) => e.id));
    // 舊結算取代的紀錄如果還沒刪掉，要一起帶過來，否則舊結算刪掉後它們會復活
    for (const e of old) {
      if (e.type === "baseline" && Array.isArray(e.replaces)) {
        for (const id of e.replaces) if (existing.has(id)) replaces.add(id);
      }
    }
    const items = pairwise(old);
    return {
      id: "base-" + X.id,
      doc: {
        type: "baseline",
        items,
        replaces: Array.from(replaces).sort(),
        asOf: X.createdAt,
        createdAt: X.createdAt,
        offsetId: X.id,
        voided: false,
      },
    };
  }

  // 已經被結算取代、但文件還在的紀錄 id（可以安全刪掉）
  function staleIds(entries) {
    const rep = replacedSet(entries);
    return (entries || []).filter((e) => e && e.id && rep.has(e.id)).map((e) => e.id);
  }

  // 兩人之間還沒還的項目：依時間先進先出，用還款與反向金額抵掉最早的欠款。
  // 回傳 { from, to, items:[{entryId, note, createdAt, original, remaining, source}] }，
  // items 加總等於 from 欠 to 的淨額；沒有欠款時 items 為空、from/to 為 null。
  function openItems(entries, a, b) {
    const ev = [];
    for (const e of live(entries)) {
      if (e.voided) continue;
      const t = e.createdAt || 0;
      if (e.type === "debt" || e.type === "repay") {
        let s = 0;
        if (e.from === a && e.to === b) s = 1;
        else if (e.from === b && e.to === a) s = -1;
        else continue;
        if (e.type === "repay") s = -s;
        const v = s * toInt(e.amount);
        if (v) ev.push({ t, id: e.id, v, note: e.note || "", source: e.type });
      } else if ((e.type === "offset" || e.type === "baseline") && Array.isArray(e.items)) {
        let v = 0;
        for (const it of e.items) {
          if (it.from === a && it.to === b) v += toInt(it.amount);
          else if (it.from === b && it.to === a) v -= toInt(it.amount);
        }
        if (v) ev.push({ t, id: e.id, v, note: "", source: e.type });
      }
    }
    ev.sort((x, y) => x.t - y.t || (String(x.id) < String(y.id) ? -1 : 1));
    const queue = [];
    for (const x of ev) {
      const sign = x.v > 0 ? 1 : -1;
      let left = Math.abs(x.v);
      while (left > 0 && queue.length && queue[0].sign !== sign) {
        const head = queue[0];
        const take = Math.min(left, head.remaining);
        head.remaining -= take;
        left -= take;
        if (head.remaining === 0) queue.shift();
      }
      if (left > 0) {
        queue.push({ entryId: x.id, note: x.note, createdAt: x.t, original: Math.abs(x.v), remaining: left, source: x.source, sign });
      }
    }
    if (!queue.length) return { from: null, to: null, items: [] };
    const pos = queue[0].sign > 0;
    return {
      from: pos ? a : b,
      to: pos ? b : a,
      items: queue.map(({ sign, ...rest }) => rest),
    };
  }

  const Ledger = {
    DAY, COMPACT_AFTER,
    pairwise, balances, simplify, offsetItems, totalFlow, plan, netOf, edgesFromNet,
    live, replacedSet, compactionPlan, staleIds, openItems,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Ledger;
  else root.Ledger = Ledger;
})(typeof globalThis !== "undefined" ? globalThis : this);
