// Tự kiểm tra database. Dữ liệu thử dùng user, phim, mã riêng và được dọn sạch cuối script.
(function () {
  load('scripts/lib/flows.js');
  const d = db.getSiblingDB('QLDatVeXemPhim');
  const now = new Date();
  const MIN = 60000;
  const DAY = 86400000;
  const addMs = (date, ms) => new Date(date.getTime() + ms);
  let passed = 0;
  const failures = [];

  function check(name, ok, detail) {
    if (ok) {
      passed += 1;
      print(`PASS  ${name}`);
    } else {
      failures.push(name);
      print(`FAIL  ${name}${detail === undefined ? '' : ` -> ${JSON.stringify(detail)}`}`);
    }
  }

  function expectError(name, code, fn) {
    let got = 'NO_ERROR';
    try {
      fn();
    } catch (error) {
      got = error.bizCode || `code:${error.code}:${error.message}`;
    }
    check(name, got === code, { expected: code, got });
  }

  // ---------- 1. Cấu trúc ----------
  // Phim từ NguonC bổ sung ê-kíp và thể loại, vẫn giữ các document mẫu ban đầu.
  const importedMovies = d.movies.find({ 'media.provider': 'NguonC' }).toArray();
  const importedPeople = new Set(importedMovies.flatMap(movie => movie.credits.map(credit => credit.name))).size;
  const importedGenres = d.movies.distinct('genreIds', { 'media.provider': 'NguonC' }).length;
  const ranges = {
    users: [200, 200], membership_tiers: [4, 4], loyalty_transactions: [2000, 5000],
    genres: [12, 12 + importedGenres], people: [80, 80 + importedPeople], movies: [30, 30], reviews: [500, 700],
    cinemas: [5, 5], rooms: [15, 15], seat_types: [3, 3], staff: [30, 30],
    showtimes: [1000, 1300], price_rules: [10, 15],
    bookings: [2500, 3500], tickets: [5000, 7500], payments: [2500, 3500], refunds: [100, 250],
    concession_items: [15, 15], promotions: [6, 6], promotion_redemptions: [150, 500],
  };
  const infos = d.getCollectionInfos();
  check('Đủ 20 collection', infos.length === 20, infos.length);
  const names = Object.keys(ranges);
  for (const name of names) {
    const info = infos.find((c) => c.name === name);
    const total = d.getCollection(name).countDocuments();
    check(`${name}: có validator strict/error`, Boolean(
      info && info.options.validator && info.options.validationLevel === 'strict' && info.options.validationAction === 'error',
    ));
    check(`${name}: số lượng ${total} trong khoảng`, total >= ranges[name][0] && total <= ranges[name][1]);
  }

  // Mỗi collection: lấy một document thật, đổi một trường sang giá trị sai, phải bị từ chối (mã 121).
  const invalid = {
    users: { email: 'khong-phai-email' }, membership_tiers: { pointMultiplier: 0 },
    loyalty_transactions: { type: 'bonus' }, genres: { slug: 'Có Dấu' }, people: { birthYear: 1500 },
    movies: { ageRating: 'R' }, reviews: { rating: 11 }, cinemas: { openTime: '25:00' },
    rooms: { format: '4DX' }, seat_types: { personsPerSeat: 3 }, staff: { position: 'ceo' },
    showtimes: { language: 'mute' }, price_rules: { price: -1 }, bookings: { totalAmount: 1.5 },
    tickets: { status: 'lost' }, payments: { method: 'cash' }, refunds: { ticketIds: [] },
    concession_items: { type: 'gift' }, promotions: { discountType: 'free' },
    promotion_redemptions: { useNo: 0 },
  };
  for (const name of names) {
    const coll = d.getCollection(name);
    const bad = { ...coll.findOne(), ...invalid[name], _id: new ObjectId() };
    let code = 'NO_ERROR';
    try {
      coll.insertOne(bad);
      coll.deleteOne({ _id: bad._id });
    } catch (error) {
      code = error.code;
    }
    check(`${name}: validator từ chối ${Object.keys(invalid[name])[0]} sai`, code === 121, code);
  }
  let extraField = 'NO_ERROR';
  try {
    d.genres.insertOne({ name: 'Thử', slug: 'thu', typo: true });
    d.genres.deleteOne({ slug: 'thu' });
  } catch (error) {
    extraField = error.code;
  }
  check('Validator từ chối trường lạ', extraField === 121, extraField);

  // ---------- 2. Tham chiếu ----------
  const refs = [
    ['users', 'tierId', 'membership_tiers'], ['loyalty_transactions', 'userId', 'users'],
    ['movies', 'genreIds', 'genres'], ['movies', 'credits.personId', 'people'],
    ['reviews', 'movieId', 'movies'], ['reviews', 'userId', 'users'], ['reviews', 'ticketId', 'tickets'],
    ['rooms', 'cinemaId', 'cinemas'], ['rooms', 'seatMap.seatTypeId', 'seat_types'], ['staff', 'cinemaId', 'cinemas'],
    ['showtimes', 'movieId', 'movies'], ['showtimes', 'cinemaId', 'cinemas'], ['showtimes', 'roomId', 'rooms'],
    ['showtimes', 'seats.seatTypeId', 'seat_types'], ['showtimes', 'seats.bookingId', 'bookings'],
    ['price_rules', 'seatTypeId', 'seat_types'], ['price_rules', 'cinemaId', 'cinemas'],
    ['bookings', 'userId', 'users'], ['bookings', 'showtimeId', 'showtimes'],
    ['bookings', 'concessions.itemId', 'concession_items'], ['bookings', 'promotionId', 'promotions'],
    ['tickets', 'bookingId', 'bookings'], ['tickets', 'showtimeId', 'showtimes'], ['tickets', 'movieId', 'movies'],
    ['tickets', 'userId', 'users'], ['tickets', 'seatTypeId', 'seat_types'], ['tickets', 'checkedInBy', 'staff'],
    ['tickets', 'refundId', 'refunds'], ['payments', 'bookingId', 'bookings'], ['payments', 'userId', 'users'],
    ['refunds', 'paymentId', 'payments'], ['refunds', 'bookingId', 'bookings'], ['refunds', 'userId', 'users'],
    ['refunds', 'ticketIds', 'tickets'], ['refunds', 'approvedBy', 'staff'],
    ['concession_items', 'components.itemId', 'concession_items'],
    ['promotion_redemptions', 'promotionId', 'promotions'], ['promotion_redemptions', 'userId', 'users'],
    ['promotion_redemptions', 'bookingId', 'bookings'],
  ];
  for (const [from, field, to] of refs) {
    const values = d.getCollection(from).distinct(field);
    const found = d.getCollection(to).countDocuments({ _id: { $in: values } });
    check(`Tham chiếu ${from}.${field} -> ${to}`, found === values.length, { values: values.length, found });
  }

  // ---------- 3. Đồng bộ giữa các collection ----------
  function seatKeys(status) {
    const rows = d.showtimes.aggregate([
      { $unwind: '$seats' },
      { $match: { 'seats.status': status } },
      { $project: { _id: 0, k: { $concat: [{ $toString: '$_id' }, ':', '$seats.code'] } } },
    ]).toArray();
    return new Set(rows.map((row) => row.k));
  }

  const booked = seatKeys('booked');
  const liveTickets = d.tickets.find({ status: { $in: ['active', 'used'] } }, { showtimeId: 1, seatCode: 1 }).toArray()
    .map((t) => `${t.showtimeId.toHexString()}:${t.seatCode}`);
  check(
    'Ghế booked khớp từng vé còn hiệu lực',
    booked.size === liveTickets.length && liveTickets.every((k) => booked.has(k)),
    { seats: booked.size, tickets: liveTickets.length },
  );

  const held = seatKeys('held');
  const pendingSeats = [];
  for (const b of d.bookings.find({ status: 'pending' }).toArray()) {
    for (const code of b.seatCodes) pendingSeats.push(`${b.showtimeId.toHexString()}:${code}`);
  }
  check(
    'Ghế held khớp đơn pending',
    held.size === pendingSeats.length && pendingSeats.every((k) => held.has(k)),
    { seats: held.size, pending: pendingSeats.length },
  );

  function count(coll, pipeline) {
    const row = d.getCollection(coll).aggregate([...pipeline, { $count: 'n' }]).toArray()[0];
    return row ? row.n : 0;
  }
  const PAID = ['paid', 'partially_refunded', 'refunded'];

  check('Công thức tiền của đơn đúng', count('bookings', [{
    $match: {
      $expr: {
        $or: [
          { $ne: ['$subtotal', { $add: ['$ticketAmount', '$concessionAmount'] }] },
          { $ne: ['$concessionAmount', { $sum: '$concessions.lineTotal' }] },
          { $ne: ['$totalAmount', { $subtract: ['$subtotal', { $add: ['$discountAmount', '$pointsDiscount'] }] }] },
          { $ne: ['$pointsDiscount', { $multiply: ['$pointsUsed', flows.config.POINT_VALUE] }] },
        ],
      },
    },
  }]) === 0);

  check('Tổng giá vé khớp ticketAmount', count('bookings', [
    { $match: { status: { $in: PAID } } },
    { $lookup: { from: 'tickets', localField: '_id', foreignField: 'bookingId', as: 't' } },
    {
      $match: {
        $expr: {
          $or: [
            { $ne: ['$ticketAmount', { $sum: '$t.price' }] },
            { $ne: [{ $size: '$t' }, { $size: '$seatCodes' }] },
          ],
        },
      },
    },
  ]) === 0);

  const successPayments = {
    $lookup: {
      from: 'payments', localField: '_id', foreignField: 'bookingId', as: 'p', pipeline: [{ $match: { status: 'success' } }],
    },
  };
  check('Đơn đã trả có đúng 1 payment success bằng tổng tiền', count('bookings', [
    { $match: { status: { $in: PAID } } },
    successPayments,
    { $match: { $expr: { $or: [{ $ne: [{ $size: '$p' }, 1] }, { $ne: [{ $first: '$p.amount' }, '$totalAmount'] }] } } },
  ]) === 0);

  check('Đơn chưa trả không có payment success, không có vé', count('bookings', [
    { $match: { status: { $in: ['pending', 'expired', 'cancelled'] } } },
    successPayments,
    { $lookup: { from: 'tickets', localField: '_id', foreignField: 'bookingId', as: 't' } },
    { $match: { $expr: { $or: [{ $gt: [{ $size: '$p' }, 0] }, { $gt: [{ $size: '$t' }, 0] }] } } },
  ]) === 0);

  check('Tổng hoàn không vượt số đã trả', count('refunds', [
    { $match: { status: 'completed' } },
    { $group: { _id: '$paymentId', total: { $sum: '$amount' } } },
    { $lookup: { from: 'payments', localField: '_id', foreignField: '_id', as: 'p' } },
    { $match: { $expr: { $gt: ['$total', { $first: '$p.amount' }] } } },
  ]) === 0);

  check('Trạng thái đơn khớp vé đã hoàn', count('bookings', [
    { $match: { status: { $in: PAID } } },
    { $lookup: { from: 'tickets', localField: '_id', foreignField: 'bookingId', as: 't' } },
    {
      $project: {
        status: 1,
        n: { $size: '$t' },
        r: { $size: { $filter: { input: '$t', cond: { $eq: ['$$this.status', 'refunded'] } } } },
      },
    },
    {
      $match: {
        $expr: {
          $not: {
            $or: [
              { $and: [{ $eq: ['$status', 'paid'] }, { $eq: ['$r', 0] }] },
              { $and: [{ $eq: ['$status', 'refunded'] }, { $eq: ['$r', '$n'] }] },
              { $and: [{ $eq: ['$status', 'partially_refunded'] }, { $gt: ['$r', 0] }, { $lt: ['$r', '$n'] }] },
            ],
          },
        },
      },
    },
  ]) === 0);

  function sumBy(coll, match, field) {
    const map = {};
    const rows = d.getCollection(coll).aggregate([
      { $match: match },
      { $group: { _id: '$userId', total: { $sum: `$${field}` } } },
    ]).toArray();
    for (const row of rows) map[row._id.toHexString()] = row.total;
    return map;
  }
  const points = sumBy('loyalty_transactions', {}, 'points');
  const paidBy = sumBy('payments', { status: 'success' }, 'amount');
  const refundedBy = sumBy('refunds', { status: 'completed' }, 'amount');
  const tiers = d.membership_tiers.find().sort({ minSpend: -1 }).toArray();
  let badPoints = 0;
  let badSpend = 0;
  let badTier = 0;
  for (const u of d.users.find().toArray()) {
    const key = u._id.toHexString();
    const spend = (paidBy[key] || 0) - (refundedBy[key] || 0);
    if (u.pointsBalance !== (points[key] || 0)) badPoints += 1;
    if (u.lifetimeSpend !== spend) badSpend += 1;
    if (!tiers.find((t) => t.minSpend <= spend)._id.equals(u.tierId)) badTier += 1;
  }
  check('pointsBalance bằng tổng sổ điểm', badPoints === 0, badPoints);
  check('lifetimeSpend bằng thanh toán trừ hoàn tiền', badSpend === 0, badSpend);
  check('Hạng thành viên khớp chi tiêu', badTier === 0, badTier);

  let badPromo = 0;
  for (const p of d.promotions.find().toArray()) {
    const used = d.promotion_redemptions.countDocuments({ promotionId: p._id, status: { $in: ['reserved', 'applied'] } });
    if (used !== p.usedCount || used > p.maxUses) badPromo += 1;
  }
  check('usedCount bằng số redemption, không vượt maxUses', badPromo === 0, badPromo);

  check('Giảm giá trong đơn khớp redemption', count('bookings', [
    { $match: { status: { $in: PAID }, promotionId: { $exists: true } } },
    { $lookup: { from: 'promotion_redemptions', localField: '_id', foreignField: 'bookingId', as: 'r' } },
    {
      $match: {
        $expr: {
          $or: [
            { $ne: [{ $first: '$r.status' }, 'applied'] },
            { $ne: [{ $first: '$r.discountAmount' }, '$discountAmount'] },
          ],
        },
      },
    },
  ]) === 0);

  let badRating = 0;
  for (const m of d.movies.find().toArray()) {
    const rows = d.reviews.find({ movieId: m._id, status: 'visible' }, { rating: 1 }).toArray();
    const avg = rows.length ? Math.round((rows.reduce((s, x) => s + x.rating, 0) / rows.length) * 10) / 10 : 0;
    if (rows.length !== m.ratingSummary.count || avg !== m.ratingSummary.avg) badRating += 1;
  }
  check('ratingSummary khớp reviews', badRating === 0, badRating);

  check('Mọi đánh giá gắn với vé used của đúng người, đúng phim', count('reviews', [
    { $lookup: { from: 'tickets', localField: 'ticketId', foreignField: '_id', as: 't' } },
    {
      $match: {
        $expr: {
          $or: [
            { $ne: [{ $first: '$t.status' }, 'used'] },
            { $ne: [{ $first: '$t.userId' }, '$userId'] },
            { $ne: [{ $first: '$t.movieId' }, '$movieId'] },
          ],
        },
      },
    },
  ]) === 0);

  const schedule = d.showtimes.find({ status: { $ne: 'cancelled' } }, { roomId: 1, startTime: 1, endTime: 1 })
    .sort({ roomId: 1, startTime: 1 }).toArray();
  let overlaps = 0;
  for (let i = 1; i < schedule.length; i += 1) {
    const sameRoom = schedule[i].roomId.equals(schedule[i - 1].roomId);
    const gap = schedule[i].startTime.getTime() - schedule[i - 1].endTime.getTime();
    if (sameRoom && gap < flows.config.CLEANING_MINUTES * MIN) overlaps += 1;
  }
  check('Không phòng nào chồng lịch', overlaps === 0, overlaps);

  // ---------- 4. Hiệu năng ----------
  const usesIndex = (explain) => JSON.stringify(explain.queryPlanner.winningPlan).includes('IXSCAN');
  const sampleBooking = d.bookings.findOne({ status: 'paid' });
  const sampleTicket = d.tickets.findOne();
  const sampleShowtime = d.showtimes.findOne({}, { movieId: 1 });
  check('IXSCAN: Lịch chiếu theo phim', usesIndex(d.showtimes.find({ movieId: sampleShowtime.movieId, startTime: { $gt: now } }).explain()));
  check('IXSCAN: Soát vé theo qrCode', usesIndex(d.tickets.find({ qrCode: sampleTicket.qrCode }).explain()));
  check('IXSCAN: Lịch sử đơn của khách', usesIndex(d.bookings.find({ userId: sampleBooking.userId }).sort({ createdAt: -1 }).explain()));
  check('IXSCAN: Tra đơn theo mã', usesIndex(d.bookings.find({ bookingCode: sampleBooking.bookingCode }).explain()));
  check('IXSCAN: Đơn quá hạn', usesIndex(d.bookings.find({ status: 'pending', expiresAt: { $lte: now } }).explain()));

  // ---------- 5. Ca thử nghiệp vụ trên dữ liệu thử ----------
  const before = {};
  for (const name of names) before[name] = d.getCollection(name).countDocuments();
  const tier = d.membership_tiers.findOne({ code: 'MEMBER' });
  const tag = new ObjectId().toHexString().slice(-6);
  const userIds = [new ObjectId(), new ObjectId()];
  const [userA, userB] = userIds;
  const movieId = new ObjectId();
  const promoId = new ObjectId();
  const promoCode = `VERIFY${tag.toUpperCase()}`;
  const showtimeIds = [];

  function cleanup() {
    const owned = { userId: { $in: userIds } };
    d.tickets.deleteMany(owned);
    d.bookings.deleteMany(owned);
    d.payments.deleteMany(owned);
    d.refunds.deleteMany(owned);
    d.reviews.deleteMany(owned);
    d.promotion_redemptions.deleteMany(owned);
    d.loyalty_transactions.deleteMany(owned);
    d.showtimes.deleteMany({ _id: { $in: showtimeIds } });
    d.movies.deleteOne({ _id: movieId });
    d.promotions.deleteOne({ _id: promoId });
    d.users.deleteMany({ _id: { $in: userIds } });
  }

  try {
    const digits = tag.replace(/[a-f]/g, '1');
    d.users.insertMany(userIds.map((_id, i) => ({
      _id,
      fullName: `Khách thử ${i + 1}`,
      email: `verify-${tag}-${i}@example.com`,
      phone: `08${digits}0${i}`,
      passwordHash: 'seed-data-not-a-real-hash',
      tierId: tier._id,
      pointsBalance: 0,
      lifetimeSpend: 0,
      status: 'active',
      createdAt: now,
    })));
    const genre = d.genres.findOne();
    const person = d.people.findOne();
    d.movies.insertOne({
      _id: movieId,
      title: `Phim thử ${tag}`,
      slug: `phim-thu-${tag}`,
      genreIds: [genre._id],
      credits: [{ personId: person._id, name: person.fullName, role: 'director' }],
      durationMin: 100,
      ageRating: 'P',
      formats: ['2D'],
      language: 'Tiếng Việt',
      releaseDate: addMs(now, -DAY),
      status: 'now_showing',
      synopsis: 'Dữ liệu thử',
      ratingSummary: { avg: 0, count: 0 },
    });
    d.promotions.insertOne({
      _id: promoId,
      code: promoCode,
      name: 'Mã thử',
      discountType: 'fixed',
      discountValue: 10000,
      minOrder: 0,
      maxUses: 1,
      usedCount: 0,
      perUserLimit: 1,
      startAt: addMs(now, -DAY),
      endAt: addMs(now, DAY),
      status: 'active',
    });

    const room = d.rooms.findOne({ format: '2D' });
    const manager = d.staff.findOne({ cinemaId: room.cinemaId, position: 'manager' });
    const checker = d.staff.findOne({ cinemaId: room.cinemaId, position: 'ticket_checker' });
    const cashier = d.staff.findOne({ cinemaId: room.cinemaId, position: 'cashier' });
    const outsider = d.staff.findOne({ cinemaId: { $ne: room.cinemaId }, position: 'ticket_checker' });
    const start = new Date(Math.floor((now.getTime() + 200 * DAY) / MIN) * MIN);
    const showtimeId = flows.createShowtime({ movieId, roomId: room._id, startTime: start });
    showtimeIds.push(showtimeId);
    const seat = (code) => d.showtimes.findOne({ _id: showtimeId }).seats.find((s) => s.code === code);
    let txn = 0;
    function pay(bookingId, at) {
      txn += 1;
      return flows.payBooking({
        bookingId, method: 'momo', transactionRef: `VERIFY-${tag}-${txn}`, idempotencyKey: `verify-${tag}-${txn}`, now: at,
      });
    }

    // Vấn đề 3
    expectError('VĐ3: suất chen vào giữa suất khác bị chặn', 'ROOM_OVERLAP',
      () => flows.createShowtime({ movieId, roomId: room._id, startTime: addMs(start, 30 * MIN) }));
    expectError('VĐ3: suất sát giờ, thiếu 15 phút dọn phòng bị chặn', 'ROOM_OVERLAP',
      () => flows.createShowtime({ movieId, roomId: room._id, startTime: addMs(start, 110 * MIN) }));
    const next = flows.createShowtime({ movieId, roomId: room._id, startTime: addMs(start, 115 * MIN) });
    showtimeIds.push(next);
    check('VĐ3: suất cách đủ 15 phút được tạo', Boolean(next));

    // Vấn đề 1
    const a = flows.createBooking({ userId: userA, showtimeId, seatCodes: ['A01', 'A02'], now });
    expectError('VĐ1: ghế đang giữ không đặt được', 'SEAT_TAKEN',
      () => flows.createBooking({ userId: userB, showtimeId, seatCodes: ['A02', 'A03'], now }));
    check('VĐ1: giữ ghế là tất cả hoặc không', seat('A03').status === 'available');

    // 20 yêu cầu gửi cùng lúc tới server, chỉ một được phép thắng.
    const raceResults = [];
    for (let i = 0; i < 20; i += 1) {
      (async () => flows.holdSeats({
        showtimeId, seatCodes: ['B01'], holdToken: `race-${i}`, holdUntil: addMs(now, 10 * MIN), now,
      }))().then((won) => raceResults.push(won), (error) => raceResults.push(String(error)));
    }
    for (let wait = 0; raceResults.length < 20 && wait < 500; wait += 1) sleep(20);
    const winners = raceResults.filter((x) => x === true).length;
    check('VĐ1: 20 yêu cầu song song, chỉ 1 giữ được ghế', raceResults.length === 20 && winners === 1, raceResults);
    d.showtimes.updateOne(
      { _id: showtimeId },
      {
        $set: { 'seats.$[s].status': 'available' },
        $unset: { 'seats.$[s].holdUntil': '', 'seats.$[s].holdToken': '' },
      },
      { arrayFilters: [{ 's.code': 'B01' }] },
    );

    // Vấn đề 5
    const paidAt = addMs(now, MIN);
    pay(a._id, paidAt);
    const replay = flows.payBooking({
      bookingId: a._id, method: 'momo', transactionRef: `VERIFY-${tag}-${txn}`, idempotencyKey: `verify-${tag}-${txn}`, now: paidAt,
    });
    check('VĐ5: gửi lại callback được nhận diện', replay.duplicate === true);
    check('VĐ5: gửi lại không tạo payment mới', d.payments.countDocuments({ bookingId: a._id }) === 1);
    check('VĐ5: gửi lại không tạo vé mới', d.tickets.countDocuments({ bookingId: a._id }) === 2);
    expectError('VĐ5: khóa mới trên đơn đã trả bị chặn', 'BOOKING_NOT_PENDING', () => pay(a._id, paidAt));
    const b = flows.createBooking({ userId: userB, showtimeId, seatCodes: ['C01'], now });
    expectError('VĐ5: trùng transactionRef bị chặn', 'DUPLICATE_TRANSACTION', () => flows.payBooking({
      bookingId: b._id, method: 'momo', transactionRef: `VERIFY-${tag}-1`, idempotencyKey: `verify-${tag}-other`, now: paidAt,
    }));
    flows.releaseBooking({ bookingId: b._id, status: 'cancelled', now });

    // Vấn đề 1, chốt thứ hai
    const ticketA = d.tickets.findOne({ bookingId: a._id, seatCode: 'A01' });
    let dup = 'NO_ERROR';
    try {
      d.tickets.insertOne({ ...ticketA, _id: new ObjectId(), qrCode: `${ticketA.qrCode}-X` });
    } catch (error) {
      dup = error.code;
    }
    check('VĐ1: unique index chặn vé thứ hai cùng ghế cùng suất', dup === 11000, dup);

    // Vấn đề 9
    const earn = d.loyalty_transactions.find({ refId: a._id, type: 'earn' }).toArray();
    check('VĐ9: gửi lại callback chỉ tích điểm một lần', earn.length === 1, earn.length);
    let user = d.users.findOne({ _id: userA });
    check('VĐ9: số dư bằng sổ điểm', user.pointsBalance === earn[0].points);
    expectError('VĐ9: dùng quá số điểm bị chặn', 'POINTS_NOT_ENOUGH',
      () => flows.createBooking({ userId: userA, showtimeId, seatCodes: ['D01'], pointsToUse: user.pointsBalance + 1, now }));
    check('VĐ9: lỗi dùng điểm trả lại ghế đã giữ', seat('D01').status === 'available');
    const withPoints = flows.createBooking({ userId: userA, showtimeId, seatCodes: ['D02'], pointsToUse: 5, now });
    check('VĐ9: dùng điểm trừ số dư', d.users.findOne({ _id: userA }).pointsBalance === user.pointsBalance - 5);
    flows.releaseBooking({ bookingId: withPoints._id, status: 'cancelled', now });
    check('VĐ9: hủy đơn trả lại điểm', d.users.findOne({ _id: userA }).pointsBalance === user.pointsBalance);

    // Vấn đề 2
    const old = flows.createBooking({ userId: userA, showtimeId, seatCodes: ['E01'], now });
    const later = addMs(now, 11 * MIN);
    expectError('VĐ2: thanh toán đơn quá hạn bị chặn', 'BOOKING_EXPIRED', () => pay(old._id, later));
    const taker = flows.createBooking({ userId: userB, showtimeId, seatCodes: ['E01'], now: later });
    check('VĐ2: ghế quá hạn giữ được người khác đặt', taker.seatCodes[0] === 'E01');
    flows.releaseBooking({ bookingId: old._id, status: 'expired', now: later });
    check('VĐ2: hết hạn đơn cũ không làm mất ghế của đơn mới', seat('E01').holdToken === taker.holdToken);
    check('VĐ2: đơn quá hạn chuyển expired', d.bookings.findOne({ _id: old._id }).status === 'expired');
    flows.releaseBooking({ bookingId: taker._id, status: 'cancelled', now: later });

    // Vấn đề 6
    const p1 = flows.createBooking({ userId: userA, showtimeId, seatCodes: ['F01'], promoCode, now });
    check('VĐ6: mã giảm đúng số tiền', p1.discountAmount === 10000 && p1.totalAmount === p1.subtotal - 10000);
    expectError('VĐ6: vượt maxUses bị chặn', 'PROMO_EXHAUSTED',
      () => flows.createBooking({ userId: userB, showtimeId, seatCodes: ['F02'], promoCode, now }));
    check('VĐ6: lỗi mã trả lại ghế đã giữ', seat('F02').status === 'available');
    flows.releaseBooking({ bookingId: p1._id, status: 'cancelled', now });
    check('VĐ6: hủy đơn trả lại lượt dùng', d.promotions.findOne({ _id: promoId }).usedCount === 0);
    d.promotions.updateOne({ _id: promoId }, { $set: { maxUses: 5 } });
    const p2 = flows.createBooking({ userId: userA, showtimeId, seatCodes: ['F03'], promoCode, now });
    pay(p2._id, paidAt);
    expectError('VĐ6: vượt perUserLimit bị chặn', 'PROMO_USER_LIMIT',
      () => flows.createBooking({ userId: userA, showtimeId, seatCodes: ['F04'], promoCode, now }));
    check('VĐ6: bị chặn theo user thì không tốn lượt của mã', d.promotions.findOne({ _id: promoId }).usedCount === 1);

    // Vấn đề 7
    const beforeCutoff = addMs(start, -3 * 60 * MIN);
    const r1 = d.tickets.findOne({ bookingId: a._id, seatCode: 'A02' });
    const refundInput = {
      bookingId: a._id, ticketIds: [r1._id], staffId: manager._id, reason: 'Thử', now: beforeCutoff,
    };
    expectError('VĐ7: nhân viên không có quyền bị chặn', 'STAFF_FORBIDDEN',
      () => flows.refundTickets({ ...refundInput, staffId: cashier._id }));
    expectError('VĐ7: quá hạn hoàn bị chặn', 'REFUND_TOO_LATE',
      () => flows.refundTickets({ ...refundInput, now: addMs(start, -60 * MIN) }));
    const spendBefore = d.users.findOne({ _id: userA }).lifetimeSpend;
    const refund = flows.refundTickets(refundInput);
    check('VĐ7: hoàn một vé, đơn thành partially_refunded', d.bookings.findOne({ _id: a._id }).status === 'partially_refunded');
    check('VĐ7: ghế hoàn được mở bán lại', seat('A02').status === 'available');
    check('VĐ7: lifetimeSpend giảm đúng số hoàn', d.users.findOne({ _id: userA }).lifetimeSpend === spendBefore - refund.amount);
    expectError('VĐ7: hoàn lại lần hai bị chặn', 'TICKET_NOT_ACTIVE', () => flows.refundTickets(refundInput));
    const resale = flows.createBooking({ userId: userB, showtimeId, seatCodes: ['A02'], now });
    pay(resale._id, paidAt);
    check('VĐ7: ghế đã hoàn bán lại được cho khách khác', d.tickets.countDocuments({ showtimeId, seatCode: 'A02', status: 'active' }) === 1);

    // Vấn đề 8
    const inWindow = addMs(start, -10 * MIN);
    expectError('VĐ8: soát quá sớm bị chặn', 'CHECKIN_WINDOW',
      () => flows.checkInTicket({ qrCode: ticketA.qrCode, staffId: checker._id, now: addMs(start, -2 * 60 * MIN) }));
    expectError('VĐ8: nhân viên rạp khác bị chặn', 'WRONG_CINEMA',
      () => flows.checkInTicket({ qrCode: ticketA.qrCode, staffId: outsider._id, now: inWindow }));
    expectError('VĐ10: chưa xem phim không đánh giá được', 'REVIEW_FORBIDDEN',
      () => flows.submitReview({ ticketId: ticketA._id, userId: userA, rating: 9, now: inWindow }));
    flows.checkInTicket({ qrCode: ticketA.qrCode, staffId: checker._id, now: inWindow });
    check('VĐ8: soát lần đầu thành công', d.tickets.findOne({ _id: ticketA._id }).status === 'used');
    expectError('VĐ8: soát lần hai bị chặn', 'TICKET_NOT_ACTIVE',
      () => flows.checkInTicket({ qrCode: ticketA.qrCode, staffId: checker._id, now: inWindow }));
    expectError('VĐ7: vé đã soát không hoàn được', 'TICKET_NOT_ACTIVE',
      () => flows.refundTickets({ ...refundInput, ticketIds: [ticketA._id] }));

    // Vấn đề 10
    expectError('VĐ10: dùng vé của người khác bị chặn', 'REVIEW_FORBIDDEN',
      () => flows.submitReview({ ticketId: ticketA._id, userId: userB, rating: 9, now: inWindow }));
    flows.submitReview({ ticketId: ticketA._id, userId: userA, rating: 9, now: inWindow });
    check('VĐ10: người đã xem đánh giá được', d.movies.findOne({ _id: movieId }).ratingSummary.count === 1);
    expectError('VĐ10: đánh giá hai lần bị chặn', 'REVIEW_DUPLICATE',
      () => flows.submitReview({ ticketId: ticketA._id, userId: userA, rating: 1, now: inWindow }));

    // Vấn đề 4. Lấy thứ Tư và thứ Bảy gần nhất theo giờ Việt Nam để ca thử không phụ thuộc ngày chạy.
    const std = d.seat_types.findOne({ code: 'STANDARD' })._id;
    const hn = d.cinemas.findOne({ code: 'HN01' })._id;
    const dn = d.cinemas.findOne({ code: 'DN01' })._id;
    function vnTime(dayOfWeek, hour, minute) {
      const t = new Date(now.getTime() + flows.config.VN_OFFSET_MS);
      while (t.getUTCDay() !== dayOfWeek) t.setUTCDate(t.getUTCDate() + 1);
      return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), hour - 7, minute));
    }
    const price = (cinemaId, startTime) => flows.resolvePrice({ format: '2D', seatTypeId: std, cinemaId, startTime });
    check('VĐ4: giá gốc ngày thường', price(hn, vnTime(3, 14, 0)) === 85000);
    check('VĐ4: giá cuối tuần', price(hn, vnTime(6, 14, 0)) === 100000);
    check('VĐ4: giá suất sớm', price(hn, vnTime(3, 9, 0)) === 70000);
    check('VĐ4: giá riêng theo rạp', price(dn, vnTime(3, 14, 0)) === 75000);
    check('VĐ4: 23:59 giờ Việt Nam vẫn có giá', price(hn, vnTime(3, 23, 59)) === 85000);

    // Vấn đề 11
    const soldPrice = d.tickets.findOne({ _id: ticketA._id }).price;
    d.movies.updateOne({ _id: movieId }, { $set: { title: 'Tên phim đã đổi' } });
    d.showtimes.updateOne({ _id: showtimeId }, { $inc: { 'seats.$[].price': 50000 } });
    check('VĐ11: đổi tên phim không đổi lịch sử đơn', d.bookings.findOne({ _id: a._id }).snapshot.movieTitle === `Phim thử ${tag}`);
    check('VĐ11: đổi giá không đổi giá vé đã bán', d.tickets.findOne({ _id: ticketA._id }).price === soldPrice);

    // Tính lại số tổng khi một luồng bị đứt giữa chừng
    user = d.users.findOne({ _id: userA });
    d.users.updateOne({ _id: userA }, { $set: { pointsBalance: 999999, lifetimeSpend: 1 } });
    flows.syncUser(userA);
    const repaired = d.users.findOne({ _id: userA });
    check(
      'syncUser sửa được số tổng bị lệch',
      repaired.pointsBalance === user.pointsBalance && repaired.lifetimeSpend === user.lifetimeSpend,
      { repaired: [repaired.pointsBalance, repaired.lifetimeSpend], expected: [user.pointsBalance, user.lifetimeSpend] },
    );
  } catch (error) {
    check('Ca thử nghiệp vụ chạy hết không lỗi bất ngờ', false, String(error.stack || error));
  } finally {
    cleanup();
  }

  const leftover = [];
  for (const name of names) {
    if (d.getCollection(name).countDocuments() !== before[name]) leftover.push(name);
  }
  check('Dữ liệu thử đã được dọn sạch', leftover.length === 0, leftover);

  print(`\n[06] Kết quả: ${passed} PASS, ${failures.length} FAIL.`);
  if (failures.length > 0) throw new Error(`Có ${failures.length} kiểm tra không đạt`);
})();
