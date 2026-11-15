export type V8Lang = 'en' | 'th' | 'zh' | 'hi' | 'ja' | 'ko';

export interface V8Strings {
  feed: string;
  people: string;
  deals: string;
  me: string;
  sayHi: string;
  save: string;
  saved: string;
  share: string;
  searchPlaceholder: string;
  filter: string;
  all: string;
  coffee: string;
  food: string;
  fun: string;
  todaysTreat: string;
  claimTwoTaps: string;
  claimedShowCounter: string;
  readyToUse: string;
  showCode: string;
  editProfile: string;
  shareCard: string;
  myCode: string;
  nextLevel: string;
  savedPlacesPosts: string;
  rewardsPassport: string;
  settings: string;
  language: string;
  morningNotif: string;
  calmColours: string;
  safety: string;
  privacyPdpa: string;
  signOut: string;
  messages: string;
  todaysPlan: string;
  publicPlaceJustYouTwo: string;
  peopleSaidHi: string;
  oneAtATime: string;
  review: string;
  notNow: string;
  reply: string;
  sendHello: string;
  oneMessageRule: string;
  hereNow: string;
  verifiedLabel: string;
  onlineNow: string;
  traveller: string;
  thaiLocal: string;
  offlineBanner: string;
  retry: string;
  emptyPeopleTitle: string;
  emptyPeopleSub: string;
  emptySavedTitle: string;
  emptySavedSub: string;
  emptyChatTitle: string;
  emptyChatSub: string;
}

