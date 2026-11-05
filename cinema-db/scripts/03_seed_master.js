// Dữ liệu danh mục. Tên phim, tên người, tên rạp đều hư cấu; email dùng example.com.
(function () {
  load('scripts/lib/random.js');
  const d = db.getSiblingDB('QLDatVeXemPhim');
  if (d.users.countDocuments() > 0) {
    throw new Error('Database đã có dữ liệu. Chạy scripts/00_reset.js trước khi seed lại.');
  }

  const r = createRandom(20261105);
  const now = new Date();
  const DAY = 86400000;
  const daysFromNow = (n) => new Date(now.getTime() + n * DAY);

  const slugify = (text) => text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương'];
  const MIDDLE = ['Văn', 'Thị', 'Minh', 'Thanh', 'Quốc', 'Hải', 'Ngọc', 'Gia', 'Bảo', 'Khánh', 'Đức', 'Mai'];
  const GIVEN = ['An', 'Bình', 'Châu', 'Dũng', 'Giang', 'Hà', 'Hùng', 'Khoa', 'Lan', 'Linh', 'Long', 'My', 'Nam', 'Nga', 'Phong', 'Phúc', 'Quân', 'Quỳnh', 'Sơn', 'Tâm', 'Thảo', 'Trang', 'Tú', 'Vy', 'Yến'];

  function uniqueNames(count) {
    const names = new Set();
    while (names.size < count) names.add(`${r.pick(FAMILY)} ${r.pick(MIDDLE)} ${r.pick(GIVEN)}`);
    return [...names];
  }

  // Nhóm 1: hạng thành viên
  const tiers = [
    { code: 'MEMBER', name: 'Thành viên', rank: 1, minSpend: 0, pointMultiplier: 1, benefits: ['Tích điểm cơ bản'] },
    { code: 'SILVER', name: 'Bạc', rank: 2, minSpend: 2500000, pointMultiplier: 1.2, benefits: ['Tích điểm x1,2', 'Ưu đãi sinh nhật'] },
    { code: 'GOLD', name: 'Vàng', rank: 3, minSpend: 4000000, pointMultiplier: 1.5, benefits: ['Tích điểm x1,5', 'Ưu đãi sinh nhật', 'Mã giảm giá riêng'] },
    { code: 'PLATINUM', name: 'Bạch kim', rank: 4, minSpend: 5500000, pointMultiplier: 2, benefits: ['Tích điểm x2', 'Ưu đãi sinh nhật', 'Mã giảm giá riêng', 'Lối vào ưu tiên'] },
  ];
  d.membership_tiers.insertMany(tiers);
  const baseTier = d.membership_tiers.findOne({ code: 'MEMBER' });

  const userNames = [];
  while (userNames.length < 200) userNames.push(`${r.pick(FAMILY)} ${r.pick(MIDDLE)} ${r.pick(GIVEN)}`);
  const users = userNames.map((fullName, i) => ({
    fullName,
    email: `khach${String(i + 1).padStart(3, '0')}@example.com`,
    phone: `09${String(10000000 + i).padStart(8, '0')}`,
    passwordHash: 'seed-data-not-a-real-hash',
    dateOfBirth: new Date(Date.UTC(r.int(1975, 2008), r.int(0, 11), r.int(1, 28))),
    tierId: baseTier._id,
    pointsBalance: 0,
    lifetimeSpend: 0,
    status: i % 50 === 49 ? 'locked' : 'active',
    createdAt: daysFromNow(-r.int(40, 400)),
  }));
  d.users.insertMany(users);

  // Nhóm 2: thể loại, người tham gia, phim
  const genreNames = ['Hành động', 'Phiêu lưu', 'Hoạt hình', 'Hài', 'Tội phạm', 'Tài liệu', 'Chính kịch', 'Gia đình', 'Giả tưởng', 'Kinh dị', 'Lãng mạn', 'Khoa học viễn tưởng'];
  d.genres.insertMany(genreNames.map((name) => ({ name, slug: slugify(name) })));
  const genres = d.genres.find().toArray();

  const NATIONS = ['Việt Nam', 'Việt Nam', 'Việt Nam', 'Hàn Quốc', 'Nhật Bản', 'Pháp', 'Mỹ'];
  d.people.insertMany(uniqueNames(80).map((fullName) => ({
    fullName, nationality: r.pick(NATIONS), birthYear: r.int(1955, 2002),
    bio: 'Hồ sơ hư cấu phục vụ dữ liệu mẫu.',
  })));
  const people = d.people.find().toArray();

  const TITLES = [
    'Chuyến Tàu Cuối Mùa Mưa', 'Bến Đợi Sao Băng', 'Thành Phố Không Ngủ', 'Mật Mã Sông Hồng', 'Tiếng Vọng Từ Đáy Biển',
    'Người Gác Hải Đăng', 'Bầu Trời Tháng Chạp', 'Đêm Trắng Sài Gòn', 'Vệt Sáng Cuối Đường', 'Hẻm Nhỏ Có Mèo',
    'Cuộc Đua Trên Mây', 'Biệt Đội Cánh Diều', 'Ngôi Nhà Số 13', 'Khu Vườn Thủy Tinh', 'Nhịp Tim Sa Mạc',
    'Lời Hứa Trên Đảo', 'Hành Tinh Mùa Thu', 'Kẻ Trộm Ký Ức', 'Phiên Chợ Nửa Đêm', 'Bản Giao Hưởng Gió',
    'Vương Quốc Bánh Mì', 'Chú Rồng Đi Lạc', 'Tầng Hầm Im Lặng', 'Dòng Sông Ngược', 'Mùa Hạ Không Tên',
    'Ánh Trăng Trên Núi', 'Vũ Điệu Lửa', 'Trạm Vũ Trụ Số 7', 'Lá Thư Năm Ấy', 'Chiếc Ô Màu Đỏ',
  ];
  const RATINGS = ['P', 'K', 'T13', 'T13', 'T16', 'T16', 'T18'];
  const movies = TITLES.map((title, i) => {
    let status = 'now_showing';
    let releaseDate = daysFromNow(-r.int(32, 60));
    if (i >= 18 && i < 24) {
      status = 'coming_soon';
      releaseDate = daysFromNow(r.int(10, 60));
    } else if (i >= 24) {
      status = 'ended';
      releaseDate = daysFromNow(-r.int(120, 300));
    }
    const crew = r.sample(people, 5);
    const credits = [
      { personId: crew[0]._id, name: crew[0].fullName, role: 'director' },
      { personId: crew[1]._id, name: crew[1].fullName, role: 'writer' },
    ];
    for (let c = 2; c < crew.length; c += 1) {
      credits.push({ personId: crew[c]._id, name: crew[c].fullName, role: 'actor', character: `Nhân vật ${c - 1}` });
    }
    const formats = ['2D'];
    if (i % 2 === 0) formats.push('3D');
    if (i % 3 === 0) formats.push('IMAX');
    return {
      title, slug: slugify(title),
      genreIds: r.sample(genres, r.int(1, 3)).map((g) => g._id),
      credits, durationMin: r.int(85, 170), ageRating: r.pick(RATINGS), formats,
      language: 'Tiếng Việt', releaseDate, status,
      synopsis: `Nội dung hư cấu của phim ${title}, phục vụ dữ liệu mẫu.`,
      ratingSummary: { avg: 0, count: 0 },
    };
  });
  d.movies.insertMany(movies);

  // Nhóm 3: loại ghế, rạp, phòng, nhân viên
  d.seat_types.insertMany([
    { code: 'STANDARD', name: 'Ghế thường', personsPerSeat: 1 },
    { code: 'VIP', name: 'Ghế VIP', personsPerSeat: 1 },
    { code: 'COUPLE', name: 'Ghế đôi', personsPerSeat: 2 },
  ]);
  const standard = d.seat_types.findOne({ code: 'STANDARD' });
  const vip = d.seat_types.findOne({ code: 'VIP' });
  const couple = d.seat_types.findOne({ code: 'COUPLE' });

  const cinemaSeed = [
    ['HN01', 'Sen Vàng Cinema Hoàn Kiếm', 'Hà Nội', '12 phố Mẫu, Hoàn Kiếm', [105.8522, 21.0285], '3D'],
    ['HN02', 'Sen Vàng Cinema Cầu Giấy', 'Hà Nội', '88 đường Mẫu, Cầu Giấy', [105.7938, 21.0362], 'IMAX'],
    ['SG01', 'Sen Vàng Cinema Quận 1', 'TP. Hồ Chí Minh', '25 đường Mẫu, Quận 1', [106.7009, 10.7769], 'IMAX'],
    ['SG02', 'Sen Vàng Cinema Thủ Đức', 'TP. Hồ Chí Minh', '140 đường Mẫu, Thủ Đức', [106.7621, 10.8494], '3D'],
    ['DN01', 'Sen Vàng Cinema Hải Châu', 'Đà Nẵng', '56 đường Mẫu, Hải Châu', [108.2208, 16.0678], '3D'],
  ];
  d.cinemas.insertMany(cinemaSeed.map(([code, name, city, address, coordinates], i) => ({
    code, name, city, address, location: { type: 'Point', coordinates },
    phone: `028000000${i + 1}`, openTime: '08:30', closeTime: '23:59', status: 'active',
  })));

  const rows = [
    ...['A', 'B', 'C', 'D', 'E'].map((row) => ({ row, seatCount: 12, seatTypeId: standard._id })),
    ...['F', 'G'].map((row) => ({ row, seatCount: 12, seatTypeId: vip._id })),
    { row: 'H', seatCount: 6, seatTypeId: couple._id },
  ];
  const capacity = rows.reduce((sum, row) => sum + row.seatCount, 0);

  const POSITIONS = [
    ['manager', ['ticket_check', 'refund_approve', 'showtime_manage', 'sell_counter']],
    ['cashier', ['sell_counter']], ['cashier', ['sell_counter']],
    ['ticket_checker', ['ticket_check']], ['ticket_checker', ['ticket_check']], ['ticket_checker', ['ticket_check']],
  ];
  const staffNames = uniqueNames(30);
  let staffNo = 0;
  for (let i = 0; i < cinemaSeed.length; i += 1) {
    const cinema = d.cinemas.findOne({ code: cinemaSeed[i][0] });
    d.rooms.insertMany([
      { cinemaId: cinema._id, name: 'Phòng 1', format: '2D', seatMap: rows, capacity, status: 'active' },
      { cinemaId: cinema._id, name: 'Phòng 2', format: '2D', seatMap: rows, capacity, status: 'active' },
      { cinemaId: cinema._id, name: 'Phòng 3', format: cinemaSeed[i][5], seatMap: rows, capacity, status: 'active' },
    ]);
    for (let p = 0; p < POSITIONS.length; p += 1) {
      staffNo += 1;
      d.staff.insertOne({
        cinemaId: cinema._id, fullName: staffNames[staffNo - 1],
        email: `nhanvien${String(staffNo).padStart(2, '0')}@example.com`,
        position: POSITIONS[p][0], permissions: POSITIONS[p][1], status: 'active',
        hiredAt: daysFromNow(-r.int(200, 900)),
      });
    }
  }

  // Nhóm 4: quy tắc giá. priority cao hơn được ưu tiên.
  const validFrom = daysFromNow(-120);
  const base = {
    '2D': [85000, 105000, 190000], '3D': [105000, 125000, 230000], IMAX: [150000, 175000, 320000],
  };
  const seatTypes = [standard, vip, couple];
  const priceRules = [];
  Object.keys(base).forEach((format) => {
    seatTypes.forEach((seatType, i) => priceRules.push({
      name: `Giá gốc ${format} ${seatType.code}`, format, seatTypeId: seatType._id, dayType: 'all',
      timeFrom: '00:00', timeTo: '23:59', price: base[format][i], priority: 10, validFrom, status: 'active',
    }));
  });
  priceRules.push(
    { name: 'Cuối tuần 2D thường', format: '2D', seatTypeId: standard._id, dayType: 'weekend', timeFrom: '00:00', timeTo: '23:59', price: 100000, priority: 20, validFrom, status: 'active' },
    { name: 'Cuối tuần 2D VIP', format: '2D', seatTypeId: vip._id, dayType: 'weekend', timeFrom: '00:00', timeTo: '23:59', price: 120000, priority: 20, validFrom, status: 'active' },
    { name: 'Suất sớm ngày thường 2D', format: '2D', seatTypeId: standard._id, dayType: 'weekday', timeFrom: '00:00', timeTo: '11:59', price: 70000, priority: 30, validFrom, status: 'active' },
    { name: 'Giá riêng Đà Nẵng 2D ngày thường', format: '2D', seatTypeId: standard._id, dayType: 'weekday', timeFrom: '12:00', timeTo: '23:59', cinemaId: d.cinemas.findOne({ code: 'DN01' })._id, price: 75000, priority: 40, validFrom, status: 'active' },
  );
  d.price_rules.insertMany(priceRules);

  // Nhóm 6: bắp nước và khuyến mãi
  const singles = [
    ['Bắp rang bơ nhỏ', 45000], ['Bắp rang bơ vừa', 55000], ['Bắp rang bơ lớn', 65000], ['Bắp caramel vừa', 62000],
    ['Nước ngọt nhỏ', 30000], ['Nước ngọt vừa', 35000], ['Nước ngọt lớn', 40000], ['Nước suối', 20000],
    ['Hotdog', 45000], ['Nachos phô mai', 60000], ['Khoai tây lắc', 50000],
  ];
  d.concession_items.insertMany(singles.map(([name, price]) => ({
    name, type: 'single', components: [], price, status: 'active',
  })));
  const item = (name) => d.concession_items.findOne({ name })._id;
  d.concession_items.insertMany([
    { name: 'Combo Solo', type: 'combo', components: [{ itemId: item('Bắp rang bơ vừa'), quantity: 1 }, { itemId: item('Nước ngọt vừa'), quantity: 1 }], price: 79000, status: 'active' },
    { name: 'Combo Đôi', type: 'combo', components: [{ itemId: item('Bắp rang bơ lớn'), quantity: 1 }, { itemId: item('Nước ngọt vừa'), quantity: 2 }], price: 109000, status: 'active' },
    { name: 'Combo Gia Đình', type: 'combo', components: [{ itemId: item('Bắp rang bơ lớn'), quantity: 2 }, { itemId: item('Nước ngọt lớn'), quantity: 4 }], price: 219000, status: 'active' },
    { name: 'Combo Snack', type: 'combo', components: [{ itemId: item('Nachos phô mai'), quantity: 1 }, { itemId: item('Hotdog'), quantity: 1 }, { itemId: item('Nước ngọt vừa'), quantity: 1 }], price: 125000, status: 'active' },
  ]);

  const window = { startAt: daysFromNow(-60), endAt: daysFromNow(30), status: 'active', usedCount: 0 };
  d.promotions.insertMany([
    { ...window, code: 'WELCOME50', name: 'Giảm 50.000đ đơn đầu', discountType: 'fixed', discountValue: 50000, minOrder: 150000, maxUses: 1000, perUserLimit: 1 },
    { ...window, code: 'WEEKDAY20', name: 'Giảm 20% ngày thường', discountType: 'percent', discountValue: 20, maxDiscount: 60000, minOrder: 100000, maxUses: 1000, perUserLimit: 5, conditions: { daysOfWeek: [1, 2, 3, 4] } },
    { ...window, code: 'COMBO30K', name: 'Giảm 30.000đ đơn lớn', discountType: 'fixed', discountValue: 30000, minOrder: 250000, maxUses: 500, perUserLimit: 3 },
    { ...window, code: 'IMAX15', name: 'Giảm 15% suất IMAX', discountType: 'percent', discountValue: 15, maxDiscount: 80000, minOrder: 150000, maxUses: 300, perUserLimit: 3, conditions: { formats: ['IMAX'] } },
    { ...window, code: 'GOLD10', name: 'Giảm 10% hạng Vàng trở lên', discountType: 'percent', discountValue: 10, maxDiscount: 100000, minOrder: 100000, maxUses: 1000, perUserLimit: 10, conditions: { tierCodes: ['GOLD', 'PLATINUM'] } },
    { ...window, code: 'FLASH100', name: 'Flash sale giảm 100.000đ', discountType: 'fixed', discountValue: 100000, minOrder: 200000, maxUses: 40, perUserLimit: 1 },
  ]);

  print(`[03] Đã seed danh mục: ${d.users.countDocuments()} users, ${d.movies.countDocuments()} movies, ${d.rooms.countDocuments()} rooms, ${d.staff.countDocuments()} staff.`);
})();
