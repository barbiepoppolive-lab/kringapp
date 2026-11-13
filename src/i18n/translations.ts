export type LanguageCode = 'en' | 'th' | 'zh' | 'hi' | 'ko' | 'ru' | 'ja'
export type Language = LanguageCode

export type TabKey = 'meet' | 'pulse' | 'chats' | 'vip'

export interface TabCopy {
  label: string
  title: string
  subtitle: string
}

export interface UiTranslations {
  jackpotPill: string
  liveStoriesHeader: string
  dailyMysteryClink: string
  dailyClinkClaimed: string
  filterAll: string
  filterFlash: string
  filterThonglor: string
  filterAsok: string
  chonBtn: string
  pulseRadarTitle: string
  pulseRadarSub: string
  pulseTabDeals: string
  pulseTabAirport: string
  pulseTabTable: string
  pulseTabTaxi: string
  unlockVipBtn: string
  bookNowBtn: string
  postMyTableBtn: string
  chatFreeReplies: string
  chatLockPlanBtn: string
  chatLuckyBarTitle: string
  chatLuckyMsgPlaceholder: string
  chatRollSendBtn: string
  chatSendBtn: string
  vipTabCashout: string
  vipTabInvite: string
  vipTabAgency: string
  switchAccountBtn: string
  logOutBtn: string
}

export interface Translations {
  headerTagline: string
  switcherLabel: string
  comingSoon: string
  tabs: Record<TabKey, TabCopy>
  terms: Record<string, string>
  ui: UiTranslations
}

export interface LanguageOption {
  code: LanguageCode
  label: string
  htmlLang: string
  nativeName?: string
}

const ALL_LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'en', label: 'EN', htmlLang: 'en', nativeName: 'English' },
  { code: 'th', label: 'ไทย', htmlLang: 'th', nativeName: 'ไทย' },
  { code: 'zh', label: '中文', htmlLang: 'zh', nativeName: '中文' },
  { code: 'hi', label: '🇮🇳 हिन्दी', htmlLang: 'hi', nativeName: 'हिन्दी' },
  { code: 'ko', label: '한국어', htmlLang: 'ko', nativeName: '한국어' },
  { code: 'ru', label: 'Русский', htmlLang: 'ru', nativeName: 'Русский' },
  { code: 'ja', label: '日本語', htmlLang: 'ja', nativeName: '日本語' },
]

export const LANGUAGE_OPTIONS: LanguageOption[] = [...ALL_LANGUAGE_OPTIONS]

