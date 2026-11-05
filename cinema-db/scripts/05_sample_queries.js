// Các pipeline khai thác mẫu. Có thể dán từng stage vào Aggregator của Mingo.
(function () {
  const d = db.getSiblingDB('QLDatVeXemPhim');
  const VN = '+07:00';
  const SOLD = ['paid', 'partially_refunded', 'refunded'];

  function show(title, collection, pipeline) {
    print(`\n=== ${title} ===`);
    const rows = d.getCollection(collection).aggregate(pipeline).toArray();
    for (let i = 0; i < rows.length; i += 1) print(JSON.stringify(rows[i]));
  }

  show('1. Lịch chiếu sắp tới theo phim và rạp', 'showtimes', [
    { $match: { status: 'open', startTime: { $gt: new Date() } } },
    {
      $group: {
        _id: { phim: '$snapshot.movieTitle', rap: '$snapshot.cinemaName' },
        soSuat: { $sum: 1 },
        suatDauTien: { $min: '$startTime' },
      },
    },
    { $sort: { soSuat: -1 } },
    { $limit: 5 },
  ]);

  show('2. Số ghế theo trạng thái của suất sắp chiếu', 'showtimes', [
    { $match: { status: 'open', startTime: { $gt: new Date() } } },
    { $sort: { startTime: 1 } },
    { $limit: 3 },
    {
      $project: {
        _id: 0,
        phim: '$snapshot.movieTitle',
        rap: '$snapshot.cinemaName',
        phong: '$snapshot.roomName',
        startTime: 1,
        trong: { $size: { $filter: { input: '$seats', cond: { $eq: ['$$this.status', 'available'] } } } },
        dangGiu: { $size: { $filter: { input: '$seats', cond: { $eq: ['$$this.status', 'held'] } } } },
        daBan: { $size: { $filter: { input: '$seats', cond: { $eq: ['$$this.status', 'booked'] } } } },
      },
    },
  ]);

  show('3. Doanh thu vé theo phim (giá niêm yết, vé còn hiệu lực)', 'tickets', [
    { $match: { status: { $in: ['active', 'used'] } } },
    { $group: { _id: '$movieId', soVe: { $sum: 1 }, doanhThu: { $sum: '$price' } } },
    { $lookup: { from: 'movies', localField: '_id', foreignField: '_id', as: 'movie' } },
    { $project: { _id: 0, phim: { $first: '$movie.title' }, soVe: 1, doanhThu: 1 } },
    { $sort: { doanhThu: -1 } },
    { $limit: 5 },
  ]);

  show('4. Doanh thu thực thu theo rạp và tháng, đã trừ hoàn tiền', 'bookings', [
    { $match: { status: { $in: SOLD } } },
    {
      $lookup: {
        from: 'refunds',
        localField: '_id',
        foreignField: 'bookingId',
        as: 'refunds',
        pipeline: [{ $match: { status: 'completed' } }],
      },
    },
    {
      $group: {
        _id: {
          rap: '$snapshot.cinemaName',
          thang: { $dateToString: { format: '%Y-%m', date: '$paidAt', timezone: VN } },
        },
        soDon: { $sum: 1 },
        thucThu: { $sum: { $subtract: ['$totalAmount', { $sum: '$refunds.amount' }] } },
      },
    },
    { $sort: { '_id.thang': 1, thucThu: -1 } },
  ]);

  show('5. Tỷ lệ lấp đầy theo định dạng trên các suất đã chiếu', 'showtimes', [
    { $match: { status: 'ended' } },
    {
      $project: {
        format: 1,
        tong: { $size: '$seats' },
        daBan: { $size: { $filter: { input: '$seats', cond: { $eq: ['$$this.status', 'booked'] } } } },
      },
    },
    { $group: { _id: '$format', soSuat: { $sum: 1 }, tong: { $sum: '$tong' }, daBan: { $sum: '$daBan' } } },
    { $project: { soSuat: 1, tyLePhanTram: { $round: [{ $multiply: [{ $divide: ['$daBan', '$tong'] }, 100] }, 2] } } },
    { $sort: { tyLePhanTram: -1 } },
  ]);

  show('6. Hiệu quả khuyến mãi', 'promotion_redemptions', [
    { $match: { status: 'applied' } },
    { $group: { _id: '$promotionId', luotDung: { $sum: 1 }, tongGiam: { $sum: '$discountAmount' } } },
    { $lookup: { from: 'promotions', localField: '_id', foreignField: '_id', as: 'promo' } },
    { $project: { _id: 0, ma: { $first: '$promo.code' }, luotDung: 1, tongGiam: 1, hanMuc: { $first: '$promo.maxUses' } } },
    { $sort: { tongGiam: -1 } },
  ]);

  show('7. Doanh thu bắp nước theo sản phẩm', 'bookings', [
    { $match: { status: { $in: SOLD } } },
    { $unwind: '$concessions' },
    {
      $group: {
        _id: '$concessions.name',
        soLuong: { $sum: '$concessions.quantity' },
        doanhThu: { $sum: '$concessions.lineTotal' },
      },
    },
    { $sort: { doanhThu: -1 } },
    { $limit: 5 },
  ]);

  show('8. Top phim theo đánh giá, tối thiểu 10 lượt', 'movies', [
    { $match: { 'ratingSummary.count': { $gte: 10 } } },
    { $sort: { 'ratingSummary.avg': -1, 'ratingSummary.count': -1 } },
    { $limit: 5 },
    { $project: { _id: 0, title: 1, ageRating: 1, ratingSummary: 1 } },
  ]);

  show('9. Rạp gần vị trí người dùng (đứng ở Hồ Gươm, Hà Nội)', 'cinemas', [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [105.8525, 21.0288] },
        distanceField: 'khoangCachMet',
        spherical: true,
      },
    },
    { $project: { _id: 0, name: 1, city: 1, khoangCachKm: { $round: [{ $divide: ['$khoangCachMet', 1000] }, 1] } } },
    { $limit: 3 },
  ]);

  show('10. Số khách theo hạng thành viên', 'users', [
    { $group: { _id: '$tierId', soKhach: { $sum: 1 }, chiTieuTB: { $avg: '$lifetimeSpend' } } },
    { $lookup: { from: 'membership_tiers', localField: '_id', foreignField: '_id', as: 'tier' } },
    {
      $project: {
        _id: 0,
        hang: { $first: '$tier.name' },
        rank: { $first: '$tier.rank' },
        soKhach: 1,
        chiTieuTB: { $round: ['$chiTieuTB', 0] },
      },
    },
    { $sort: { rank: 1 } },
  ]);
})();