export const V8_STRINGS: Record<V8Lang, V8Strings> = {
  en: {
    feed: 'Feed',
    people: 'People',
    deals: 'Deals',
    me: 'Me',
    sayHi: 'Say hi',
    save: 'Save',
    saved: 'Saved',
    share: 'Share',
    searchPlaceholder: 'Search people',
    filter: 'Filter',
    all: 'All',
    coffee: 'Coffee',
    food: 'Food',
    fun: 'Fun',
    todaysTreat: "Today's Kring treat",
    claimTwoTaps: 'Claim · 2 taps',
    claimedShowCounter: 'Claimed · show at counter',
    readyToUse: 'Ready to use',
    showCode: 'Show code',
    editProfile: 'Edit profile',
    shareCard: 'Share card',
    myCode: 'My code',
    nextLevel: 'Next: Thai tea level',
    savedPlacesPosts: 'Saved places and posts',
    rewardsPassport: 'Rewards and passport',
    settings: 'Settings',
    language: 'Language',
    morningNotif: 'Morning "Today in Bangkok" · 8:00',
    calmColours: 'Calm colours',
    safety: 'Safety',
    privacyPdpa: 'Privacy and your data (PDPA)',
    signOut: 'Sign out',
    messages: 'Messages',
    todaysPlan: "Today's plan",
    publicPlaceJustYouTwo: 'Public places · In groups · Chats translated',
    peopleSaidHi: 'people said hi',
    oneAtATime: 'One at a time · reply only if you want',
    review: 'Review',
    notNow: 'Not now',
    reply: 'Reply',
    sendHello: 'Send hello · กริ๊ง!',
    oneMessageRule: 'You can send one friendly message. When they reply, full chat opens.',
    hereNow: 'Here now',
    verifiedLabel: 'verified',
    onlineNow: 'Online now',
    traveller: 'Traveller',
    thaiLocal: 'Thai local',
    offlineBanner: 'You are offline · queued hellos and questions will send when back online',
    retry: 'Retry',
    emptyPeopleTitle: 'No one fits this filter yet',
    emptyPeopleSub: 'Try clearing a filter or check back this evening when more people are online in Bangkok.',
    emptySavedTitle: 'Nothing saved yet',
    emptySavedSub: 'Tap the bookmark on any Feed photo or place to keep it here for your trip.',
    emptyChatTitle: 'No conversations yet',
    emptyChatSub: 'Tap Say hi on a Reel or in People to send your first friendly hello.',
  },
  th: {
    feed: 'ฟีด',
    people: 'ผู้คน',
    deals: 'ดีล',
    me: 'ฉัน',
    sayHi: 'ทักทาย',
    save: 'บันทึก',
    saved: 'บันทึกแล้ว',
    share: 'แชร์',
    searchPlaceholder: 'ค้นหาผู้คน',
    filter: 'ตัวกรอง',
    all: 'ทั้งหมด',
    coffee: 'กาแฟ',
    food: 'อาหาร',
    fun: 'กิจกรรม',
    todaysTreat: 'ดีลพิเศษจากกริ๊งวันนี้',
    claimTwoTaps: 'รับสิทธิ์ · 2 แตะ',
    claimedShowCounter: 'รับสิทธิ์แล้ว · แสดงที่เคาน์เตอร์',
    readyToUse: 'พร้อมใช้งาน',
    showCode: 'แสดงรหัส',
    editProfile: 'แก้ไขโปรไฟล์',
    shareCard: 'แชร์การ์ด',
    myCode: 'คิวอาร์ของฉัน',
    nextLevel: 'ถัดไป: ระดับชาไทย',
    savedPlacesPosts: 'สถานที่และโพสต์ที่บันทึกไว้',
    rewardsPassport: 'รางวัลและพาสปอร์ต',
    settings: 'การตั้งค่า',
    language: 'ภาษา',
    morningNotif: 'แจ้งเตือน "วันนี้ในกรุงเทพฯ" · 8:00',
    calmColours: 'โทนสีสุภาพ',
    safety: 'ความปลอดภัย',
    privacyPdpa: 'ความเป็นส่วนตัวและข้อมูลของคุณ (PDPA)',
    signOut: 'ออกจากระบบ',
    messages: 'ข้อความ',
    todaysPlan: 'แพลนวันนี้',
    publicPlaceJustYouTwo: 'ที่สาธารณะ · เป็นกลุ่ม · แชทแปลให้',
    peopleSaidHi: 'คนทักทายคุณ',
    oneAtATime: 'ดูทีละคน · ตอบกลับเฉพาะคนที่คุณอยากคุย',
    review: 'เปิดดู',
    notNow: 'ไว้ก่อน',
    reply: 'ตอบกลับ',
    sendHello: 'ส่งคำทักทาย · กริ๊ง!',
    oneMessageRule: 'ส่งข้อความทักทายได้ 1 ครั้ง เมื่ออีกฝ่ายตอบกลับ แชทเต็มจะเปิดทันที',
    hereNow: 'อยู่ที่นี่ตอนนี้',
    verifiedLabel: 'ยืนยันตัวตนแล้ว',
    onlineNow: 'ออนไลน์ตอนนี้',
    traveller: 'นักเดินทาง',
    thaiLocal: 'คนไทยในพื้นที่',
    offlineBanner: 'คุณออฟไลน์อยู่ · คำทักทายและคำถามจะส่งอัตโนมัติเมื่อกลับมาออนไลน์',
    retry: 'ลองใหม่',
    emptyPeopleTitle: 'ยังไม่พบผู้คนที่ตรงกับตัวกรองนี้',
    emptyPeopleSub: 'ลองล้างตัวกรอง หรือกลับมาดูอีกครั้งช่วงเย็นเมื่อมีคนออนไลน์มากขึ้น',
    emptySavedTitle: 'ยังไม่มีรายการที่บันทึกไว้',
    emptySavedSub: 'แตะปุ่มบันทึกบนรูปในฟีดเพื่อเก็บสถานที่ที่คุณสนใจไว้ดูภายหลัง',
    emptyChatTitle: 'ยังไม่มีข้อความสนทนา',
    emptyChatSub: 'แตะ “ทักทาย” บนรีลหรือหน้าผู้คน เพื่อส่งคำทักทายแรกของคุณ',
  },
  zh: {
    feed: '动态',
    people: '新朋友',
    deals: '特惠',
    me: '我的',
    sayHi: '打招呼',
    save: '收藏',
    saved: '已收藏',
    share: '分享',
    searchPlaceholder: '搜索用户',
    filter: '筛选',
    all: '全部',
    coffee: '咖啡',
    food: '美食',
    fun: '玩乐',
    todaysTreat: '今日 Kring 专属礼遇',
    claimTwoTaps: '领取 · 轻点两下',
    claimedShowCounter: '已领取 · 柜台出示',
    readyToUse: '可使用',
    showCode: '出示券码',
    editProfile: '编辑资料',
    shareCard: '分享名片',
    myCode: '我的二维码',
    nextLevel: '下一等级：泰式奶茶',
    savedPlacesPosts: '收藏的地点与动态',
    rewardsPassport: '奖励与旅行护照',
    settings: '设置',
    language: '语言',
    morningNotif: '早间“曼谷今日指南” · 8:00',
    calmColours: '柔和色彩模式',
    safety: '安全中心',
    privacyPdpa: '隐私与个人数据 (PDPA)',
    signOut: '退出登录',
    messages: '消息',
    todaysPlan: '今日行程',
    publicPlaceJustYouTwo: '公共场所 · 结伴成群 · 聊天自动翻译',
    peopleSaidHi: '人向你打招呼',
    oneAtATime: '逐一查看 · 仅回复你想聊的人',
    review: '查看',
    notNow: '暂不',
    reply: '回复',
    sendHello: '发送问候 · กริ๊ง!',
    oneMessageRule: '你可以发送一条友好问候，对方回复后即可开启完整对话。',
    hereNow: '正在此处',
    verifiedLabel: '已认证',
    onlineNow: '当前在线',
    traveller: '旅行者',
    thaiLocal: '泰国当地人',
    offlineBanner: '当前处于离线状态 · 问候和提问将在恢复网络后自动发送',
    retry: '重试',
    emptyPeopleTitle: '暂无符合该筛选条件的人',
    emptyPeopleSub: '尝试清除筛选条件，或稍晚些时候再来看看。',
    emptySavedTitle: '暂无收藏内容',
    emptySavedSub: '点击动态上的书签图标即可收藏喜欢的咖啡馆和地点。',
    emptyChatTitle: '暂无对话',
    emptyChatSub: '点击短视频或人物卡片上的「打招呼」发送第一声问候。',
  },
  hi: {
    feed: 'फ़ीड',
    people: 'लोग',
    deals: 'डील्स',
    me: 'प्रोफ़ाइल',
    sayHi: 'नमस्ते कहें',
    save: 'सेव करें',
    saved: 'सेव किया गया',
    share: 'शेयर',
    searchPlaceholder: 'लोग खोजें',
    filter: 'फ़िल्टर',
    all: 'सभी',
    coffee: 'कॉफ़ी',
    food: 'खाना',
    fun: 'मनोरंजन',
    todaysTreat: 'आज की Kring डील',
    claimTwoTaps: 'क्लेम करें · 2 टैप',
    claimedShowCounter: 'क्लेम किया गया · काउंटर पर दिखाएं',
    readyToUse: 'उपयोग के लिए तैयार',
    showCode: 'कोड दिखाएं',
    editProfile: 'प्रोफ़ाइल बदलें',
    shareCard: 'कार्ड शेयर करें',
    myCode: 'मेरा कोड',
    nextLevel: 'अगला स्तर: थाई टी',
    savedPlacesPosts: 'सेव की गई जगहें और पोस्ट',
    rewardsPassport: 'रिवॉर्ड्स और पासपोर्ट',
    settings: 'सेटिंग्स',
    language: 'भाषा',
    morningNotif: 'सुबह "आज बैंकॉक में" · 8:00',
    calmColours: 'शांत रंग मोड',
    safety: 'सुरक्षा',
    privacyPdpa: 'गोपनीयता और आपका डेटा (PDPA)',
    signOut: 'साइन आउट',
    messages: 'संदेश',
    todaysPlan: 'आज का प्लान',
    publicPlaceJustYouTwo: 'सार्वजनिक जगहें · ग्रुप में · चैट का अनुवाद',
    peopleSaidHi: 'लोगों ने नमस्ते कहा',
    oneAtATime: 'एक बार में एक · तभी जवाब दें जब आप चाहें',
    review: 'देखें',
    notNow: 'अभी नहीं',
    reply: 'जवाब दें',
    sendHello: 'नमस्ते भेजें · กริ๊ง!',
    oneMessageRule: 'आप एक दोस्ताना संदेश भेज सकते हैं। उनके जवाब देने पर चैट खुल जाएगी।',
    hereNow: 'अभी यहाँ हैं',
    verifiedLabel: 'सत्यापित',
    onlineNow: 'अभी ऑनलाइन',
    traveller: 'यात्री',
    thaiLocal: 'थाई लोकल',
    offlineBanner: 'आप ऑफ़लाइन हैं · इंटरनेट आने पर आपके संदेश अपने आप भेज दिए जाएंगे',
    retry: 'पुनः प्रयास करें',
    emptyPeopleTitle: 'इस फ़िल्टर से कोई मेल नहीं खाता',
    emptyPeopleSub: 'फ़िल्टर हटाकर देखें या शाम को दोबारा चेक करें।',
    emptySavedTitle: 'अभी कुछ भी सेव नहीं है',
    emptySavedSub: 'किसी भी पोस्ट पर बुकमार्क दबाकर उसे यहाँ सेव करें।',
    emptyChatTitle: 'अभी कोई बातचीत नहीं',
    emptyChatSub: 'अपना पहला संदेश भेजने के लिए किसी रील पर “नमस्ते कहें” दबाएं।',
  },
  ja: {
    feed: 'フィード',
    people: 'ピープル',
    deals: '特典',
    me: 'マイページ',
    sayHi: '挨拶する',
    save: '保存',
    saved: '保存済み',
    share: '共有',
    searchPlaceholder: '人を検索',
    filter: '絞り込み',
    all: 'すべて',
    coffee: 'カフェ',
    food: 'グルメ',
    fun: 'アクティビティ',
    todaysTreat: '今日のKring特典',
    claimTwoTaps: '取得する · 2タップ',
    claimedShowCounter: '取得済み · レジで提示',
    readyToUse: '利用可能',
    showCode: 'コードを表示',
    editProfile: 'プロフィール編集',
    shareCard: 'カードを共有',
    myCode: 'マイQR',
    nextLevel: '次へ：タイティーレベル',
    savedPlacesPosts: '保存した場所と投稿',
    rewardsPassport: 'リワードとパスポート',
    settings: '設定',
    language: '言語',
    morningNotif: '朝の「今日のバンコク」通知 · 8:00',
    calmColours: '落ち着いた配色モード',
    safety: '安全サポート',
    privacyPdpa: 'プライバシーとデータ管理 (PDPA)',
    signOut: 'ログアウト',
    messages: 'メッセージ',
    todaysPlan: '今日の予定',
    publicPlaceJustYouTwo: '公共の場所 · グループで · チャットは翻訳',
    peopleSaidHi: '人から挨拶が届いています',
    oneAtATime: '1人ずつ確認 · 話したい人にだけ返信',
    review: '確認する',
    notNow: 'あとで',
    reply: '返信する',
    sendHello: '挨拶を送る · กริ๊ง!',
    oneMessageRule: '最初の挨拶は1通だけ送れます。相手が返信するとチャットが開きます。',
    hereNow: '今ここにいます',
    verifiedLabel: '本人確認済',
    onlineNow: 'オンライン',
    traveller: '旅行者',
    thaiLocal: 'タイ在住ローカル',
    offlineBanner: 'オフラインです · 挨拶や質問はオンライン復帰後に送信されます',
    retry: '再試行',
    emptyPeopleTitle: '条件に一致する人がいません',
    emptyPeopleSub: 'フィルターを解除するか、また後でチェックしてみてください。',
    emptySavedTitle: '保存された項目はありません',
    emptySavedSub: 'フィードの投稿を保存するとここに表示されます。',
    emptyChatTitle: 'まだメッセージはありません',
    emptyChatSub: 'リールの「挨拶する」をタップして最初の挨拶を送ってみましょう。',
  },
  ko: {
    feed: '피드',
    people: '피플',
    deals: '혜택',
    me: '마이',
    sayHi: '인사하기',
    save: '저장',
    saved: '저장됨',
    share: '공유',
    searchPlaceholder: '사람 검색',
    filter: '필터',
    all: '전체',
    coffee: '카페',
    food: '맛집',
    fun: '액티비티',
    todaysTreat: '오늘의 Kring 혜택',
    claimTwoTaps: '받기 · 2번 탭',
    claimedShowCounter: '받기 완료 · 카운터 제시',
    readyToUse: '사용 가능',
    showCode: '코드 보기',
    editProfile: '프로필 편집',
    shareCard: '카드 공유',
    myCode: '내 QR 코드',
    nextLevel: '다음 등급: 타이티 레벨',
    savedPlacesPosts: '저장한 장소 및 게시물',
    rewardsPassport: '리워드 및 패스포트',
    settings: '설정',
    language: '언어',
    morningNotif: '아침 "오늘의 방콕" 알림 · 8:00',
    calmColours: '차분한 색상 모드',
    safety: '안전 센터',
    privacyPdpa: '개인정보 및 데이터 관리 (PDPA)',
    signOut: '로그아웃',
    messages: '메시지',
    todaysPlan: '오늘의 일정',
    publicPlaceJustYouTwo: '공공장소 · 여럿이 함께 · 채팅 번역',
    peopleSaidHi: '명이 인사를 보냈어요',
    oneAtATime: '한 명씩 확인 · 원할 때만 답장하세요',
    review: '확인',
    notNow: '나중에',
    reply: '답장하기',
    sendHello: '인사 보내기 · กริ๊ง!',
    oneMessageRule: '첫 인사는 한 번만 보낼 수 있어요. 상대방이 답장하면 전체 채팅이 열립니다.',
    hereNow: '지금 여기 있어요',
    verifiedLabel: '인증됨',
    onlineNow: '현재 온라인',
    traveller: '여행자',
    thaiLocal: '태국 현지인',
    offlineBanner: '오프라인 상태입니다 · 인사와 질문은 온라인 연결 시 자동 전송됩니다',
    retry: '다시 시도',
    emptyPeopleTitle: '필터와 일치하는 사람이 없습니다',
    emptyPeopleSub: '필터를 초기화하거나 저녁 시간에 다시 확인해 보세요.',
    emptySavedTitle: '아직 저장한 항목이 없습니다',
    emptySavedSub: '피드 게시물의 북마크를 탭해 마음에 드는 장소를 저장해 보세요.',
    emptyChatTitle: '아직 대화가 없습니다',
    emptyChatSub: '릴이나 프로필의 ‘인사하기’를 눌러 첫 인사를 건네보세요.',
  },
};

