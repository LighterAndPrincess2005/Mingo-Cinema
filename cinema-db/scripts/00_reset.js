// Xóa DUY NHẤT database QLDatVeXemPhim. Không chạy trong run_all, chỉ chạy khi cần làm lại từ đầu.
(function () {
  const name = 'QLDatVeXemPhim';
  const result = db.getSiblingDB(name).dropDatabase();
  print(`[00] Đã xóa database ${name}:`, JSON.stringify(result));
})();
