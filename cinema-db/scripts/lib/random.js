// PRNG có seed cố định (mulberry32): chạy lại cho cùng phân bố dữ liệu.
(function () {
  globalThis.createRandom = function createRandom(seed) {
    let state = seed >>> 0;
    function next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    const int = (min, max) => min + Math.floor(next() * (max - min + 1));
    const pick = (list) => list[int(0, list.length - 1)];
    const chance = (p) => next() < p;
    function sample(list, count) {
      const copy = list.slice();
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = int(0, i);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy.slice(0, count);
    }
    return { next, int, pick, chance, sample };
  };
})();
