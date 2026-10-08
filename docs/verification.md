# Kiểm chứng TheAnHR

## Đã chạy

- TDD trước triển khai: lưu trữ/parser ban đầu 17 ca thất bại do chức năng chưa có; sau triển khai 19/19 đạt.
- Sao lưu: ca khôi phục đầy đủ thất bại trước triển khai; sau triển khai 3/3 đạt.
- Snapshot xuất: ca chốt dữ liệu thất bại trước triển khai; sau triển khai 2/2 đạt.
- Bộ kiểm thử tích hợp hiện tại: 72/72 đạt (store, OCR parser, backup, snapshot, exporter, renderer, images).
- TypeScript kiểm tra toàn bộ src: đạt.
- Electron-vite build: đạt.

## Quyết định triển khai

- SQLite dùng node:sqlite tích hợp Node 24/Electron 44, không dùng native addon để tránh vấn đề ABI.
- Bản tham chiếu chỉ cung cấp bố cục, thông tin công ty và người ký mặc định; nhân viên thật và ảnh trong mẫu không đưa vào fixtures/source.
- Giới hạn ảnh: 20 MB/file và 40 triệu pixel; xuất 500 người/100 MB ảnh; sao lưu 512 MB để tránh hết RAM.
- Ngày chuyển có hiệu lực ngay, không cho chọn tương lai; lịch sử có khoảng thời gian [ngày bắt đầu, ngày kết thúc).
- File xuất chưa có chữ ký số mật mã; ảnh chữ ký là nội dung trình bày theo yêu cầu.

## Cần hoàn thành trong phiên triển khai

- Chạy kiểm thử desktop thực tế và bản đóng gói.
- Kiểm tra ảnh render các tài liệu nhiều trang.
- Rà soát độc lập và sửa vấn đề quan trọng.

