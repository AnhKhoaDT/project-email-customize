// file: types/index.ts

export interface User {
  name: string;
  email: string;
  avatar: string; // Sửa lỗi chính tả avartar -> avatar
}

// Đổi tên MailList thành Mail để dùng chung cho cả app
export interface Mail {
  id: string;
  threadId: string; // Thêm trường này vì MockData có
  labelIds: string[]; // Thêm trường này
  snippet: string; // Thêm trường này (quan trọng cho MailContent)

  from: string;
  to: string;
  subject: string;
  date: string;

  // Nội dung mail có thể là body hoặc htmlBody tùy nguồn dữ liệu
  // Để optional (?) để linh hoạt
  body?: string;
  htmlBody?: string;
  textBody?: string;

  isUnread: boolean;
  isStarred: boolean;
  hasAttachment?: boolean;
}
