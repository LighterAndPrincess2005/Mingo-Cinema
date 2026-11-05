# Kế hoạch ứng dụng minh họa

Database đã xong và đạt 175/175 kiểm tra. Ứng dụng **chưa bắt đầu**, cần làm trước phần A (chuẩn bị database cho ứng dụng) trong [06-viec-con-lai.md](06-viec-con-lai.md).

Lựa chọn đã chốt: Express + React, phân hệ khách hàng + quản trị, đăng nhập thật, thanh toán giả lập.

## Kiến trúc

```
app/
  server/            Express + MongoDB driver
    src/{routes,middleware,services,jobs}
    test/
  client/            React + Vite
    src/{pages,components,api}
```

| Lớp | Công nghệ |
|---|---|
| Backend | Express 5, `mongodb`, `zod`, `bcryptjs`, `jsonwebtoken`, `helmet`, `express-rate-limit`, `cookie-parser` |
| Frontend | React, Vite, React Router, TanStack Query, Tailwind, Recharts, `qrcode.react` |
| Kiểm thử | `node:test` + `supertest` |

## Nguyên tắc backend

- Route chỉ kiểm tra đầu vào và phân quyền, nghiệp vụ nằm ở `flows`. Lỗi `bizCode` chuyển thành HTTP 400/403/409 kèm thông báo tiếng Việt.
- Mọi đầu vào qua `zod`, nên không thể chèn toán tử MongoDB qua body hay query.
- `userId` lấy từ token, không nhận từ client. Giá và tổng tiền luôn tính ở server.
- JWT nằm trong cookie `httpOnly`, `SameSite=Lax`. Có giới hạn số lần đăng nhập. Tài khoản `locked` không đăng nhập được.
- `JWT_SECRET` đặt trong `.env`, kèm `.env.example`. Không đưa `.env` vào git.
- Job chạy mỗi 60 giây gọi `expireOverdueBookings` để trả ghế.

## Phân hệ khách hàng

| Trang | Chức năng | Điểm khai thác MongoDB |
|---|---|---|
| Trang chủ | Phim đang/sắp chiếu, lọc thể loại, tìm kiếm | Text index, multikey index |
| Chi tiết phim | Thông tin, đánh giá, suất theo ngày và thành phố | `ratingSummary`, `$lookup` |
| Đăng ký, đăng nhập | Tài khoản khách | Unique email, phone |
| Chọn ghế | Sơ đồ ghế, cập nhật 5 giây/lần | Ghế embed, giữ ghế nguyên tử |
| Thanh toán | Bắp nước, mã giảm giá, điểm, đếm ngược 10 phút, chọn kết quả thành công/thất bại | Idempotency, snapshot |
| Vé của tôi | Danh sách đơn, mã QR | Snapshot, không cần `$lookup` |
| Tài khoản | Hạng, số điểm, lịch sử điểm | Sổ cái `loyalty_transactions` |
| Đánh giá | Chỉ hiện với vé đã soát | Unique `{movieId, userId}` |

## Phân hệ quản trị

Phân quyền theo `staff.permissions`. Quản lý rạp chỉ thấy rạp mình, `admin` thấy toàn chuỗi.

| Trang | Quyền | Chức năng |
|---|---|---|
| Dashboard | `showtime_manage`, `report_all` | Doanh thu theo ngày/phim/rạp, tỷ lệ lấp đầy, bắp nước, hiệu quả khuyến mãi |
| Suất chiếu | `showtime_manage` | Xem, tạo suất (báo lỗi khi chồng lịch), xem giá áp dụng, hủy suất chưa có vé |
| Soát vé | `ticket_check` | Nhập mã QR, báo vé hợp lệ/đã dùng/sai rạp |
| Hoàn tiền | `refund_approve` | Tìm đơn, chọn vé, duyệt hoặc từ chối |

## API chính

| Nhóm | Endpoint |
|---|---|
| Auth | `POST /api/auth/register`, `/login`, `/staff/login`, `/logout`, `GET /api/auth/me` |
| Công khai | `GET /api/movies`, `/movies/:id`, `/movies/:id/reviews`, `/genres`, `/cinemas`, `/showtimes`, `/showtimes/:id/seats`, `/concessions` |
| Khách | `POST /api/bookings`, `/bookings/:id/pay`, `/bookings/:id/cancel`, `GET /api/me/bookings`, `/me/loyalty`, `POST /api/reviews` |
| Quản trị | `GET /api/admin/reports/*`, `GET/POST /api/admin/showtimes`, `POST /api/admin/showtimes/:id/cancel`, `POST /api/admin/check-in`, `GET /api/admin/bookings`, `POST /api/admin/refunds`, `/refunds/reject` |

`GET /showtimes/:id/seats` chỉ trả mã ghế, loại, giá và trạng thái, không trả `holdToken` hay `bookingId`. Ghế `held` đã quá `holdUntil` hiển thị là trống.

## Thứ tự làm

1. Dựng server: kết nối, xử lý lỗi, auth, phân quyền.
2. API công khai và luồng đặt vé, kèm test.
3. API quản trị và báo cáo, kèm test.
4. Client: khung, trang công khai, luồng đặt vé.
5. Client: vé của tôi, tài khoản, đánh giá.
6. Client: phân hệ quản trị và dashboard.
7. Viết kịch bản demo: đặt vé trong app rồi mở Mingo xem document đổi, dựng pipeline ở Aggregator rồi đối chiếu với dashboard.

## Kiểm thử

**API**, chạy trên database riêng `QLDatVeXemPhim_test`:

- 20 yêu cầu song song đặt cùng một ghế: đúng 1 thành công, 19 nhận 409.
- 10 yêu cầu song song dùng mã còn 1 lượt: đúng 1 thành công.
- Gửi lại thanh toán cùng khóa: không sinh thêm payment, vé, điểm.
- Soát vé song song: đúng 1 thành công.
- Khách gọi API quản trị nhận 403, chưa đăng nhập nhận 401.
- Quản lý rạp A không hoàn được vé rạp B. Khách không xem được đơn người khác.
- Đầu vào `{"$gt": ""}` khi đăng nhập bị từ chối.
- Client gửi giá giả không làm đổi tổng tiền.

**Giao diện:** đi hết luồng đăng ký → chọn ghế → thanh toán → vé → soát vé → đánh giá, ca thanh toán thất bại, hết hạn giữ ghế, hoàn vé. Số liệu dashboard khớp `05_sample_queries.js`. Hiển thị được ở độ rộng điện thoại.

## Ngoài phạm vi

Cổng thanh toán thật, gửi email, quét QR bằng camera, quản lý phim/giá/khuyến mãi/nhân viên trên giao diện, WebSocket, triển khai lên server, chuyển MongoDB sang replica set.