export const THAI_CHAT_TRANSLATIONS: Record<string, string> = {
  'บ่ายสองว่างไหมคะ ร้านนี้อยู่ซอยอารีย์ 2 เดินจาก BTS 3 นาทีเอง':
    'Are you free at 2pm? It is on Ari Soi 2, 3 min walk from BTS.',
  'ร้านอยู่ซอยอารีย์ 2 เดินจาก BTS 3 นาทีเอง':
    'The café is on Ari Soi 2, a 3-minute walk from BTS.',
  'โต๊ะใหญ่ริมหน้าต่างนั่งได้ 4 คนพอดี':
    'The big window table fits all 4 of us.',
  'สวัสดีค่ะ ยินดีที่ได้รู้จักนะคะ':
    'Hello! Nice to meet you.',
  'สวัสดีครับ ยินดีที่ได้รู้จักครับ':
    'Hello! Nice to meet you.',
  'เจอกันที่หน้าร้านได้เลยค่ะ':
    'Let us meet right in front of the shop.',
  'วันนี้ฝนน่าจะตกตอนบ่าย พกร่มมาด้วยนะคะ':
    'It might rain this afternoon, bring an umbrella!',
  'ร้านนี้กาแฟอร่อยมาก แนะนำเลยค่ะ':
    'The coffee at this shop is really great, highly recommended.',
  'กำลังเดินไปนะคะ อีก 5 นาทีถึงค่ะ':
    'Walking over now, I will be there in 5 minutes.',
};

