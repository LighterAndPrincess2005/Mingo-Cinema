# CinePass · MongoDB

CinePass và Mingo cùng đọc database `QLDatVeXemPhim` tại `127.0.0.1:27017`.

## Chạy

Cần Node.js 22+ và mongosh trong PATH. Khởi động MongoDB, chạy `Chay-CinePass.cmd` hoặc `node server.mjs`, rồi mở http://127.0.0.1:8765/. Giữ máy chủ chạy khi sử dụng web.

## Danh mục phim và ảnh

30 phim thật lấy từ API NguonC, https://phim.nguonc.com/api. Mỗi document `movies` chứa cùng một bộ tên phim, tên gốc, slug, nội dung, thời lượng, ê-kíp và cặp ảnh của đúng phim.

- `posterUrl` là ảnh dọc cho thẻ phim.
- `backdropUrl` là ảnh ngang cho banner và chi tiết.
- `media.id`, `media.slug`, `media.apiUrl` ghi nguồn chính xác.
- `media.posterSize` và `media.backdropSize` là kích thước đã kiểm tra. Ở các bản ghi NguonC hiện tại, `thumb_url` là ảnh dọc và `poster_url` là ảnh ngang.
- Giao diện chỉ hiển thị ảnh khi tên và slug của `media` khớp với phim. Ảnh lỗi có nền dự phòng.

Trình duyệt tải ảnh từ `img.nguonc.com`. Metadata được lưu trong MongoDB, nên danh mục không cần gọi API bên ngoài mỗi lần tải trang.

## Nhập trên database mẫu gốc

Với bản xuất trong thư mục `cinema-db/database`, nhập theo hướng dẫn của thư mục đó. Sau đó, tại thư mục web, chạy:

```powershell
mongosh --quiet --file import-media.js
```

Script sử dụng `data/nguonc-films.json`, kiểm tra 30 mã phim, cặp ảnh và chồng lịch trước khi ghi. Script sao lưu metadata cũ trong `backups/`, thêm trường ảnh vào validator và cập nhật metadata của 30 document theo `_id` đã có. Tên phim trong các snapshot suất chiếu và đơn mẫu cũng được đồng bộ. Giờ kết thúc suất được tính lại từ thời lượng phim nguồn.

Có thể chạy lại trên cùng database. Dữ liệu không gán lại bằng thứ tự sau lần nhập đầu. Mã phim đích được lưu cố định ở `movieId` trong JSON.

## Trình diễn

1. Tìm phim theo tên tiếng Việt hoặc tên gốc, lọc thể loại và trạng thái.
2. Mở chi tiết, chọn ngày, rạp, suất và ghế. Đăng ký tài khoản mới hoặc đăng nhập trước khi giữ ghế.
3. Thêm bắp nước, ưu đãi hoặc đổi điểm, xác nhận giữ ghế rồi thanh toán mô phỏng.
4. Mở **Vé & tài khoản** để xem vé, thanh toán, hoàn tiền và lịch sử điểm.
5. Mở **Quản trị & báo cáo** ở chân trang để xem số liệu, giá, soát vé và duyệt hoàn vé.
6. Trong Mingo, mở **Localhost → QLDatVeXemPhim → movies** để xem trường `media` và các đường dẫn ảnh.

Lịch chiếu, trạng thái đang/sắp chiếu, định dạng, phân loại tuổi và đánh giá là dữ liệu demo phục vụ đề tài. Năm phát hành, tên, nội dung, thời lượng, tên ê-kíp và ảnh lấy từ NguonC. Dữ liệu lịch chiếu hiện kéo dài tới 12/11/2026.

## Kiểm tra

`node --test tests/media.test.mjs` kiểm tra danh mục có 30 danh tính riêng, ảnh ngang/dọc và từ chối ảnh không khớp phim.

Sau khi nhập metadata, `mongosh --quiet --file tests/verify-media-db.js` đối chiếu tên, ảnh, thời lượng suất chiếu và các đơn mẫu với dữ liệu nguồn.

Tài khoản mới bắt đầu ở hạng Thành viên và có 0 điểm. Tài khoản khách mẫu trong bản xuất chỉ dùng để minh họa dữ liệu giao dịch. Phiên đăng nhập có hiệu lực tối đa 8 giờ và kết thúc khi khởi động lại máy chủ. Quản trị dùng vai trò nhân viên mẫu và thanh toán là mô phỏng.
