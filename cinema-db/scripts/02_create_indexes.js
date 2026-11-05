// Tạo index. createIndex chạy lại được, index đã có thì bỏ qua.
(function () {
  const d = db.getSiblingDB('QLDatVeXemPhim');
  const unique = { unique: true };
  const active = (...statuses) => ({
    unique: true, partialFilterExpression: { status: { $in: statuses } },
  });

  const plan = {
    users: [[{ email: 1 }, unique], [{ phone: 1 }, unique], [{ tierId: 1 }]],
    membership_tiers: [[{ code: 1 }, unique], [{ minSpend: 1 }]],
    loyalty_transactions: [
      [{ refType: 1, refId: 1, type: 1 }, unique], // chặn cộng/trừ điểm trùng cho cùng một nghiệp vụ
      [{ userId: 1, createdAt: -1 }],
    ],
    genres: [[{ slug: 1 }, unique], [{ name: 1 }, unique]],
    people: [[{ fullName: 1 }]],
    movies: [
      [{ slug: 1 }, unique], [{ status: 1, releaseDate: -1 }], [{ genreIds: 1 }], [{ 'credits.personId': 1 }],
      // Mặc định text index đọc trường "language" làm ngôn ngữ của document, nên phải đổi sang tên khác.
      [{ title: 'text' }, { default_language: 'none', language_override: 'textIndexLanguage' }],
    ],
    reviews: [
      [{ movieId: 1, userId: 1 }, unique], [{ ticketId: 1 }, unique],
      [{ movieId: 1, status: 1, createdAt: -1 }], [{ userId: 1 }],
    ],
    cinemas: [[{ code: 1 }, unique], [{ location: '2dsphere' }], [{ city: 1 }]],
    rooms: [[{ cinemaId: 1, name: 1 }, unique]],
    seat_types: [[{ code: 1 }, unique]],
    staff: [[{ email: 1 }, unique], [{ cinemaId: 1, position: 1 }]],
    showtimes: [
      [{ roomId: 1, startTime: 1 }, unique], // chặn hai suất cùng phòng cùng giờ; giao nhau kiểm tra ở flows
      [{ movieId: 1, startTime: 1 }], [{ cinemaId: 1, startTime: 1 }], [{ status: 1, startTime: 1 }],
    ],
    price_rules: [[{ format: 1, seatTypeId: 1, status: 1, priority: -1 }]],
    bookings: [
      [{ bookingCode: 1 }, unique], [{ userId: 1, createdAt: -1 }], [{ showtimeId: 1 }], [{ status: 1, expiresAt: 1 }],
    ],
    tickets: [
      [{ qrCode: 1 }, unique],
      [{ showtimeId: 1, seatCode: 1 }, active('active', 'used')], // chốt chặn cuối chống bán trùng ghế
      [{ bookingId: 1 }], [{ userId: 1, movieId: 1 }],
    ],
    payments: [
      [{ transactionRef: 1 }, unique], [{ idempotencyKey: 1 }, unique],
      [{ bookingId: 1 }], [{ status: 1, paidAt: 1 }], [{ userId: 1, status: 1 }],
    ],
    refunds: [[{ bookingId: 1 }], [{ paymentId: 1 }], [{ userId: 1, status: 1 }]],
    concession_items: [[{ name: 1 }, unique], [{ type: 1, status: 1 }]],
    promotions: [[{ code: 1 }, unique], [{ status: 1, endAt: 1 }]],
    promotion_redemptions: [
      [{ promotionId: 1, userId: 1, useNo: 1 }, active('reserved', 'applied')],
      [{ promotionId: 1, bookingId: 1 }, active('reserved', 'applied')],
      [{ bookingId: 1 }], [{ userId: 1 }],
    ],
  };

  let total = 0;
  const names = Object.keys(plan);
  for (let i = 0; i < names.length; i += 1) {
    const specs = plan[names[i]];
    for (let j = 0; j < specs.length; j += 1) {
      d.getCollection(names[i]).createIndex(specs[j][0], specs[j][1] || {});
      total += 1;
    }
  }
  print(`[02] Đã tạo ${total} index trên ${names.length} collection.`);
})();
