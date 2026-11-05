const $ = selector => document.querySelector(selector);
const dialog = $('#modal');
const content = $('#dialog-content');
const e = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
const number = value => new Intl.NumberFormat('vi-VN').format(value || 0);
const vn = { timeZone: 'Asia/Ho_Chi_Minh' };
const time = value => new Intl.DateTimeFormat('vi-VN', { ...vn, hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const day = value => new Intl.DateTimeFormat('en-CA', { ...vn, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const date = value => value ? new Intl.DateTimeFormat('vi-VN', { ...vn, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : '';
const status = {
  paid: 'Đã thanh toán', pending: 'Đang giữ ghế', cancelled: 'Đã hủy', expired: 'Hết hạn',
  partially_refunded: 'Hoàn một phần', refunded: 'Đã hoàn', active: 'Còn hiệu lực', used: 'Đã soát',
  success: 'Thành công', failed: 'Thất bại', approved: 'Đã duyệt', rejected: 'Từ chối',
  reserved: 'Đang giữ', reversed: 'Đã hoàn tác', applied: 'Đã áp dụng',
  card: 'Thẻ', momo: 'MoMo', vnpay: 'VNPay', bank_transfer: 'Chuyển khoản',
};
const palettes = [['#8255ff','#2d185b'],['#ef743a','#5a282b'],['#1ba68c','#134d56'],['#df5189','#61234b'],['#406ce5','#213962'],['#c5a345','#534428']];
const state = { catalog: null, filter: 'now_showing', identity: null, schedule: [], movie: '', day: '', cinema: '', seats: new Set(), show: null };
let request = 0;
let timer;
const button = (text, action, id = '', type = 'soft', attrs = '') =>
  `<button type="button" class="${type}" data-act="${action}" data-id="${e(id)}" ${attrs}>${text}</button>`;
const empty = text => `<p class="empty">${e(text)}</p>`;
const label = value => status[value] || value;
const tag = value => `<span class="tag">${e(label(value))}</span>`;

function revive(key, value) {
  if (value && typeof value === 'object') {
    if (value.$oid) return value.$oid;
    if (value.$date) return value.$date;
    if (value.$numberLong) return Number(value.$numberLong);
  }
  return value;
}

async function api(action, input = {}, write = false) {
  const response = await fetch('/api/' + action + (write ? '' : '?' + new URLSearchParams(input)), write ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  } : {});
  const result = JSON.parse(await response.text(), revive);
  if (response.status === 401 && action !== 'login') setIdentity(null);
  if (!response.ok || result.error) throw Error(result.error || 'Không tải được dữ liệu.');
  return result.data;
}

function panel(title, body, kicker = 'CINEPASS', wide = false) {
  dialog.classList.toggle('dashboard-dialog', wide);
  content.innerHTML = `<header class="dialog-head"><div><p class="kicker"><span></span> ${kicker}</p><h2 id="dialog-title" tabindex="-1">${e(title)}</h2></div>
    ${button('×', 'close', '', 'close', 'aria-label="Đóng"')}</header><div class="dialog-body">${body}</div>`;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  $('#dialog-title').focus({ preventScroll: true });
}

function error(message) {
  $('.notice-box')?.remove();
  $('.dialog-body').insertAdjacentHTML('afterbegin', `<p class="notice-box" role="alert">${e(message)}</p>`);
}

async function load(title, get, draw) {
  const token = ++request;
  panel(title, '<p role="status">Đang đọc dữ liệu từ MongoDB…</p>');
  try {
    const data = await get();
    if (token === request && dialog.open) draw(data);
  } catch (err) {
    if (token === request && dialog.open) error(err.message);
  }
}

function setIdentity(identity) {
  state.identity = identity;
  $('#account-button').textContent = identity ? 'Vé & tài khoản ↗' : 'Đăng nhập ↗';
  if (!identity) state.account = null;
}

function authPanel(register = false, destination = 'account') {
  const title = register ? 'Tạo tài khoản' : 'Đăng nhập';
  panel(title, `<p class="muted">${destination === 'checkout' ?
    'Đăng nhập để giữ ghế và xem vé của bạn.' : 'Đăng nhập để xem vé, hạng thành viên và điểm của bạn.'}</p>
    <form data-form="${register ? 'register' : 'login'}" data-destination="${e(destination)}">
      <div class="form-fields">
        ${register ? '<label>Họ và tên <input name="fullName" autocomplete="name" maxlength="100" required></label>' : ''}
        <label>Email <input name="email" type="email" autocomplete="email" maxlength="160" required></label>
        ${register ? '<label>Số điện thoại <input name="phone" type="tel" autocomplete="tel" pattern="0[0-9]{9}" required></label>' : ''}
        <label>Mật khẩu <input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="${register ? 8 : 1}" maxlength="128" required></label>
      </div>
      <div class="checkout">
        ${button(register ? 'Đã có tài khoản' : 'Tạo tài khoản mới', register ? 'login' : 'register', destination)}
        <button class="primary">${title}</button>
      </div>
    </form>`, 'TÀI KHOẢN CINEPASS');
}

const normalize = value => value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd');
const genreNames = movie => movie.genreIds.map(id => state.catalog.genres.find(genre => genre._id === id)?.name).filter(Boolean);
function renderMovies() {
  const filter = $('#genre').value;
  const search = normalize($('#search').value.trim());
  const movies = state.catalog.movies.filter(movie => movie.status === state.filter &&
    (!filter || movie.genreIds.includes(filter)) &&
    normalize(movie.title + ' ' + (movie.media?.originalTitle || '')).includes(search));
  $('#result-count').textContent = number(movies.length) + ' phim';
  $('#movies').innerHTML = movies.map(movie => {
    const [accent, shade] = palettes[state.catalog.movies.indexOf(movie) % palettes.length];
    return `<article class="movie"><button class="poster db-poster" style="--accent:${accent};--shade:${shade}" data-act="detail" data-id="${e(movie._id)}" aria-label="Xem chi tiết ${e(movie.title)}">
      ${movieArt(movie)}<span class="rating">${e(movie.media?.year || '')}</span><span class="poster-fallback">CinePass<br>${e(movie.title)}</span></button>
      <div class="movie-body"><h3>${e(movie.title)}</h3><p class="original-title">${e(movie.media?.originalTitle || '')}</p>
      <p class="format">${e(genreNames(movie).join(' · '))}</p>
      <p>${movie.durationMin} phút · ${e(movie.language)}</p>
      <div class="movie-actions">${movie.status === 'now_showing' ? button('Đặt vé ↗', 'schedule', movie._id, 'primary') : button('Chi tiết', 'detail', movie._id)}
      ${trailerButton(movie)}</div></div></article>`;
  }).join('') || empty('Không tìm thấy phim phù hợp.');
}

function trailerButton(movie) {
  return Object.hasOwn(trailers, movie.slug) ? button('▶ Trailer', 'trailer', movie._id) : '';
}

function showTrailer(movie) {
  const video = trailers[movie.slug];
  if (!Object.hasOwn(trailers, movie.slug) || !/^[A-Za-z0-9_-]{11}$/.test(video)) return;
  panel(movie.title, `<iframe class="trailer-frame" src="https://www.youtube-nocookie.com/embed/${video}"
    title="Trailer ${e(movie.title)}" referrerpolicy="strict-origin-when-cross-origin"
    allow="encrypted-media; picture-in-picture" allowfullscreen></iframe>
    <div class="card-row trailer-actions">${button('Chi tiết phim', 'detail', movie._id)}
    ${movie.status === 'now_showing' ? button('Chọn suất ↗', 'schedule', movie._id, 'primary') : ''}
    <a class="soft" href="https://www.youtube.com/watch?v=${video}" target="_blank" rel="noopener noreferrer">Mở trên YouTube ↗</a></div>`, 'TRAILER CHÍNH THỨC', true);
}

function openSchedule(movie = '', cinema = '') {
  state.movie = movie;
  state.day = '';
  state.cinema = cinema;
  load('Lịch chiếu', () => api('schedule', movie ? { movie } : {}), data => {
    state.schedule = data;
    drawSchedule();
  });
}

function detail({ movie, people, reviews }) {
  panel(movie.title, `<div class="detail-art" aria-hidden="true">${movieArt(movie, true)}</div><div class="card-row">${genreNames(movie).map(tag).join('')}</div>
    <p class="original-title">${e(movie.media?.originalTitle || '')}</p>
    <p>${movie.durationMin} phút · ${e(movie.language)} · Phát hành ${e(movie.media?.year || new Date(movie.releaseDate).getFullYear())}</p>
    <p class="muted">Suất chiếu mô phỏng · ${e(movie.formats.join(' / '))} · Phân loại demo ${e(movie.ageRating)}</p>
    <p>${e(movie.synopsis)}</p>
    <div class="card-row">${movie.status === 'now_showing' ? button('Chọn suất ↗', 'schedule', movie._id, 'primary') : ''}
    ${trailerButton(movie)}</div>
    <details class="fold"><summary>Đạo diễn & diễn viên</summary>${movie.credits.map(credit => {
      const person = people.find(person => person._id === credit.personId);
      return `<p><strong>${e(credit.name)}</strong> · ${e(({ actor: 'Diễn viên', writer: 'Biên kịch', director: 'Đạo diễn' })[credit.role] || credit.role)}
      ${credit.character ? ' · ' + e(credit.character) : ''} ${person?.nationality && person.nationality !== 'Chưa cập nhật' ? ' · ' + e(person.nationality) : ''}</p>`;
    }).join('')}</details><h3>★ ${number(movie.ratingSummary.avg)}/10 · ${movie.ratingSummary.count} đánh giá demo</h3>
    <div class="data-list">${reviews.map(review => `<article class="record"><strong>${review.rating}/10</strong>
    <p>${e(review.comment || 'Đã chấm điểm phim.')} · ${date(review.createdAt)}</p></article>`).join('') || empty('Chưa có đánh giá.')}</div>`, 'THÔNG TIN PHIM');
}

function drawSchedule() {
  const cinemaShows = state.schedule.filter(show => !state.cinema || show.cinemaId === state.cinema);
  const days = [...new Set(cinemaShows.map(show => day(show.startTime)))];
  if (!days.includes(state.day)) state.day = days[0];
  const titles = state.catalog.movies.find(movie => movie._id === state.movie);
  const selected = cinemaShows.filter(show => day(show.startTime) === state.day);
  const groups = Map.groupBy(selected, show => show.cinemaId);
  panel(titles?.title || 'Lịch chiếu', `<div class="options schedule-days" aria-label="Ngày chiếu">${days.map(key => button(
    e(new Intl.DateTimeFormat('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: vn.timeZone }).format(new Date(key + 'T12:00:00+07:00'))),
    'day', key, 'option', `aria-pressed="${key === state.day}"`)).join('')}</div>
    <label class="inline">Rạp <select id="cinema"><option value="">Tất cả rạp</option>${state.catalog.cinemas.map(cinema =>
    `<option value="${e(cinema._id)}" ${cinema._id === state.cinema ? 'selected' : ''}>${e(cinema.city)} · ${e(cinema.name)}</option>`).join('')}</select></label>
    <div class="data-list">${[...groups].map(([id, shows]) => {
      const cinema = state.catalog.cinemas.find(cinema => cinema._id === id);
      return `<article class="record"><h3>${e(shows[0].snapshot.cinemaName)}</h3><p>${e(cinema?.address)}</p>
      <div class="card-row">${shows.map(show => button(e((state.movie ? '' : show.snapshot.movieTitle + ' · ') +
        time(show.startTime) + ' · ' + show.format + ' · ' + show.snapshot.roomName), 'seatmap', show._id, 'option')).join('')}</div></article>`;
    }).join('') || empty('Chưa có suất mở bán cho lựa chọn này.')}</div>`, 'BƯỚC 1 / 3 · CHỌN SUẤT', true);
}

function showSummary(show) {
  return `${e(show.snapshot.cinemaName)} · ${e(show.snapshot.roomName)} · ${date(show.startTime)} · ${time(show.startTime)} · ${e(show.format)}`;
}

function drawSeats({ room, types, show }) {
  state.show = show;
  const seats = new Map(show.seats.map(seat => [seat.code, seat]));
  for (const code of state.seats) if (seats.get(code)?.status !== 'available') state.seats.delete(code);
  const columns = Math.max(...room.seatMap.map(row => row.seatCount));
  const rows = room.seatMap.map(row => {
    const list = show.seats.filter(seat => seat.code.startsWith(row.row));
    return `<div class="seat-row" style="--seat-columns:${columns};--seat-min:${columns * 30 + 22}px"><span class="row-label">${e(row.row)}</span>
      ${list.map(seat => {
        const type = types.find(type => type._id === seat.seatTypeId);
        const style = type?.personsPerSeat > 1 ? 'pair' : type?.code === 'VIP' ? 'vip' : '';
        const title = `Ghế ${seat.code} · ${type?.name || ''} · ${money(seat.price)}`;
        return button(e(seat.code), 'seat', seat.code, 'seat ' + style, `title="${e(title)}" aria-label="${e(title)}"
          aria-pressed="${state.seats.has(seat.code)}" ${seat.status === 'available' ? '' : 'disabled'}`);
      }).join('')}</div>`;
  });
  panel('Chọn ghế', `<h3>${e(show.snapshot.movieTitle)}</h3><p class="summary">${showSummary(show)} · ${room.capacity} chỗ</p>
    <div class="screen">MÀN HÌNH</div><div class="seat-scroll">${rows.join('')}</div>
    <div class="legend"><span><i></i>Thường</span><span><i class="vip"></i>VIP</span><span><i class="pair"></i>Ghế đôi</span><span><i class="chosen"></i>Đang chọn</span><span><i class="occupied"></i>Đã giữ / bán</span></div>
    <div class="checkout"><div><small id="selection" aria-live="polite"></small><strong id="amount"></strong></div>
    <div>${button('Đổi suất', 'schedule-back')} ${button('Làm mới ghế', 'seatmap', show._id)} ${button('Tiếp tục ↗', 'checkout', '', 'primary', 'id="next"')}</div></div>`,
    'BƯỚC 2 / 3 · SƠ ĐỒ GHẾ', true);
  seatTotal();
}

function seatAmount() {
  return state.show.seats.filter(seat => state.seats.has(seat.code)).reduce((total, seat) => total + seat.price, 0);
}

function seatTotal() {
  $('#selection').textContent = state.seats.size ? [...state.seats].join(', ') : 'Chọn tối đa 8 ghế';
  $('#amount').textContent = money(seatAmount());
  $('#next').disabled = !state.seats.size;
}

function checkout({ profile, tier }) {
  panel('Hoàn tất đơn', `<form data-form="book"><p class="muted">Đặt vé cho ${e(profile.fullName)}</p>
    <article class="record"><h3>${e(state.show.snapshot.movieTitle)}</h3><p>${showSummary(state.show)}</p>
    <p>Ghế ${e([...state.seats].join(', '))} · ${money(seatAmount())}</p></article>
    <details class="fold"><summary>Thêm bắp nước</summary>${state.catalog.concessions.map(item =>
      `<label class="food-line"><span><strong>${e(item.name)}</strong> · ${money(item.price)}</span>
      <input type="number" name="food" data-item="${e(item._id)}" aria-label="Số lượng ${e(item.name)}" min="0" max="10" value="0"></label>`).join('')}</details>
    <div class="form-fields"><label>Mã ưu đãi <input name="promo" list="promo-codes" maxlength="40" placeholder="Chọn hoặc nhập mã"></label>
    <datalist id="promo-codes">${state.catalog.promotions.map(promo => `<option value="${e(promo.code)}">${e(promo.name)}</option>`).join('')}</datalist>
    <label>Điểm sử dụng · ${e(tier?.name)} · Có ${number(profile.pointsBalance)} điểm
    <input type="number" name="points" min="0" max="${Math.max(profile.pointsBalance, 0)}" value="0"></label></div>
    <p class="summary">MongoDB xác nhận giá, ưu đãi và giữ ghế trong 10 phút.</p>
    <div class="checkout">${button('Quay lại ghế', 'seatmap', state.show._id)} <button class="primary">Giữ ghế ↗</button></div></form>`, 'BƯỚC 3 / 3 · GIỮ GHẾ');
}

function payment(booking) {
  panel('Thanh toán mô phỏng', `<article class="record"><h3>${e(booking.bookingCode)} · ${e(booking.snapshot.movieTitle)}</h3>
    <p>Ghế ${e(booking.seatCodes.join(', '))} · Vé ${money(booking.ticketAmount)} · Bắp nước ${money(booking.concessionAmount)}</p>
    <p>Giảm giá ${money(booking.discountAmount)} · Điểm quy đổi ${money(booking.pointsDiscount)}</p>
    <p>Thời gian giữ ghế còn <strong id="remaining"></strong></p></article>
    <form data-form="pay" data-id="${e(booking._id)}"><div class="form-fields"><label>Phương thức
    <select name="method"><option value="momo">MoMo</option><option value="vnpay">VNPay</option><option value="card">Thẻ</option><option value="bank_transfer">Chuyển khoản</option></select></label></div>
    <div class="checkout">${button('Vé & tài khoản', 'account')} <button class="primary" id="pay-now">Xác nhận ${money(booking.totalAmount)} ↗</button></div></form>`);
  clearInterval(timer);
  const tick = () => {
    if (!$('#remaining')) return clearInterval(timer);
    const seconds = Math.max(0, Math.ceil((new Date(booking.expiresAt) - Date.now()) / 1000));
    $('#remaining').textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    if (!seconds) $('#pay-now').disabled = true;
  };
  tick();
  timer = setInterval(tick, 1000);
}

function ticketList(tickets, review = false) {
  return tickets.map(ticket => `<p>Ghế <strong>${e(ticket.seatCode)}</strong> · ${e(label(ticket.status))} · Mã soát vé <code>${e(ticket.qrCode)}</code>
    ${review && ticket.status === 'used' ? button('Đánh giá phim', 'review', ticket._id, 'linklike') : ''}</p>`).join('');
}

const receiptCss = `
  .receipt {font: 15px/1.5 system-ui,sans-serif; color:#17152e; background:#fff; border:1px solid #ddd7f2; border-radius:16px; overflow:hidden}
  .receipt-head {padding:20px; background:#24134d; color:white}
  .receipt-head strong {font-size:12px; letter-spacing:.16em}
  .receipt-head h3 {margin:8px 0 4px; font-size:24px; overflow-wrap:anywhere}
  .receipt-status {display:inline-block; padding:4px 9px; border-radius:20px; background:#d7fae4; color:#075735; font-weight:700}
  .receipt-grid {display:grid; grid-template-columns:repeat(auto-fit,minmax(145px,1fr)); gap:14px; margin:0; padding:20px}
  .receipt dt {color:#59556f; font-size:13px}
  .receipt dd {margin:2px 0 0; font-weight:700; overflow-wrap:anywhere}
  .receipt-bottom {padding:16px 20px; border-top:2px dashed #ddd7f2; background:#f7f5ff}
  .receipt-bottom ul {padding-left:20px; margin:6px 0}
  .receipt-bottom code {overflow-wrap:anywhere}
  .receipt-bottom small {display:block; color:#59556f}
`;
const receiptStyle = document.createElement('style');
receiptStyle.textContent = receiptCss;
document.head.append(receiptStyle);
const receiptStatuses = { paid: 'Đã thanh toán', partially_refunded: 'Đã hoàn một phần', refunded: 'Đã hoàn tiền' };
let currentReceipt;

function showReceipt(booking, tickets, fullName) {
  const snapshot = booking.snapshot;
  const cinema = state.catalog.cinemas.find(item => item.name === snapshot.cinemaName);
  const fields = [
    ['Mã đặt vé', booking.bookingCode], ['Họ và tên', fullName],
    ['Rạp', snapshot.cinemaName], ['Địa điểm', cinema?.address || snapshot.cinemaName],
    ['Suất chiếu', time(snapshot.startTime) + ' · ' + date(snapshot.startTime)],
    ['Phòng chiếu', snapshot.roomName], ['Số ghế', booking.seatCodes.join(', ')],
    ['Tổng tiền thanh toán', money(booking.totalAmount)],
  ];
  const markup = `<article class="receipt">
    <div class="receipt-head"><strong>CINEPASS · VÉ ĐIỆN TỬ</strong>
    <h3>${e(snapshot.movieTitle)}</h3><span class="receipt-status">${e(receiptStatuses[booking.status])}</span></div>
    <dl class="receipt-grid">${fields.map(([key, value]) => `<div><dt>${key}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>
    <div class="receipt-bottom"><strong>Mã vé theo ghế</strong>
    <ul>${tickets.map(ticket => `<li>Ghế <b>${e(ticket.seatCode)}</b> · <code>${e(ticket.qrCode)}</code> · ${e(label(ticket.status))}</li>`).join('')}</ul>
    <small>Vé demo · Thanh toán mô phỏng</small></div></article>`;
  currentReceipt = { markup, code: booking.bookingCode };
  panel('Vé điện tử', markup + `<div class="checkout">${button('Lưu vé về máy ↓', 'save-receipt', '', 'primary')}
    ${button('Vé của tôi ↗', 'account')}</div>`);
}

function saveReceipt() {
  if (!currentReceipt) return;
  const { markup, code } = currentReceipt;
  const page = `<!doctype html><html lang="vi"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Vé CinePass ${e(code)}</title>
    <style>${receiptCss} body{max-width:620px;margin:24px auto;padding:0 12px;background:#f5f2fb}</style>
    <body>${markup}</body></html>`;
  const url = URL.createObjectURL(new Blob([page], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'CinePass-' + code.replace(/[^a-z0-9-]/gi, '') + '.html';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function account(data) {
  state.account = data;
  const { profile, tier, bookings, tickets, payments, refunds, points } = data;
  panel('Vé & tài khoản', `<div class="checkout"><strong>${e(profile.fullName)}</strong>
    <form data-form="logout"><button class="soft">Đăng xuất</button></form></div><div class="stats"><div><strong>${e(tier?.name || 'Thành viên')}</strong>Hạng</div>
    <div><strong>${number(profile.pointsBalance)}</strong>Điểm hiện có</div><div><strong>${money(profile.lifetimeSpend)}</strong>Chi tiêu tích lũy</div></div>
    <details class="fold"><summary>Quyền lợi & lịch sử điểm</summary><p>${e(Array.isArray(tier?.benefits) ? tier.benefits.join(' · ') : '')}</p>
    ${points.map(point => `<p>${date(point.createdAt)} · ${e(point.description)} · <strong>${point.points > 0 ? '+' : ''}${point.points}</strong></p>`).join('')}</details>
    <h3>Đơn gần đây</h3><div class="data-list account-list">${bookings.map(booking =>
      `<article class="record"><div class="record-header"><h3>${e(booking.snapshot.movieTitle)}</h3>${tag(booking.status)}</div>
      <p>${e(booking.bookingCode)} · ${e(booking.snapshot.cinemaName)} · ${date(booking.snapshot.startTime)} ${time(booking.snapshot.startTime)}</p>
      <p>Ghế ${e(booking.seatCodes.join(', '))} · <strong>${money(booking.totalAmount)}</strong></p>
      ${booking.status === 'pending' ? `<div class="card-row">${button('Thanh toán', 'resume', booking._id)} ${button('Hủy giữ ghế', 'cancel-review', booking._id, 'danger')}</div>` : ''}
      ${Object.hasOwn(receiptStatuses, booking.status) ? button('Mở vé điện tử', 'receipt', booking._id) : ''}
      <details><summary>Vé, thanh toán và hoàn tiền</summary>
        ${ticketList(tickets.filter(ticket => ticket.bookingId === booking._id), true)}
        ${payments.filter(item => item.bookingId === booking._id).map(item => `<p>Thanh toán · ${e(label(item.method))} · ${e(label(item.status))} · ${money(item.amount)}</p>`).join('')}
        ${refunds.filter(item => item.bookingId === booking._id).map(item => `<p>Hoàn tiền · ${e(label(item.status))} · ${money(item.amount)} · ${e(item.reason)}</p>`).join('')}
      </details></article>`).join('') || empty('Chưa có đơn trong hồ sơ này.')}</div>`, 'HỒ SƠ KHÁCH DEMO', true);
}

function offers() {
  panel('Ưu đãi & bắp nước', `<h3>Mã đang áp dụng</h3><div class="data-list">${state.catalog.promotions.map(promo =>
    `<article class="record"><div class="record-header"><h3>${e(promo.name)}</h3>${tag(promo.code)}</div>
    <p>Đơn từ ${money(promo.minOrder)} · đến ${date(promo.endAt)} · còn ${number(Math.max(0, promo.maxUses - promo.usedCount))} lượt</p></article>`).join('') ||
    empty('Chưa có ưu đãi trong thời gian này.')}</div>
    <details class="fold"><summary>Menu bắp nước</summary>${state.catalog.concessions.map(item =>
      `<div class="food-line"><span>${e(item.name)}</span><strong>${money(item.price)}</strong></div>`).join('')}</details>`);
}
function chart(title, items, key = 'count') {
  const max = Math.max(1, ...items.map(item => item[key]));
  return `<section class="report"><h3>${title}</h3>${items.map(item =>
    `<div class="metric-line"><span>${e(label(item._id))}</span><strong>${key === 'total' ? money(item.total) : number(item.count)}</strong></div>
    <div class="bar" aria-hidden="true"><i style="width:${Math.max(0, item[key] * 100 / max)}%"></i></div>`).join('') || '<p>Chưa có dữ liệu.</p>'}</section>`;
}

function dashboard(data) {
  const gross = data.income.reduce((sum, item) => sum + item.total, 0);
  const refunded = data.refunds.find(item => item._id === 'approved')?.total || 0;
  const fill = data.capacity?.total ? Math.round(data.capacity.sold * 100 / data.capacity.total) : 0;
  panel('Quản trị & báo cáo', `<div class="stats"><div><strong>${money(gross - refunded)}</strong>Thanh toán thành công trừ hoàn đã duyệt</div>
    <div><strong>${number(data.tickets.reduce((sum, item) => sum + item.count, 0))}</strong>Vé trong hệ thống</div>
    <div><strong>${fill}%</strong>Ghế đã bán ở suất đã bắt đầu</div></div>
    <div class="options">${button('Soát vé ↗', 'staff', 'checkin', 'primary')} ${button('Duyệt hoàn vé ↗', 'staff', 'refund')}</div>
    <div class="report-grid">${chart('Giá trị đơn theo rạp', data.revenue, 'total')}
    ${chart('Thanh toán theo phương thức', data.income, 'total')}${chart('Trạng thái đơn', data.bookings)}
    ${chart('Trạng thái vé', data.tickets)}${chart('Hoàn tiền', data.refunds)}
    ${chart('Lượt dùng ưu đãi', data.promos)}${chart('Bắp nước theo giá trị bán', data.food, 'total')}</div>
    <details class="fold"><summary>Bảng quy tắc giá</summary><div class="table-scroll"><table><thead>
    <tr><th>Quy tắc</th><th>Định dạng</th><th>Loại ghế</th><th>Khung giờ</th><th>Giá</th></tr></thead><tbody>
    ${data.prices.map(price => `<tr><td>${e(price.name)}</td><td>${e(price.format)}</td>
    <td>${e(data.types.find(type => type._id === price.seatTypeId)?.name)}</td>
    <td>${e(price.timeFrom || '—')} – ${e(price.timeTo || '—')}</td><td>${money(price.price)}</td></tr>`).join('')}</tbody></table></div></details>
    <details class="fold"><summary>${data.counts.length} collection trong MongoDB</summary>
    <div class="collection-list">${data.counts.map(item => `<div>${e(item.name)} <strong>${number(item.total)}</strong></div>`).join('')}</div></details>`,
    'TỔNG QUAN · DỮ LIỆU MÔ PHỎNG', true);
}

function staffPanel(staff, action) {
  const permission = action === 'refund' ? 'refund_approve' : 'ticket_check';
  panel(action === 'refund' ? 'Duyệt hoàn vé' : 'Soát vé', `<form data-form="${action}"><div class="form-fields">
    <label>Vai trò nhân viên demo <select name="staff" required>${staff.filter(item => item.permissions.includes(permission)).map((item, index) =>
    `<option value="${e(item._id)}">${e(state.catalog.cinemas.find(cinema => cinema._id === item.cinemaId)?.name)} · ${e(item.position)} ${index + 1}</option>`).join('')}</select></label>
    <label>Mã soát vé <input name="code" maxlength="160" required></label>
    ${action === 'refund' ? '<label>Lý do hoàn vé <textarea name="reason" maxlength="250" required></textarea></label>' : ''}
    </div><div class="checkout">${button('Về báo cáo', 'dashboard')}<button class="primary">Xác nhận ↗</button></div></form>`,
    'VAI TRÒ QUẢN TRỊ DEMO');
}

function openAccount() {
  if (!state.identity) return authPanel();
  load('Vé & tài khoản', () => api('account'), account);
}

function openCheckout() {
  if (!state.identity) return authPanel(false, 'checkout');
  load('Hoàn tất đơn', () => api('account'), checkout);
}

document.addEventListener('click', event => {
  const control = event.target.closest('[data-act]');
  if (!control || control.disabled) return;
  const { act, id } = control.dataset;
  if (act === 'close') {
    dialog.close();
    return;
  }
  if (!state.catalog) return;
  switch (act) {
    case 'filter':
      state.filter = id;
      for (const tab of document.querySelectorAll('#tabs button')) tab.setAttribute('aria-pressed', tab === control);
      renderMovies();
      break;
    case 'detail':
      load('Thông tin phim', () => api('movie', { id }), detail);
      break;
    case 'schedule': openSchedule(id); break;
    case 'trailer': {
      const movie = state.catalog.movies.find(item => item._id === id);
      if (movie) showTrailer(movie);
      break;
    }
    case 'schedule-back': drawSchedule(); break;
    case 'day':
      state.day = id;
      drawSchedule();
      break;
    case 'seatmap':
      if (state.show?._id !== id) state.seats.clear();
      load('Chọn ghế', () => api('seats', { id }), drawSeats);
      break;
    case 'seat':
      if (state.seats.has(id)) state.seats.delete(id);
      else if (state.seats.size < 8) state.seats.add(id);
      else return error('Bạn đã chọn tối đa 8 ghế.');
      control.setAttribute('aria-pressed', state.seats.has(id));
      seatTotal();
      break;
    case 'checkout': openCheckout(); break;
    case 'account': openAccount(); break;
    case 'login': authPanel(false, id); break;
    case 'register': authPanel(true, id); break;
    case 'receipt': {
      const booking = state.account.bookings.find(item => item._id === id);
      showReceipt(booking, state.account.tickets.filter(ticket => ticket.bookingId === id), state.account.profile.fullName);
      break;
    }
    case 'save-receipt': saveReceipt(); break;
    case 'resume':
      payment(state.account.bookings.find(booking => booking._id === id));
      break;
    case 'offers': offers(); break;
    case 'cancel-review':
      panel('Hủy giữ ghế?', `<p>Ghế, điểm và lượt ưu đãi của đơn sẽ được trả lại.</p>
        <form data-form="cancel" data-id="${e(id)}" class="checkout">${button('Quay lại', 'account')}<button class="danger">Xác nhận hủy</button></form>`);
      break;
    case 'review':
      panel('Đánh giá phim', `<form data-form="review" data-id="${e(id)}"><div class="form-fields">
        <label>Điểm từ 1 đến 10 <input name="rating" type="number" min="1" max="10" value="8" required></label>
        <label>Nhận xét <textarea name="comment" maxlength="500"></textarea></label></div>
        <div class="checkout">${button('Quay lại', 'account')}<button class="primary">Gửi đánh giá</button></div></form>`);
      break;
    case 'dashboard':
      load('Quản trị & báo cáo', () => api('dashboard'), dashboard);
      break;
    case 'staff':
      load('Nghiệp vụ rạp', () => api('staff'), data => staffPanel(data, id));
      break;
  }
});

content.addEventListener('change', event => {
  if (event.target.id === 'cinema') {
    state.cinema = event.target.value;
    drawSchedule();
  }

});

content.addEventListener('submit', async event => {
  const form = event.target;
  const action = form.dataset.form;
  if (!action) return;
  event.preventDefault();
  if (form.dataset.busy) return;
  form.dataset.busy = 'true';
  const submitter = event.submitter;
  if (submitter) submitter.disabled = true;
  const fields = new FormData(form);
  let input = { booking: form.dataset.id };
  if (action === 'login' || action === 'register') input = Object.fromEntries(fields);
  if (action === 'logout') input = {};
  if (action === 'book') input = { ...input, show: state.show._id, seats: [...state.seats],
    promo: fields.get('promo'), points: Number(fields.get('points')),
    food: [...form.querySelectorAll('[data-item]')].filter(item => Number(item.value) > 0)
      .map(item => ({ id: item.dataset.item, quantity: Number(item.value) })) };
  if (action === 'pay') input.method = fields.get('method');
  if (action === 'review') input = { ...input, ticket: form.dataset.id, rating: Number(fields.get('rating')), comment: fields.get('comment') };
  if (action === 'checkin' || action === 'refund') input = { staff: fields.get('staff'), code: fields.get('code'), reason: fields.get('reason') };
  try {
    const data = await api(action, input, true);
    if (action === 'login' || action === 'register' || action === 'logout') setIdentity(data);
    if (!form.isConnected || !dialog.open) return;
    if (action === 'logout') dialog.close();
    else if (action === 'login' || action === 'register') {
      if (form.dataset.destination === 'checkout') openCheckout();
      else openAccount();
    } else if (action === 'book') payment(data);
    else if (action === 'pay') showReceipt(data.booking, data.tickets, state.identity.fullName);
    else if (action === 'cancel' || action === 'review') openAccount();
    else panel(action === 'refund' ? 'Đã hoàn vé' : 'Đã soát vé',
      `<p class="status-line" role="status">MongoDB đã ghi nhận thao tác.</p>${button('Về báo cáo', 'dashboard')}`);
  } catch (err) {
    if (form.isConnected && dialog.open) error(err.message);
  } finally {
    delete form.dataset.busy;
    if (submitter) submitter.disabled = false;
  }
});

$('#quick-book').addEventListener('submit', event => {
  event.preventDefault();
  openSchedule($('#quick-film').value, $('#quick-cinema').value);
});

dialog.addEventListener('close', () => {
  request++;
  clearInterval(timer);
  if (!dialog.open) {
    currentReceipt = null;
    content.replaceChildren();
  }
});
$('#search').addEventListener('input', () => { if (state.catalog) renderMovies(); });
$('#genre').addEventListener('change', () => { if (state.catalog) renderMovies(); });
Promise.all([api('catalog'), api('me')]).then(([data, identity]) => {
  if (!data.movies.length) throw Error('Chưa có phim trong QLDatVeXemPhim.');
  state.catalog = data;
  setIdentity(identity);
  $('#connection').textContent = '● MONGODB KẾT NỐI';
  $('#hero-index').textContent = `${data.movies.length} PHIM · ${data.cinemas.length} RẠP`;
  const available = data.movies.filter(movie => movie.status === 'now_showing');
  for (const movie of available) $('#quick-film').add(new Option(movie.title, movie._id));
  for (const cinema of data.cinemas) $('#quick-cinema').add(new Option(cinema.name, cinema._id));
  for (const control of $('#quick-book').elements) control.disabled = false;
  const featured = available.find(movie => Object.hasOwn(trailers, movie.slug) && movie.title.length <= 45) ||
    data.movies.find(movie => movie.status === 'now_showing');
  if (featured) {
    $('#hero').insertAdjacentHTML('afterbegin', movieArt(featured, true, true));
    $('#hero-title').textContent = featured.title;
    $('#hero-copy').textContent = featured.synopsis.length > 180 ? featured.synopsis.slice(0, 177) + '…' : featured.synopsis;
    $('#hero [data-act="schedule"]').dataset.id = featured._id;
    $('#hero-trailer').hidden = !Object.hasOwn(trailers, featured.slug);
    $('#hero-trailer').dataset.id = featured._id;
    $('#hero .eyebrow').textContent = 'PHIM NỔI BẬT · ' + (featured.media?.year || '') + ' · ' + featured.durationMin + ' PHÚT';
  }
  for (const genre of data.genres) $('#genre').add(new Option(genre.name, genre._id));
  renderMovies();
}).catch(err => {
  $('#connection').textContent = 'LỖI KẾT NỐI';
  $('#movies').innerHTML = empty(err.message);
});
