import dayjs from 'dayjs';

/**
 * Chuyển đổi timestamp ISO (UTC từ backend) sang giờ địa phương của trình duyệt (UTC+7 tại VN).
 * Tự động gắn 'Z' nếu chuỗi thời gian chưa có định danh múi giờ, giải quyết triệt để lỗi lệch 7 giờ.
 */
export const formatLocalTime = (isoString?: string | null, format = 'HH:mm:ss'): string => {
  if (!isoString) return '-';
  const hasTimezone = isoString.endsWith('Z') || isoString.includes('+') || (isoString.length > 19 && isoString.includes('-', 19));
  const utcString = hasTimezone ? isoString : `${isoString}Z`;
  return dayjs(utcString).format(format);
};
