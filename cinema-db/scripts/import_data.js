// Nhập database từ thư mục database/, gồm cả validator và index.
// Chạy từ thư mục gốc của dự án: mongosh --quiet --file scripts/import_data.js
// Mặc định nhập vào QLDatVeXemPhim. Đổi tên bằng biến môi trường TARGET_DB.
// Từ chối chạy khi database đích đã có collection, để không ghi đè dữ liệu.
(function () {
  const fs = require('fs');
  const target = process.env.TARGET_DB || 'QLDatVeXemPhim';
  const d = db.getSiblingDB(target);
  const dir = 'database';

  if (d.getCollectionNames().length > 0) {
    throw new Error(`Database ${target} đã có dữ liệu. Chạy scripts/00_reset.js trước nếu muốn nhập lại.`);
  }

  const schema = EJSON.parse(fs.readFileSync(`${dir}/_schema.json`, 'utf8'), { relaxed: false });
  const names = Object.keys(schema);
  let total = 0;
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    d.createCollection(name, schema[name].options);

    const text = fs.readFileSync(`${dir}/${name}.jsonl`, 'utf8');
    const lines = text.split('\n').filter((line) => line.length > 0);
    for (let start = 0; start < lines.length; start += 500) {
      const docs = lines.slice(start, start + 500).map((line) => EJSON.parse(line, { relaxed: false }));
      d.getCollection(name).insertMany(docs);
    }
    total += lines.length;

    const indexes = schema[name].indexes.map((ix) => {
      const copy = { ...ix };
      delete copy.v;
      delete copy.ns;
      return copy;
    });
    if (indexes.length) d.runCommand({ createIndexes: name, indexes });
  }
  print(`Đã nhập ${names.length} collection, ${total} document vào ${target}.`);
})();
