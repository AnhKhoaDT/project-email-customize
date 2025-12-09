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

export interface Header {
  name: string;
  value: string;
}

export interface Body {
  size: number;
  data?: string; // Trường này có thể không tồn tại ở level cao nhất hoặc chứa base64 string
}

export interface Payload {
  partId: string;
  mimeType: string;
  filename: string;
  headers: Header[];
  body: Body;
  parts?: Payload[]; // Cấu trúc đệ quy: một phần (part) có thể chứa nhiều phần con
}

export interface RawMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: Payload;
}

export interface EmailData {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  subject: string;
  from: string;
  to: string;
  cc: string;
  bcc: string;
  date: string;
  messageId: string;
  htmlBody: string;
  textBody: string;
  attachments: any[]; // Mảng rỗng trong data mẫu, thường sẽ là object chứa attachmentId
  sizeEstimate: number;
  historyId: string;
  internalDate: string; // Lưu ý: Trong JSON là chuỗi (string), dù giá trị giống số
  raw: RawMessage;
}

export interface NavItem {
  title: string;
  path: string;
  // input className
  icon: React.ComponentType<{ className?: string }>;
  isActive?: boolean;
}
