/**
 * Helper functions để parse email từ Gmail API
 */

/**
 * Decode Base64URL của Gmail về UTF-8
 */
export function decodeBase64(encodedString: string): string {
  if (!encodedString) return '';
  // Gmail dùng Base64URL (thay + bằng -, thay / bằng _)
  const base64 = encodedString.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Tìm header theo tên (case-insensitive)
 */
export function getHeader(headers: any[], name: string): string | undefined {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value;
}

/**
 * Parse email message từ Gmail API response thành format dễ sử dụng
 */
export function parseEmailMessage(messageDetail: any) {
  const payload = messageDetail.payload;
  const headers = payload?.headers || [];

  // 1. Lấy thông tin Header quan trọng
  const subject = getHeader(headers, 'Subject') || '(No Subject)';
  const from = getHeader(headers, 'From') || '(Unknown)';
  const to = getHeader(headers, 'To') || '';
  const cc = getHeader(headers, 'Cc') || '';
  const bcc = getHeader(headers, 'Bcc') || '';
  const date = getHeader(headers, 'Date');
  const messageId = getHeader(headers, 'Message-ID');

  // 2. Tìm nội dung Body (HTML và Text)
  let htmlBody = '';
  let textBody = '';
  let attachments: any[] = [];

  // Helper function để tìm body và attachments recursively
  const extractParts = (part: any) => {
    if (!part) return;

    const mimeType = part.mimeType;
    const filename = part.filename;

    // Nếu là attachment (có filename và không phải inline)
    if (part.body?.attachmentId) {
      // Accept attachments that may not have a filename (some providers omit filename)
      attachments.push({
        filename: filename || '',
        mimeType: mimeType,
        attachmentId: part.body.attachmentId,
        size: part.body.size
      });
    }
    // Nếu là HTML body
    else if (mimeType === 'text/html' && part.body?.data) {
      htmlBody = decodeBase64(part.body.data);
    }
    // Nếu là Text body
    else if (mimeType === 'text/plain' && part.body?.data) {
      textBody = decodeBase64(part.body.data);
    }
    // Nếu có parts con (multipart), đệ quy vào
    else if (part.parts && Array.isArray(part.parts)) {
      part.parts.forEach(extractParts);
    }
  };

  // Trường hợp 1: Email đơn giản (không có parts)
  if (payload.body?.data) {
    if (payload.mimeType === 'text/html') {
      htmlBody = decodeBase64(payload.body.data);
    } else {
      textBody = decodeBase64(payload.body.data);
    }
  }
  // Trường hợp 2: Email multipart
  else if (payload.parts) {
    payload.parts.forEach(extractParts);
  }

  // 3. Trả về object gọn gàng cho Frontend
  return {
    id: messageDetail.id,
    threadId: messageDetail.threadId,
    labelIds: messageDetail.labelIds || [],
    snippet: messageDetail.snippet,
    subject: subject,
    from: from,
    to: to,
    cc: cc,
    bcc: bcc,
    date: date,
    messageId: messageId,
    htmlBody: htmlBody,
    textBody: textBody,
    attachments: attachments,
    sizeEstimate: messageDetail.sizeEstimate,
    historyId: messageDetail.historyId,
    internalDate: messageDetail.internalDate,
    // Giữ raw payload nếu frontend cần xử lý thêm
    raw: messageDetail
    ,
    hasAttachment: attachments.length > 0
  };
}