export const translations: Record<LanguageCode, Translations> = {
  en: {
    headerTagline: 'Clink glasses. Real plans.',
    switcherLabel: 'Language',
    comingSoon: 'Coming soon — built ticket by ticket.',
    tabs: {
      meet: {
        label: 'Meet',
        title: '🔥 Meet',
        subtitle: "Tonight's Hangout Drops — clink glasses with a Local Creator.",
      },
      pulse: {
        label: 'BKK Pulse',
        title: '⚡ BKK Pulse',
        subtitle: 'Cheapest VIP Rooftops, Airport Cabs & 1-Tap Taxi Card.',
      },
      chats: {
        label: 'Chats',
        title: '💬 Chats',
        subtitle: 'Free replies, In-Chat Lucky Games & tonight’s plan.',
      },
      vip: {
        label: 'VIP & Wallet',
        title: '👑 VIP & Wallet',
        subtitle: 'Coins, Front-Row status & Airport Vault.',
      },
    },
    terms: {
      appName: 'Chon! (ชน)',
      hangoutDrop: 'Hangout Drop',
      outingTreatGoal: 'Outing Treat Goal',
      chonToast: 'Chon! 🥂 (Clink Glasses / Top Up Treat)',
      guestList: 'Guest List / Waiting Line',
      frontRowVips: 'Front-Row VIPs',
      letsGo: 'Tap "Let\'s Go!"',
      freeTonight: '⚡ Free Tonight',
      localCreator: 'Local Creator / Vibe Host',
      traveler: 'Traveler / Explorer',
    },
    ui: {
      jackpotPill: '🎰 2% Jackpot & Tasks',
      liveStoriesHeader: 'Live now',
      dailyMysteryClink: '🎁 1,000c Daily Mystery Clink',
      dailyClinkClaimed: '✓ Daily Clink claimed',
      filterAll: 'All Tonight',
      filterFlash: '⚡ Free in 60m',
      filterThonglor: 'Thonglor / Ekkamai',
      filterAsok: 'Asok / Phrom Phong',
      chonBtn: '🥂 Chon!',
      pulseRadarTitle: '⚡ Cheapest VIP Rates in Bangkok',
      pulseRadarSub: 'Cheapest VIP member rate in flat Baht + instant Coin rebates.',
      pulseTabDeals: '🍽️ VIP Deals',
      pulseTabAirport: '✈️ Airport',
      pulseTabTable: '🍾 My Table',
      pulseTabTaxi: '🚕 Taxi Card',
      unlockVipBtn: 'Unlock VIP Rate',
      bookNowBtn: 'Book Now',
      postMyTableBtn: '🍾 Post My VIP Table',
      chatFreeReplies: '💬 Free Replies',
      chatLockPlanBtn: '🥂 Lock Plan (฿200)',
      chatLuckyBarTitle: '🍀 Chon! VIP In-Chat Lucky Roll',
      chatLuckyMsgPlaceholder: 'Add a flirty note with your Lucky roll...',
      chatRollSendBtn: '🎲 Roll & Send in Chat',
      chatSendBtn: 'Send',
      vipTabCashout: '💸 Cashout',
      vipTabInvite: '🎁 ฿555 Invite',
      vipTabAgency: '🏢 Agency Hub',
      switchAccountBtn: 'Switch account / role',
      logOutBtn: 'Log out',
    },
  },
  th: {
    headerTagline: 'ชนแก้ว วางแผนจริง ไปกันเลย',
    switcherLabel: 'ภาษา',
    comingSoon: 'เร็ว ๆ นี้ — อัปเดตทีละทิกเก็ต',
    tabs: {
      meet: {
        label: 'เจอกัน',
        title: '🔥 เจอกัน',
        subtitle: 'Hangout Drop คืนนี้ — ชนแก้วกับ Local Creator 🥂',
      },
      pulse: {
        label: 'BKK Pulse',
        title: '⚡ BKK Pulse',
        subtitle: 'ดีลรูฟท็อปถูกสุด, รถรับสนามบิน VIP และการ์ดแท็กซี่ 1-Tap',
      },
      chats: {
        label: 'แชต',
        title: '💬 แชต',
        subtitle: 'ตอบกลับฟรี, เกมสุ่มโชคในแชต และนัดเจอคืนนี้',
      },
      vip: {
        label: 'VIP & กระเป๋า',
        title: '👑 VIP & กระเป๋า',
        subtitle: 'เหรียญ, ถอนเงิน PromptPay ทันใจ และโบนัสชวนเพื่อน ฿555',
      },
    },
    terms: {
      appName: 'Chon! (ชน)',
      hangoutDrop: 'Hangout Drop (แผนแฮงเอาต์คืนนี้)',
      outingTreatGoal: 'Outing Treat Goal (เป้าหมายเลี้ยงเที่ยว)',
      chonToast: 'Chon! 🥂 (ชนแก้ว / เติมเต็ม Treat)',
      guestList: 'Guest List / คิวคนรอ',
      frontRowVips: 'Front-Row VIPs',
      letsGo: 'แตะ "Let\'s Go!"',
      freeTonight: '⚡ Free Tonight (ว่างคืนนี้)',
      localCreator: 'Local Creator / Vibe Host',
      traveler: 'Traveler / Explorer (นักสำรวจ)',
    },
    ui: {
      jackpotPill: '🎰 แจ็กพอต 2% & ภารกิจ',
      liveStoriesHeader: 'ไลฟ์ตอนนี้',
      dailyMysteryClink: '🎁 สุ่มกล่องชนแก้ว 1,000c',
      dailyClinkClaimed: '✓ รับกล่องชนแก้วแล้ว',
      filterAll: 'ทั้งหมดคืนนี้',
      filterFlash: '⚡ ว่างใน 60 นาที',
      filterThonglor: 'ทองหล่อ / เอกมัย',
      filterAsok: 'อโศก / พร้อมพงษ์',
      chonBtn: '🥂 ชนแก้ว!',
      pulseRadarTitle: '⚡ เรต VIP ถูกที่สุดในกรุงเทพฯ',
      pulseRadarSub: 'การันตีถูกกว่าจองตรง พร้อมรับเหรียญคืนทันที 100%',
      pulseTabDeals: '🍽️ ดีล VIP',
      pulseTabAirport: '✈️ รถสนามบิน',
      pulseTabTable: '🍾 เปิดโต๊ะ VIP',
      pulseTabTaxi: '🚕 การ์ดแท็กซี่',
      unlockVipBtn: 'รับสิทธิ์ VIP',
      bookNowBtn: 'จองเลย',
      postMyTableBtn: '🍾 เปิดโต๊ะชวนโฮสต์',
      chatFreeReplies: '💬 ตอบแชตฟรี',
      chatLockPlanBtn: '🥂 ล็อกนัดคืนนี้ (฿200)',
      chatLuckyBarTitle: '🍀 สุ่มโชค Lucky Chon! ในแชต (ลุ้น 500x)',
      chatLuckyMsgPlaceholder: 'พิมพ์ข้อความส่งพร้อมของขวัญนำโชค...',
      chatRollSendBtn: '🎲 ทอยเต๋า & ส่งในแชต',
      chatSendBtn: 'ส่ง',
      vipTabCashout: '💸 ถอนเงินสด',
      vipTabInvite: '🎁 ชวนเพื่อน ฿555',
      vipTabAgency: '🏢 ระบบเอเจนซี่',
      switchAccountBtn: 'สลับบัญชี / บทบาท',
      logOutBtn: 'ออกจากระบบ',
    },
  },
  zh: {
    headerTagline: '碰杯，来真的。',
    switcherLabel: '语言',
    comingSoon: '即将上线 — 一张工单一张工单地做。',
    tabs: {
      meet: {
        label: '遇见',
        title: '🔥 遇见',
        subtitle: '今晚的 Hangout Drop — 和本地 Vibe Host 碰杯 🥂',
      },
      pulse: {
        label: '曼谷脉动',
        title: '⚡ 曼谷脉动',
        subtitle: '全曼谷最低 VIP 露台餐厅、专车接机与一键出租车卡。',
      },
      chats: {
        label: '聊天',
        title: '💬 聊天',
        subtitle: '免费互聊、聊天内幸运爆奖游戏与今晚约会。',
      },
      vip: {
        label: 'VIP 与钱包',
        title: '👑 VIP 与钱包',
        subtitle: '金币、PromptPay 秒提现与 ฿555 邀友奖金。',
      },
    },
    terms: {
      appName: 'Chon! (ชน)',
      hangoutDrop: 'Hangout Drop（约会放送）',
      outingTreatGoal: 'Outing Treat Goal（约会心愿金）',
      chonToast: 'Chon! 🥂（碰杯 / 加码 Treat）',
      guestList: 'Guest List（宾客名单）',
      frontRowVips: 'Front-Row VIPs（前排 VIP 前 3 名）',
      letsGo: '点按 "Let\'s Go!"',
      freeTonight: '⚡ Free Tonight（今晚有空）',
      localCreator: 'Local Creator / Vibe Host（本地主理人）',
      traveler: 'Traveler / Explorer（旅行探索者）',
    },
    ui: {
      jackpotPill: '🎰 2% 奖池与任务',
      liveStoriesHeader: '10秒实时动态',
      dailyMysteryClink: '🎁 1,000c 每日盲盒碰杯',
      dailyClinkClaimed: '✓ 今日盲盒已领',
      filterAll: '今晚全部',
      filterFlash: '⚡ 60分钟内有空',
      filterThonglor: '通罗 / 亿甲迈',
      filterAsok: '阿索克 / 澎蓬',
      chonBtn: '🥂 碰杯!',
      pulseRadarTitle: '⚡ 曼谷全网最低 VIP 专享价',
      pulseRadarSub: '比平台直订更便宜，立返 100% 礼金金币。',
      pulseTabDeals: '🍽️ VIP 特惠',
      pulseTabAirport: '✈️ 专车接机',
      pulseTabTable: '🍾 发布卡座',
      pulseTabTaxi: '🚕 司机泰语卡',
      unlockVipBtn: '解锁 VIP 价',
      bookNowBtn: '立即预订',
      postMyTableBtn: '🍾 发布我的 VIP 卡座',
      chatFreeReplies: '💬 互聊全免费',
      chatLockPlanBtn: '🥂 锁定今晚约会 (฿200)',
      chatLuckyBarTitle: '🍀 边聊边玩 · 幸运爆奖 (最高 500x)',
      chatLuckyMsgPlaceholder: '输入一句话随幸运礼物一起发出...',
      chatRollSendBtn: '🎲 摇奖并发到聊天',
      chatSendBtn: '发送',
      vipTabCashout: '💸 秒提现',
      vipTabInvite: '🎁 邀友得 ฿555',
      vipTabAgency: '🏢 经纪人中心',
      switchAccountBtn: '切换账号 / 身份',
      logOutBtn: '退出登录',
    },
  },
  ko: {
    headerTagline: '잔을 부딪히며, 진짜 만남으로.',
    switcherLabel: '언어',
    comingSoon: '출시 예정 — 차근차근 빌드 중입니다.',
    tabs: {
      meet: {
        label: '만남',
        title: '🔥 만남',
        subtitle: "오늘 밤의 Hangout Drop — 현지 크리에이터와 함께 짠! 🥂",
      },
      pulse: {
        label: 'BKK 펄스',
        title: '⚡ BKK 펄스',
        subtitle: '최저가 VIP 루프탑, 공항 픽업 및 1-탭 택시 카드.',
      },
      chats: {
        label: '채팅',
        title: '💬 채팅',
        subtitle: '무료 답장, 채팅 내 행운 게임 & 오늘 밤 약속.',
      },
      vip: {
        label: 'VIP & 지갑',
        title: '👑 VIP & 지갑',
        subtitle: '코인, 프론트로우 VIP 지위 & 공항 볼트.',
      },
    },
    terms: {
      appName: 'Chon! (ชน)',
      hangoutDrop: 'Hangout Drop (오늘 밤 번개 일정)',
      outingTreatGoal: 'Outing Treat Goal (데이트 트리트 목표)',
      chonToast: 'Chon! 🥂 (잔 부딪히기 / 트리트 충전)',
      guestList: 'Guest List / 대기 명단',
      frontRowVips: 'Front-Row VIPs (상위 3명 VIP)',
      letsGo: 'Tap "Let\'s Go!" (가자!)',
      freeTonight: '⚡ Free Tonight (오늘 밤 가능)',
      localCreator: 'Local Creator / Vibe Host (로컬 크리에이터)',
      traveler: 'Traveler / Explorer (여행자 / 탐험가)',
    },
    ui: {
      jackpotPill: '🎰 2% 잭팟 & 미션',
      liveStoriesHeader: '실시간 라이브 · 10초 스토리',
      dailyMysteryClink: '🎁 1,000c 데일리 미스터리 짠!',
      dailyClinkClaimed: '✓ 데일리 짠! 수령 완료',
      filterAll: '오늘 밤 전체',
      filterFlash: '⚡ 60분 내 가능',
      filterThonglor: '통로 / 에까마이',
      filterAsok: '아속 / 프롬퐁',
      chonBtn: '🥂 Chon!',
      pulseRadarTitle: '⚡ 방콕 최저가 VIP 특가',
      pulseRadarSub: '직접 예약보다 저렴한 VIP 회원가 + 즉시 코인 페이백.',
      pulseTabDeals: '🍽️ VIP 특가',
      pulseTabAirport: '✈️ 공항 픽업',
      pulseTabTable: '🍾 내 VIP 테이블',
      pulseTabTaxi: '🚕 택시 카드',
      unlockVipBtn: 'VIP 특가 열기',
      bookNowBtn: '지금 예약',
      postMyTableBtn: '🍾 내 VIP 테이블 등록',
      chatFreeReplies: '💬 무료 답장',
      chatLockPlanBtn: '🥂 플랜 확정 (฿200)',
      chatLuckyBarTitle: '🍀 Chon! VIP 채팅 내 행운 롤',
      chatLuckyMsgPlaceholder: '행운의 롤과 함께 설레는 메시지를 남겨보세요...',
      chatRollSendBtn: '🎲 굴려서 채팅으로 전송',
      chatSendBtn: '전송',
      vipTabCashout: '💸 출금하기',
      vipTabInvite: '🎁 ฿555 친구 초대',
      vipTabAgency: '🏢 에이전시 허브',
      switchAccountBtn: '계정 / 역할 전환',
      logOutBtn: '로그아웃',
    },
  },
  ru: {
    headerTagline: 'Звон бокалов. Настоящие планы.',
    switcherLabel: 'Язык',
    comingSoon: 'Скоро — создаем тикет за тикетом.',
    tabs: {
      meet: {
        label: 'Встречи',
        title: '🔥 Встречи',
        subtitle: "Hangout Drop на вечер — чокнись бокалом с Local Creator 🥂",
      },
      pulse: {
        label: 'BKK Пульс',
        title: '⚡ BKK Пульс',
        subtitle: 'Выгодные VIP руфтопы, трансфер из аэропорта и 1-Tap карта такси.',
      },
      chats: {
        label: 'Чаты',
        title: '💬 Чаты',
        subtitle: 'Бесплатные ответы, Lucky игры в чате и планы на вечер.',
      },
      vip: {
        label: 'VIP и Кошелек',
        title: '👑 VIP и Кошелек',
        subtitle: 'Монеты, статус Front-Row VIPs и сейф в аэропорту.',
      },
    },
    terms: {
      appName: 'Chon! (ชน)',
      hangoutDrop: 'Hangout Drop (Вечерний план)',
      outingTreatGoal: 'Outing Treat Goal (Цель угощения)',
      chonToast: 'Chon! 🥂 (Чокнуться / Пополнить Treat)',
      guestList: 'Guest List / Список гостей',
      frontRowVips: 'Front-Row VIPs (Топ-3 VIP)',
      letsGo: 'Tap "Let\'s Go!" (Погнали!)',
      freeTonight: '⚡ Free Tonight (Свободна сегодня)',
      localCreator: 'Local Creator / Vibe Host',
      traveler: 'Traveler / Explorer (Путешественник)',
    },
    ui: {
      jackpotPill: '🎰 2% Джекпот и Задания',
      liveStoriesHeader: 'Live прямо сейчас · 10s Сториз',
      dailyMysteryClink: '🎁 1,000c Ежедневный бокс Chon!',
      dailyClinkClaimed: '✓ Бокс уже получен',
      filterAll: 'Все сегодня',
      filterFlash: '⚡ Свободна через 60 мин',
      filterThonglor: 'Тонглор / Эккамай',
      filterAsok: 'Асок / Пром Понг',
      chonBtn: '🥂 Chon!',
      pulseRadarTitle: '⚡ Лучшие VIP цены в Бангкоке',
      pulseRadarSub: 'Дешевле прямого бронирования + мгновенный кешбэк монетами.',
      pulseTabDeals: '🍽️ VIP Скидки',
      pulseTabAirport: '✈️ Аэропорт',
      pulseTabTable: '🍾 Мой VIP столик',
      pulseTabTaxi: '🚕 Карточка такси',
      unlockVipBtn: 'Открыть VIP тариф',
      bookNowBtn: 'Забронировать',
      postMyTableBtn: '🍾 Создать VIP столик',
      chatFreeReplies: '💬 Взаимно бесплатно',
      chatLockPlanBtn: '🥂 Зафиксировать план (฿200)',
      chatLuckyBarTitle: '🍀 Chon! VIP Lucky игра в чате (до 500x)',
      chatLuckyMsgPlaceholder: 'Напишите приятное сообщение вместе с подарком...',
      chatRollSendBtn: '🎲 Бросить и отправить в чат',
      chatSendBtn: 'Отправить',
      vipTabCashout: '💸 Вывод средств',
      vipTabInvite: '🎁 Пригласи друга на ฿555',
      vipTabAgency: '🏢 Агентский хаб',
      switchAccountBtn: 'Сменить аккаунт / роль',
      logOutBtn: 'Выйти',
    },
  },
  ja: {
    headerTagline: 'グラスを合わせて、リアルな約束を。',
    switcherLabel: '言語',
    comingSoon: 'まもなく登場 — 1つずつ丁寧に開発中。',
    tabs: {
      meet: {
        label: '出会い',
        title: '🔥 出会い',
        subtitle: '今夜の Hangout Drop — ローカルクリエイターと乾杯 🥂',
      },
      pulse: {
        label: 'BKKパルス',
        title: '⚡ BKKパルス',
        subtitle: '最安値VIPルーフトップ、空港送迎、1タップタクシーカード。',
      },
      chats: {
        label: 'チャット',
        title: '💬 チャット',
        subtitle: '無料返信、チャット内ラッキーゲーム、今夜のプラン。',
      },
      vip: {
        label: 'VIP & ウォレット',
        title: '👑 VIP & ウォレット',
        subtitle: 'コイン、Front-Row VIPs ステータス、空港ボルト。',
      },
    },
    terms: {
      appName: 'Chon! (ชน)',
      hangoutDrop: 'Hangout Drop (今夜のおでかけプラン)',
      outingTreatGoal: 'Outing Treat Goal (デートごちそう目標)',
      chonToast: 'Chon! 🥂 (乾杯 / Treat チャージ)',
      guestList: 'Guest List / ウェイティングリスト',
      frontRowVips: 'Front-Row VIPs (トップ3 VIP)',
      letsGo: 'Tap "Let\'s Go!" (行こう！)',
      freeTonight: '⚡ Free Tonight (今夜空いてます)',
      localCreator: 'Local Creator / Vibe Host (ローカルクリエイター)',
      traveler: 'Traveler / Explorer (旅行者・探索者)',
    },
    ui: {
      jackpotPill: '🎰 2% ジャックポット & タスク',
      liveStoriesHeader: 'ライブ配信中 · 10秒ストーリー',
      dailyMysteryClink: '🎁 1,000c デイリー乾杯ボックス',
      dailyClinkClaimed: '✓ 今日のボックス受取済み',
      filterAll: '今夜すべて',
      filterFlash: '⚡ 60分以内に集合',
      filterThonglor: 'トンロー / エカマイ',
      filterAsok: 'アソーク / プロンポン',
      chonBtn: '🥂 Chon!',
      pulseRadarTitle: '⚡ バンコク最安値 VIP 特別レート',
      pulseRadarSub: '直接予約より確実にお得 + 即時コイン還元。',
      pulseTabDeals: '🍽️ VIP 特典',
      pulseTabAirport: '✈️ 空港送迎',
      pulseTabTable: '🍾 マイVIPテーブル',
      pulseTabTaxi: '🚕 タクシーカード',
      unlockVipBtn: 'VIPレートを解除',
      bookNowBtn: '今すぐ予約',
      postMyTableBtn: '🍾 マイVIPテーブルを投稿',
      chatFreeReplies: '💬 無料返信',
      chatLockPlanBtn: '🥂 プランを確定 (฿200)',
      chatLuckyBarTitle: '🍀 Chon! VIP チャット内ラッキーロール (最大500倍)',
      chatLuckyMsgPlaceholder: 'ラッキーギフトと一緒にメッセージを添えて...',
      chatRollSendBtn: '🎲 サイコロを振ってチャットに送信',
      chatSendBtn: '送信',
      vipTabCashout: '💸 出金する',
      vipTabInvite: '🎁 友達招待で ฿555',
      vipTabAgency: '🏢 エージェンシーハブ',
      switchAccountBtn: 'アカウント / 役割を切り替え',
      logOutBtn: 'ログアウト',
    },
  },
  hi: {
    headerTagline: 'ग्लास टकराएं। असली प्लान।',
    switcherLabel: 'भाषा',
    comingSoon: 'जल्द आ रहा है — स्टेप बाय स्टेप।',
    tabs: {
      meet: {
        label: 'मिलें',
        title: '🔥 मिलें',
        subtitle: 'आज रात के हैंगआउट प्लान — वेरिफाइड होस्ट्स के साथ चीयर्स करें 🥂',
      },
      pulse: {
        label: 'BKK पल्स',
        title: '⚡ BKK पल्स',
        subtitle: 'सबसे सस्ते VIP रूफटॉप, एयरपोर्ट कैब और 5G eSIM।',
      },
      chats: {
        label: 'चैट्स',
        title: '💬 चैट्स',
        subtitle: 'तुरंत हिंदी/थाई अनुवाद, लकी गिफ्ट्स और आज रात के प्लान।',
      },
      vip: {
        label: 'VIP व वॉलेट',
        title: '👑 VIP व वॉलेट',
        subtitle: 'कॉइन्स, इंस्टेंट कैशआउट और प्राइवेसी शील्ड।',
      },
    },
    terms: {
      appName: 'Chon! (ชน)',
      hangoutDrop: 'Hangout Drop (आज रात का प्लान)',
      outingTreatGoal: 'Outing Treat Goal (डेट ट्रीट गोल)',
      chonToast: 'Chon! 🥂 (चीयर्स)',
      guestList: 'Guest List / वेटलिस्ट',
      frontRowVips: 'Front-Row VIPs (टॉप 3 VIP)',
      letsGo: 'Tap "Let\'s Go!" (चलो चलें!)',
      freeTonight: '⚡ Free Tonight (आज रात फ्री)',
      localCreator: 'Local Creator / Vibe Host (वेरिफाइड होस्ट)',
      traveler: 'Traveler / Explorer (वीआईपी यात्री)',
    },
    ui: {
      jackpotPill: '🎰 2% जैकपॉट व रिवॉर्ड्स',
      liveStoriesHeader: 'लाइव · 10 सेकंड स्टोरीज़',
      dailyMysteryClink: '🎁 1,000c डेली क्लिंक बॉक्स',
      dailyClinkClaimed: '✓ आज का बोनस मिल गया',
      filterAll: 'सभी ऑनलाइन',
      filterFlash: '⚡ 60 मिनट में मिलें',
      filterThonglor: 'थोंगलोर / एक्कामाई',
      filterAsok: 'असोक / फ्रोम फोंग',
      chonBtn: '🥂 Chon!',
      pulseRadarTitle: '⚡ बैंकाक सबसे सस्ते VIP रेट्स',
      pulseRadarSub: 'काउंटर रेट से 40% तक सस्ता + फ्री कॉइन बोनस।',
      pulseTabDeals: '🍽️ VIP डील्स',
      pulseTabAirport: '✈️ एयरपोर्ट कैब',
      pulseTabTable: '🍾 मेरा VIP टेबल',
      pulseTabTaxi: '🚕 टैक्सी कार्ड',
      unlockVipBtn: 'VIP रेट पाएं',
      bookNowBtn: 'अभी बुक करें',
      postMyTableBtn: '🍾 अपना टेबल पोस्ट करें',
      chatFreeReplies: '💬 मुफ्त रिप्लाई',
      chatLockPlanBtn: '🥂 प्लान कन्फर्म करें (฿300)',
      chatLuckyBarTitle: '🍀 Chon! लकी गिफ्ट (500x तक जीतें)',
      chatLuckyMsgPlaceholder: 'गिफ्ट के साथ मैसेज लिखें...',
      chatRollSendBtn: '🎲 रोल करें व भेजें',
      chatSendBtn: 'भेजें',
      vipTabCashout: '💸 पैसे निकालें',
      vipTabInvite: '🎁 दोस्त बुलाएं ฿555 पाएं',
      vipTabAgency: '🏢 स्क्वाड हब',
      switchAccountBtn: 'अकाउंट / रोल बदलें',
      logOutBtn: 'लॉग आउट',
    },
  },
}
