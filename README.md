# Mingo Cinema

Đề tài NoSQL minh họa quản lý đặt vé xem phim bằng MongoDB, Mingo và web CinePass.

- [CinePass-MongoDB](CinePass-MongoDB/) chứa mã nguồn web.
- [cinema-db](cinema-db/) chứa dữ liệu mẫu, schema, index, script và tài liệu.
- [Tải bản nén database](QLDatVeXemPhim-2026-11-05.zip) gồm 20 collection, 17.748 document và script nhập lại.

## Chạy trên Windows

1. Khởi động MongoDB tại `127.0.0.1:27017`. Cài Node.js 22+ và mongosh, rồi kiểm tra cả hai có trong PATH.
2. Nếu database `QLDatVeXemPhim` chưa có dữ liệu, mở terminal tại `cinema-db` và chạy `mongosh --quiet --file scripts/import_data.js`.
3. Mở `CinePass-MongoDB/Chay-CinePass.cmd` và truy cập http://127.0.0.1:8765/.
4. Kết nối Mingo với `mongodb://127.0.0.1:27017` và mở database `QLDatVeXemPhim`.

Danh mục gồm 30 phim thật lấy thông tin từ NguonC. MongoDB lưu dữ liệu phim và đường dẫn ảnh. Lịch chiếu, đặt vé và thanh toán dùng dữ liệu demo.
