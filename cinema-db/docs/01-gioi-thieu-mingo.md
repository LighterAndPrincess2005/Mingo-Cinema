# Giới thiệu Mingo

Nội dung tổng hợp từ tài liệu chính thức tại [mingo.io/docs](https://mingo.io/docs/overview), đọc ngày 05/11/2026. Đề tài thực hiện với Mingo 2026.2.0.

## Mingo là gì

Mingo là ứng dụng desktop để quản trị MongoDB, xây dựng trên Electron, chạy trên Windows, macOS và Linux. Mingo kết nối trực tiếp tới server, dùng được với MongoDB local, Atlas, DocumentDB và FerretDB.

Không nhầm với thư viện JavaScript `mingo`, là thư viện chạy truy vấn kiểu MongoDB trên dữ liệu trong bộ nhớ.

## Tính năng dùng cho đề tài

| Tính năng | Tác dụng | Dùng trong đề tài |
|---|---|---|
| Documents | Duyệt, lọc, sửa, chèn document | Xem dữ liệu 20 collection |
| Indexes | Xem kích thước, số lần dùng, tạo và xóa index | Kiểm tra 55 index có được dùng không |
| Schema (Schema Analyzer) | Lấy mẫu document, thống kê trường và kiểu dữ liệu | Kiểm tra dữ liệu đồng nhất |
| Aggregator (Aggregation Builder) | Dựng pipeline theo từng stage, xem trước kết quả từng stage | Chạy 10 truy vấn khai thác |
| Data Relations | Khai báo quan hệ giữa các collection, mở nhanh document liên quan, phát hiện tham chiếu mồ côi | Bù cho việc MongoDB không có khóa ngoại |
| Dashboard | Tạo widget Number hoặc Chart từ aggregation | Bảng số liệu tổng quan |
| Export, Import | Xuất và nhập dữ liệu từng collection | Trích dữ liệu báo cáo |
| Compare & Sync | So sánh và đồng bộ collection, khớp theo `_id` | So sánh hai bản database |
| Dump & Restore | Sao lưu và phục hồi | Sao lưu database |
| NodeShell | Chạy JavaScript trên database | Viết tác vụ nhỏ ngay trong Mingo |

Định dạng dữ liệu theo tài liệu Mingo:

- **Export:** CSV/TSV, JSON, JavaScript Objects, BSON.
- **Import:** CSV/TSV, JSON, JavaScript Objects, JSONL.

## Giới hạn cần biết

- **Không có schema validation:** tài liệu Mingo không đề cập `$jsonSchema`, nên validator được tạo bằng `mongosh`.
- **Partial index:** form Create Index trong tài liệu chỉ liệt kê Unique, Sparse, TTL, Background, Hidden, Name. Các unique partial index của đề tài được tạo bằng `mongosh`.
- **NodeShell không phải mongosh:** tài liệu Mingo nói rõ điều này, nên các script của đề tài chạy bằng `mongosh` ngoài terminal.
- **Dump & Restore cần công cụ ngoài:** phải cài `mongodump` và `mongorestore` (MongoDB Database Tools). Máy thực hiện đề tài chưa cài hai công cụ này.
- **Một số thao tác không có đường lui:** Truncate và Drop collection không hoàn tác được.
- **Sửa tay có thể làm lệch dữ liệu:** sửa inline lưu ngay lập tức. Validator vẫn chặn sai kiểu, nhưng không chặn lệch giữa các collection. Sau khi sửa tay nên chạy lại `06_verify.js`.

## Bản quyền

Mingo cho dùng thử 31 ngày, sau đó phải mua: €7/tháng, €60/năm, hoặc €299 trọn đời, chưa gồm VAT. Cần tính thời hạn dùng thử vào lịch demo.
