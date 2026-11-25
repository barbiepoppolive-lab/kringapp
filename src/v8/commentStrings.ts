/** Reel comments (0189). English is the key; Thai below. One language per screen: looked up by L() after the other tables. */
export const KC_L: Record<string, Record<string, string>> = {
  th: {
    'Comments': 'ความคิดเห็น',
    'Comment': 'แสดงความคิดเห็น',
    'No comments yet. Be the first.': 'ยังไม่มีความคิดเห็น มาเป็นคนแรกกันเลย',
    'No comments yet.': 'ยังไม่มีความคิดเห็น',
    'Add a comment…': 'เขียนความคิดเห็น…',
    'Send': 'ส่ง',
    'Delete': 'ลบ',
    'Tap again to delete': 'แตะอีกครั้งเพื่อลบ',
    'Comment deleted': 'ลบความคิดเห็นแล้ว',
    'Report this comment': 'รายงานความคิดเห็นนี้',
    'Rude or harassing': 'หยาบคายหรือคุกคาม',
    'Spam or scam': 'สแปมหรือหลอกลวง',
    'Unsafe or adult': 'ไม่ปลอดภัยหรือเนื้อหาผู้ใหญ่',
    'Cancel': 'ยกเลิก',
    'Thanks. This comment is hidden for you.': 'ขอบคุณนะ ซ่อนความคิดเห็นนี้ให้คุณแล้ว',
    'Turn off comments': 'ปิดความคิดเห็น',
    'Turn on comments': 'เปิดความคิดเห็น',
    'Comments turned off': 'ปิดความคิดเห็นแล้ว',
    'Comments turned on': 'เปิดความคิดเห็นแล้ว',
    'Comments are off for this Reel.': 'รีลนี้ปิดความคิดเห็นอยู่',
    'Face-checked members can comment. Verify your face in 5 seconds to join in.': 'ยืนยันใบหน้าก่อน แล้วคอมเมนต์ได้เลย ใช้แค่ 5 วินาที',
    'Verify': 'ยืนยัน',
    'Sign in to comment': 'เข้าสู่ระบบเพื่อแสดงความคิดเห็น',
    'Make your Kring card to comment': 'ทำการ์ดกริ๊ง! ก่อน แล้วค่อยแสดงความคิดเห็นนะ',
    'Comments aren’t available for this account.': 'บัญชีนี้แสดงความคิดเห็นไม่ได้',
    'This Reel isn’t available any more.': 'รีลนี้ไม่มีแล้ว',
    'Links can’t be posted in comments.': 'ใส่ลิงก์ในความคิดเห็นไม่ได้นะ',
    'Phone numbers can’t be posted in comments.': 'ใส่เบอร์โทรในความคิดเห็นไม่ได้นะ',
    'LINE IDs and other contacts can’t be posted. Say hi on Kring instead.': 'ใส่ไอดีไลน์หรือช่องทางติดต่ออื่นไม่ได้นะ ทักทายกันในกริ๊ง! แทนได้เลย',
    '@usernames can’t be posted in comments.': 'ใส่ @ชื่อผู้ใช้ในความคิดเห็นไม่ได้นะ',
    'Let’s keep it kind. Please reword your comment.': 'พูดกันดี ๆ นะ ลองเขียนใหม่อีกครั้ง',
    'Drinks talk stays out of comments on Kring. Please reword it.': 'กริ๊ง! ไม่ให้พูดถึงเครื่องดื่มมึนเมาในความคิดเห็น ลองเขียนใหม่นะ',
    'Keep it to 300 characters.': 'เขียนได้ไม่เกิน 300 ตัวอักษรนะ',
    'You’ve made 20 comments today. Come back tomorrow!': 'วันนี้คอมเมนต์ครบ 20 ครั้งแล้ว พรุ่งนี้มาใหม่นะ',
    'Wait a few seconds before your next comment.': 'รอสักครู่ก่อนคอมเมนต์ถัดไปนะ',
    'You already posted that comment.': 'คุณคอมเมนต์ข้อความนี้ไปแล้ว',
    'Couldn’t post. Try again.': 'ส่งไม่สำเร็จ ลองอีกครั้งนะ',
    '{0} commented on your Reel': '{0} แสดงความคิดเห็นในรีลของคุณ',
    '{0} and {1} others commented on your Reel': '{0} และอีก {1} คนแสดงความคิดเห็นในรีลของคุณ',
    '{0} replied to your comment': '{0} ตอบกลับความคิดเห็นของคุณ',
    '{0} and {1} others replied to your comment': '{0} และอีก {1} คนตอบกลับความคิดเห็นของคุณ',
    'Reply': 'ตอบกลับ',
    'Replying to {0}': 'กำลังตอบกลับ {0}',
    'Reply to {0}…': 'ตอบกลับ {0}…',
    'View {0} replies': 'ดูการตอบกลับ {0} รายการ',
    'Hide replies': 'ซ่อนการตอบกลับ',
    'Stop replying': 'เลิกตอบกลับ',
    'This comment isn’t here any more.': 'ความคิดเห็นนี้ไม่มีแล้ว',
    'Kring Team': 'ทีมกริ๊ง!',
    'now': 'ตอนนี้',
  },
};

/** the friendly line for a refused comment (server reason → English key) */
export function commentReasonText(reason: string): string {
  switch (reason) {
    case 'link': return 'Links can’t be posted in comments.';
    case 'phone': return 'Phone numbers can’t be posted in comments.';
    case 'contact': return 'LINE IDs and other contacts can’t be posted. Say hi on Kring instead.';
    case 'handle': return '@usernames can’t be posted in comments.';
    case 'rude': return 'Let’s keep it kind. Please reword your comment.';
    case 'alcohol': return 'Drinks talk stays out of comments on Kring. Please reword it.';
    case 'long': return 'Keep it to 300 characters.';
    case 'daily': return 'You’ve made 20 comments today. Come back tomorrow!';
    case 'slow': return 'Wait a few seconds before your next comment.';
    case 'repeat': return 'You already posted that comment.';
    case 'verify': return 'Face-checked members can comment. Verify your face in 5 seconds to join in.';
    case 'signin': return 'Sign in to comment';
    case 'no_card': return 'Make your Kring card to comment';
    case 'off': return 'Comments are off for this Reel.';
    case 'no_reel': return 'This Reel isn’t available any more.';
    case 'banned': return 'Comments aren’t available for this account.';
    case 'gone': return 'This comment isn’t here any more.';
    default: return 'Couldn’t post. Try again.';
  }
}
