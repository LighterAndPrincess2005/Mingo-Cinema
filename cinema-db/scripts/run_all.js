// Chạy từ thư mục cinema-db: mongosh --quiet --file scripts/run_all.js
// Script seed từ chối chạy khi database đã có dữ liệu. Muốn làm lại thì chạy 00_reset.js trước.
(function () {
  const steps = [
    'scripts/01_create_collections.js',
    'scripts/02_create_indexes.js',
    'scripts/03_seed_master.js',
    'scripts/04_seed_transactions.js',
    'scripts/06_verify.js',
  ];
  for (let i = 0; i < steps.length; i += 1) load(steps[i]);
})();
