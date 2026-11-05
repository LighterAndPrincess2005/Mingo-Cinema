// Xuất toàn bộ QLDatVeXemPhim ra thư mục database/, không cần mongodump.
// Mỗi collection một file .jsonl (Extended JSON, giữ đúng ObjectId, Date, kiểu số).
// _schema.json giữ validator và index để nhập lại đúng nguyên trạng.
(function () {
  const fs = require('fs');
  const d = db.getSiblingDB('QLDatVeXemPhim');
  const dir = 'database';
  fs.mkdirSync(dir, { recursive: true });

  const names = d.getCollectionNames().filter((n) => !n.startsWith('system.')).sort();
  const schema = {};
  let total = 0;
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const info = d.getCollectionInfos({ name })[0];
    schema[name] = {
      options: info.options,
      indexes: d.getCollection(name).getIndexes().filter((ix) => ix.name !== '_id_'),
    };
    const docs = d.getCollection(name).find().sort({ _id: 1 }).toArray();
    const lines = [];
    for (let j = 0; j < docs.length; j += 1) lines.push(EJSON.stringify(docs[j], { relaxed: false }));
    fs.writeFileSync(`${dir}/${name}.jsonl`, lines.length ? `${lines.join('\n')}\n` : '');
    total += docs.length;
  }
  fs.writeFileSync(`${dir}/_schema.json`, EJSON.stringify(schema, null, 2, { relaxed: false }));
  print(`Đã xuất ${names.length} collection, ${total} document vào ${dir}/.`);
})();