const THAI_PHRASE_MAP: Array<[RegExp, string]> = [
  [/สวัสดี(ค่ะ|ครับ)?/g, 'Hello'],
  [/ขอบคุณ(มาก)?(ค่ะ|ครับ)?/g, 'Thank you'],
  [/เจอกัน/g, 'See you'],
  [/ว่างไหม(คะ|ครับ)?/g, 'are you free?'],
  [/อร่อยมาก/g, 'very delicious'],
  [/กาแฟ/g, 'coffee'],
  [/ร้านนี้/g, 'this place'],
  [/อารีย์/g, 'Ari'],
  [/ทองหล่อ/g, 'Thonglor'],
  [/สยาม/g, 'Siam'],
  [/เยาวราช/g, 'Yaowarat'],
  [/เดินจาก BTS/g, 'walk from BTS'],
  [/นาที/g, 'minutes'],
  [/บ่ายสอง/g, '2pm'],
  [/บ่ายสาม/g, '3pm'],
  [/เย็นนี้/g, 'this evening'],
  [/วันนี้/g, 'today'],
];

export function hasThaiScript(text: string): boolean {
  return /[\u0E00-\u0E7F]/.test(text);
}

export function translateThaiLineToEnglish(text: string): string {
  const trimmed = text.trim();
  if (THAI_CHAT_TRANSLATIONS[trimmed]) {
    return THAI_CHAT_TRANSLATIONS[trimmed];
  }
  if (!hasThaiScript(trimmed)) {
    return '';
  }
  let result = trimmed;
  let matchedAny = false;
  for (const [pattern, replacement] of THAI_PHRASE_MAP) {
    if (pattern.test(result)) {
      matchedAny = true;
      result = result.replace(pattern, ` ${replacement} `);
    }
  }
  if (matchedAny) {
    const cleaned = result
      .replace(/[\u0E00-\u0E7F]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length >= 3) {
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
  }
  return 'Translated from Thai · Friendly message in Bangkok';
}
