import React, { useEffect, useMemo, useRef, useState } from 'react';
import './fonts-v8.css';
import './v8.css';
import { KDock } from './KDock';
import {
  clearOfflineQueue,
  DEFAULT_WEATHER,
  enqueueOfflineAction,
  fetchBangkokWeather,
  fetchRealDealsFromSupabase,
  fetchRealFeedFromSupabase,
  fetchRealPeopleFromSupabase,
  formatTravellerCurrency,
  getOfflineQueue,
  isDemoOrDevEnvironment,
  NEUTRAL_IMG,
  initialAvatar,
  submitWaitlistEmail,
  V8ChatThread,
  V8CurrencyInfo,
  V8Deal,
  V8FeedItem,
  V8HelloRequest,
  V8Person,
  V8StorySlide,
  V8Weather,
  validateFirstHelloMessage,
} from './v8Data';
import {
  hasThaiScript,
  translateThaiLineToEnglish,
  V8_STRINGS,
  V8Lang,
} from './v8I18n';
import { RingsState } from './RiveRings';
import { v8LiveEvents, V8PublicEvent } from './v8Events';
import {
  V5_AUTH_LIVE,
  v5Block,
  v5Claim,
  v5StaffUrl,
  v5CompressImage,
  v5CreatePost,
  v5DeleteMe,
  v5ErrCode,
  v5Export,
  v5Feed,
  v5FeedPeek,
  v5Hello,
  v5Inbox,
  v5TeamIds,
  kringTeamLogo,
  v5Me,
  v5Messages,
  v5OnAuth,
  v5People,
  v5Report,
  v5SendMessage,
  v5Session,
  v5SignOut,
  v5Subscribe,
  v5TakeOAuthError,
  v5Treats,
  v5ToggleLike,
  v5ToggleSave,
  v5MergeSaves,
  v5MySaves,
  v5NotInterested,
  v5ReportReel,
  v5TagPlaces,
  v5SetReelPlace,
  v5LogView,
  v5LogShare,
  v5ReelLink,
  v5MyBlocks,
  v5Unblock,
  v5Profile,
  v5Follow,
  v5Unfollow,
  v5FollowList,
  v5Top10,
  v5Activity,
  v5SetInterests,
  v5Touch,
  v5MyGhost,
  v5ProfileLink,
  V5_INTERESTS,
  v5SyncAttribution,
  v5StoredRef,
} from './v5Live';
import { ActivitySheet, FollowSheet, InterestsSheet, LANG_NAME, MeView } from './V5Me';
import { A2HSBanner, a2hsFirstValue, a2hsMoment, a2hsSignedInVisit, InstallChip, openInstallSheet, takeInstallAsk } from './A2HS';
import { parsePushLink, pushConfigured, pushDisable, pushEnable, pushMoment, pushResync, pushState, type PushLink, type PushState } from './push';
import { PUSH_ASK_LINE, PushAskCard } from './V5Push';
import { EscapeScreen } from './V5Escape';
import { isLiffOpen, openEscape } from './escape';
import { TripPerks } from './V5Trip';
// founder 17 Nov: hide café treats / stays; Deals = trip partners + "more deals coming soon"
const DEALS_TRIP_ONLY = true;
import { StayDo } from './V5StayDo';
import { v5HandoffBoot, v5LogClient, v5MyVerification, v5SaveCardPrint, V5_AREAS } from './v5Live';
import type { V5Activity, V5FollowRow, V5Profile } from './v5Live';
import type { V5Blocked, V5Card, V5FeedItem, V5Me, V5ReportReason, V5TagPlace, V5Thread } from './v5Live';
import { V5_L, KX_L, kxArea, v5ErrText, loadV5Lang, v5LangReady } from './v5Strings';
import { V5MintSheet } from './V5KxCard';
import { checkProfilePhoto, faceDescriptor, loadImage } from './v5Face';
import { ensureCardPrint } from './cardPrint';
import { GoCoach, GoCompose, GoMeReels, GoProfilePage, GoReelPlayer, gridToGo, ReelCaption, savedToGo, type CoachSpot, type GoReel } from './V5Go';
import { coachDue, coachMark, coachPick, coachReplay, coachSync, newCoachState, type CoachKey, type CoachState } from './goCoach';
import { shownGender } from './V5Gender';
import { useChatTranslate } from './v5Translate';
import { kxBreakdown, kxGenderShown, kxMemberReels, kxReelPeople, kxTagPeople, type KxGridReel, type KxMemberReels, type KxTagPerson } from './v5Kx';
import { PlacePage, PlacePickRow, PlaceSearchPage, rememberPlaces, SavedReelsPage, type PickedPlace } from './V5KxPlaces';
import { kxCheckin, kxCardExtras, kxCreateReel, kxFeedExtras, kxMyRewards, kxRanking, kxRefName, kxSavedReels, kxShareLink, kxShareLinkCached, kxShareOpenSeen,
  type KxCardExtras, type KxClaimResult, type KxFeedExtra, type KxPrize, type KxRanking, type KxRewards, type KxSavedReel, type KxWeekResult } from './v5Kx';
import { inviteCode } from './kxLogic';
import { V5Qr, V5SignInSheet } from './V5Sheets';
import { V5ShareCard } from './V5ShareCard';
import { FirstReelChip, ReelNudgeSheet, markReelNudgeSeen, setReelNudgeLater, showFirstReelChip } from './V5ReelNudge';
import { V5ReelVideo, toggleReelSound } from './V5ReelVideo';
import { restoredTab, rememberTab } from './tabMemory';
import { AskSwitch } from './V5AskSwitch';
import { createAskApi, type AskPerson } from './askThai';
import { lazyPart, prefetchParts } from './lazyPart';
import { PrizeBanner } from './V5PrizeBanner';
import './kx.css';
import { fmtN as kxFmtN } from './kxLogic';
// 16 Nov perf 2: not needed for the first screen, so downloaded separately (see lazyPart)
const V5VerifySheet = lazyPart(() => import('./V5Verify').then((m) => m.V5VerifySheet));
const AskThaiView = lazyPart(() => import('./V5AskThai').then((m) => m.AskThaiView));
const StandHowSheet = lazyPart(() => import('./V5Ticket').then((m) => m.StandHowSheet));
const V5TicketSheet = lazyPart(() => import('./V5Ticket').then((m) => m.V5TicketSheet));
const ClaimedPage = lazyPart(() => import('./V5KxRewards').then((m) => m.ClaimedPage));
const ClaimPage = lazyPart(() => import('./V5KxRewards').then((m) => m.ClaimPage));
const ResultPage = lazyPart(() => import('./V5KxRewards').then((m) => m.ResultPage));
const RewardsPage = lazyPart(() => import('./V5KxRewards').then((m) => m.RewardsPage));
const MathSheet = lazyPart(() => import('./V5KxRanking').then((m) => m.MathSheet));
const HowSheet = lazyPart(() => import('./V5KxRanking').then((m) => m.HowSheet));
const RankingPage = lazyPart(() => import('./V5KxRanking').then((m) => m.RankingPage));
const baht = (n: number) => `฿${kxFmtN(n)}`;
import { installZoomGuard } from './zoomGuard';
import { installKeyboardFocus } from './keyboardFocus';
import { clearSignInDraft, loadSignInDraft, saveSignInDraft } from './signInDraft';
import { installVersionWatch } from './appVersion';
import { applyTrim, checkReel, createReel, makeAudio, prepareReel, ReelError, uploadReel, type ReelInfo, type ReelReady, type UploadedReel } from './v5Reel';
import { GoTrim, WindowVideo } from './V5Trim';
import { clock } from './reelTrim';

const V9_L: Record<string, Record<string, string>> = {
  th: {
    "All Bangkok": "ทั่วกรุงเทพฯ",
    "Ari": "อารีย์",
    "Siam": "สยาม",
    "Thonglor": "ทองหล่อ",
    "Talad Noi": "ตลาดน้อย",
    "Talat Noi": "ตลาดน้อย",
    "Yaowarat": "เยาวราช",
    "Silom": "สีลม",
    "Ratchada": "รัชดา",
    "Rain until 9pm · indoor plans win tonight": "ฝนตกถึง 3 ทุ่ม · คืนนี้แผนในร่มชนะเลิศ",
    "Warm afternoon · shaded cafés & evening walks": "บ่ายอากาศอุ่น · แวะคาเฟ่ร่ม ๆ แล้วเดินเล่นเย็นนี้",
    "Plan ›": "ดูแพลน ›",
    "Tonight in Bangkok": "คืนนี้ในกรุงเทพฯ",
    "real public events": "อีเวนต์สาธารณะของจริง",
    "Who’s going? กริ๊ง!": "ใครไปบ้าง? กริ๊ง!",
    "I’m going to {0}": "ฉันกำลังจะไป {0}",
    "Be the first in {0} today": "ประเดิมคนแรกใน{0}วันนี้",
    "Post a photo or a plan. The first 3 posts each day win a café treat.": "โพสต์รูปหรือแพลน 3 โพสต์แรกของแต่ละวันรับดีลคาเฟ่ฟรี",
    "ASK A THAI": "ถามคนไทย",
    "Visiting? Ask anything — real Thais answer, no AI.": "มาเที่ยวเหรอ? ถามได้ทุกเรื่อง — คนไทยตัวจริงตอบ ไม่ใช่ AI",
    "Ask a question": "ถามคำถาม",
    "Search interests: coffee, running…": "ค้นหาความสนใจ: กาแฟ, วิ่ง…",
    "Everyone": "ทุกคน",
    "Here now": "อยู่ที่นี่ตอนนี้",
    "Visiting": "มาเที่ยว",
    "Here now · {0}": "อยู่ที่นี่ · {0}",
    "{0} · now": "{0} · ตอนนี้",
    "No one fits this filter yet": "ยังไม่มีใครตรงกับตัวกรองนี้",
    "Try clearing your filter or search to see everyone in Bangkok.": "ลองล้างตัวกรองหรือคำค้นหาเพื่อดูทุกคนในกรุงเทพฯ",
    "First 100": "100 คนแรก",
    "Be one of Kring’s first 100 in Bangkok": "ร่วมเป็น 1 ใน 100 คนแรกของ กริ๊ง! ในกรุงเทพฯ",
    "People appear here as they join. Create your card early to say hi first on launch day.": "สมาชิกจะปรากฏที่นี่เมื่อเข้าร่วม สร้างบัตรของคุณไว้ก่อนเพื่อทักทายได้ตั้งแต่วันเปิดตัว",
    "Create my card": "สร้างบัตรของฉัน",
    "Meanwhile": "ระหว่างนี้",
    "Lumpini Running Club · Thu 5:45pm": "Lumpini Running Club · พฤ. 17:45",
    "Real public event. Post “I’m going” and others can say hi.": "อีเวนต์สาธารณะของจริง โพสต์ว่า “ฉันจะไป” ให้คนอื่นทักทายได้",
    "More actions": "ตัวเลือกเพิ่มเติม",
    "Block {0}": "บล็อก {0}",
    "Kring treats": "ดีลพิเศษ กริ๊ง!",
    "Claim in 2 taps": "กดรับใน 2 แตะ",
    "Show QR at counter": "โชว์ QR ที่เคาน์เตอร์",
    "Pay the treat price": "จ่ายราคาพิเศษที่ร้าน",
    "Today’s treat": "ดีลเด่นวันนี้",
    "Quiet hours today · 2–5pm": "ช่วงร้านโล่งวันนี้ · 14:00–17:00",
    "Quiet hours today · 2:30–5pm": "ช่วงร้านโล่งวันนี้ · 14:30–17:00",
    "Quiet hours today · 1–4pm": "ช่วงร้านโล่งวันนี้ · 13:00–16:00",
    "Quiet hours today · 2–6pm": "ช่วงร้านโล่งวันนี้ · 14:00–18:00",
    "Quiet hours today · 1–5pm": "ช่วงร้านโล่งวันนี้ · 13:00–17:00",
    "Early evening · 5–6:30pm": "ช่วงหัวค่ำ · 17:00–18:30",
    "{0} left": "เหลือ {0} สิทธิ์",
    "Claim · กริ๊ง!": "รับสิทธิ์ · กริ๊ง!",
    "Claimed · show at counter": "รับแล้ว · โชว์ที่เคาน์เตอร์",
    "Classes": "คลาสเรียน",
    "Treats arrive 1 Dec": "ดีลพิเศษเริ่ม 1 ธ.ค.",
    "Partner cafés, gyms, studios, and food spots unlock their quiet-hour treats on 1 Dec.": "คาเฟ่ ยิม สตูดิโอ และร้านอาหารพาร์ทเนอร์จะเปิดดีลช่วงเวลาพิเศษวันที่ 1 ธ.ค. นี้",
    "Own a café, gym or studio?": "เป็นเจ้าของคาเฟ่ ยิม หรือสตูดิโอใช่ไหม?",
    "Fill your quiet hours. Free during launch.": "เติมลูกค้าช่วงร้านโล่ง เข้าร่วมฟรีช่วงเปิดตัว",
    "Join": "เข้าร่วม",
    "YOUR KRING CARD": "บัตร กริ๊ง! ของคุณ",
    "Explore Bangkok, make new friends": "มาเที่ยว ได้เพื่อนใหม่",
    "New friends in Bangkok": "เพื่อนใหม่ ในกรุงเทพฯ",
    "People into the same things": "คนที่ชอบเหมือนกัน",
    "Say hi to people heading the same way": "ทักทายคนที่กำลังไปทางเดียวกัน",
    "Claim café treats in quiet hours": "รับดีลคาเฟ่ราคาพิเศษช่วงร้านโล่ง",
    "Level up · passport stamps · weekly prizes": "อัปเลเวล · สะสมแสตมป์พาสปอร์ต · รางวัลประจำสัปดาห์",
    "Continue with Google": "ดำเนินการต่อด้วย Google",
    "More options": "ตัวเลือกอื่น",
    "Free · 20+ · we never post for you": "ฟรี · อายุ 20+ · เราไม่โพสต์แทนคุณ",
    "Without signing in": "ใช้งานได้โดยไม่ต้องล็อกอิน",
    "{0} places": "{0} แห่ง",
    "Today in BKK": "วันนี้ใน กทม.",
    "1155 · 191 · 1669": "1155 · 191 · 1669",
    "ANCHAN · LEVEL 1": "อัญชัน · เลเวล 1",
    "THAI TEA · LEVEL 2": "ชาไทย · เลเวล 2",
    "PANDAN · LEVEL 3": "ใบเตย · เลเวล 3",
    "Member since Nov 2026 · Day {0} of {1}": "สมาชิกตั้งแต่ พ.ย. 2026 · วันที่ {0} จาก {1}",
    "Member since Nov 2026 · {0}-day streak": "สมาชิกตั้งแต่ พ.ย. 2026 · ต่อเนื่อง {0} วัน",
    "plans joined": "แพลนที่เข้าร่วม",
    "hellos left today": "ทักทายได้อีกวันนี้",
    "saved on treats": "ประหยัดจากดีล",
    "Next: Thai tea level": "ถัดไป: เลเวลชาไทย",
    "{0} more post → 10% off coffee": "อีก {0} โพสต์ → ลดค่ากาแฟ 10%",
    "{0} more posts → 10% off coffee": "อีก {0} โพสต์ → ลดค่ากาแฟ 10%",
    "Bangkok passport": "พาสปอร์ตกรุงเทพฯ",
    "{0} of 6 stamps · free treat at 6": "{0} จาก 6 แสตมป์ · ครบ 6 รับดีลฟรี",
    "My plans": "แพลนของฉัน",
    "See all": "ดูทั้งหมด",
    "Post a plan": "โพสต์แพลน",
    "Night market · Fri 7pm": "ตลาดนัดกลางคืน · ศ. 19:00",
    "Run club · Sun": "ชมรมวิ่ง · อา.",
    "Sign-in opens on 1 Dec · join the waitlist": "ระบบล็อกอินเปิด 1 ธ.ค. · ลงชื่อรอรับสิทธิ์",
    "Leave your email and we’ll invite you the moment sign-in goes live on 1 Dec.": "ฝากอีเมลไว้ แล้วเราจะส่งคำเชิญให้คุณทันทีที่เปิดระบบล็อกอินในวันที่ 1 ธ.ค.",
    "Your email address": "อีเมลของคุณ",
    "Join the waitlist · กริ๊ง!": "ลงชื่อรอรับสิทธิ์ · กริ๊ง!",
    "You’re on the 1 Dec launch list · กริ๊ง!": "คุณอยู่ในรายชื่อเปิดตัว 1 ธ.ค. แล้ว · กริ๊ง!",
    "Enter a valid email first": "กรุณากรอกอีเมลให้ถูกต้องก่อน",
    "EXAMPLE": "ตัวอย่าง",
    "Public events · say hi": "อีเวนต์สาธารณะ · ทักทายได้",
    "Post": "โพสต์",
    "now": "ตอนนี้",
    "Partner cafés, gyms, and studios open quiet-hour treats on launch day. Claim in 2 taps and pay at the counter.": "คาเฟ่ ยิม และสตูดิโอพาร์ทเนอร์เปิดดีลช่วงร้านโล่งในวันเปิดตัว กดรับใน 2 แตะแล้วจ่ายที่เคาน์เตอร์",
    "Rain plan": "แผนรับมือฝน",
    "Shaded cafés": "คาเฟ่ร่ม ๆ",
    "Member since Nov 2026": "สมาชิกตั้งแต่ พ.ย. 2026",
    "Day {0} of {1}": "วันที่ {0} จาก {1}",
    "1 more post → 10% off coffee": "อีก 1 โพสต์ → ลดค่ากาแฟ 10%",
    "ANCHAN MEMBER": "สมาชิกอัญชัน",
    "Cafés": "คาเฟ่",
    "Claim": "กดรับ",
    "Classes & fun": "คลาสและกิจกรรม",
    "Coffee": "กาแฟ",
    "Coming soon": "เร็ว ๆ นี้",
    "Expats & nomads": "ชาวต่างชาติที่อยู่ไทย",
    "Free member card": "บัตรสมาชิกฟรี",
    "Fun": "สนุก",
    "GUEST": "ผู้เยี่ยมชม",
    "I’m going": "ฉันจะไป",
    "Member treat": "ดีลสมาชิก",
    "Next level": "เลเวลถัดไป",
    "PANDAN MEMBER": "สมาชิกใบเตย",
    "Pandan member": "สมาชิกใบเตย",
    "People appear here as they join": "คนที่เข้าร่วมจะขึ้นที่นี่",
    "Public event": "อีเวนต์สาธารณะ",
    "Rewards and passport": "รางวัลและพาสปอร์ต",
    "Sign in and make your card to see people and say hi.": "ลงชื่อเข้าใช้และสร้างบัตรของคุณ เพื่อดูผู้คนและทักทาย",
    "Sign in to say hi, claim treats and post": "ลงชื่อเข้าใช้เพื่อทักทาย รับดีล และโพสต์",
    "Sign in to start your card · free": "ลงชื่อเข้าใช้เพื่อเริ่มบัตรของคุณ · ฟรี",
    "Sign in · free": "ลงชื่อเข้าใช้ · ฟรี",
    "THAI TEA MEMBER": "สมาชิกชาไทย",
    "Thai tea member": "สมาชิกชาไทย",
    "YOUR PHOTO HERE": "รูปของคุณตรงนี้",
    "Your Bangkok trip": "ทริปกรุงเทพฯ ของคุณ",
    "Your photo here": "รูปของคุณตรงนี้",
    "You’re one of the first. Post a photo so people can find you.": "คุณเป็นหนึ่งในคนแรก ๆ โพสต์รูปเพื่อให้คนอื่นเห็นคุณ",
    "off": "ลด",
    "since Nov 2026": "ตั้งแต่ พ.ย. 2026",
    "{0} claimed today": "วันนี้รับไปแล้ว {0}",
    "{0} of 6 stamps": "แสตมป์ {0} จาก 6",
    "Street food": "สตรีทฟู้ด",
    "Food": "อาหาร",
    "Beauty & spa": "บิวตี้และสปา",
    "Beauty": "บิวตี้",
  },
  zh: {
    "All Bangkok": "全曼谷",
    "Ari": "阿里 (Ari)",
    "Siam": "暹罗 (Siam)",
    "Thonglor": "通罗 (Thonglor)",
    "Talad Noi": "哒叻仔",
    "Talat Noi": "哒叻仔",
    "Yaowarat": "耀华力 (唐人街)",
    "Silom": "是隆 (Silom)",
    "Ratchada": "拉差达",
    "Rain until 9pm · indoor plans win tonight": "降雨持续至晚 9 点 · 今晚适合室内活动",
    "Warm afternoon · shaded cafés & evening walks": "午后温暖 · 适合树荫咖啡馆与傍晚漫步",
    "Plan ›": "攻略 ›",
    "Tonight in Bangkok": "今晚在曼谷",
    "real public events": "真实公共活动",
    "Who’s going? กริ๊ง!": "谁一起去？กริ๊ง!",
    "I’m going to {0}": "我打算去 {0}",
    "Be the first in {0} today": "成为今天在 {0} 第一个分享的人",
    "Post a photo or a plan. The first 3 posts each day win a café treat.": "发一张照片或计划。每天前 3 条帖子可赢取咖啡福利。",
    "ASK A THAI": "问问泰国人",
    "Visiting? Ask anything — real Thais answer, no AI.": "来旅行？尽管问——泰国本地真人回答，非 AI。",
    "Ask a question": "提个问题",
    "Search interests: coffee, running…": "搜索兴趣：咖啡、跑步…",
    "Everyone": "所有人",
    "Here now": "现在在这儿",
    "Visiting": "旅行者",
    "Here now · {0}": "在这儿 · {0}",
    "{0} · now": "{0} · 现在",
    "No one fits this filter yet": "暂时没有人符合此筛选条件",
    "Try clearing your filter or search to see everyone in Bangkok.": "尝试清除筛选或搜索词以查看曼谷所有人。",
    "First 100": "首批 100 人",
    "Be one of Kring’s first 100 in Bangkok": "成为 Kring 曼谷首批 100 位成员之一",
    "People appear here as they join. Create your card early to say hi first on launch day.": "成员加入后会显示在这里。提前创建你的名片，上线当天抢先打招呼。",
    "Create my card": "创建我的名片",
    "Meanwhile": "与此同时",
    "Lumpini Running Club · Thu 5:45pm": "伦披尼跑步俱乐部 · 周四 17:45",
    "Real public event. Post “I’m going” and others can say hi.": "真实的公开活动。发布“我打算去”，其他人就能向你打招呼。",
    "More actions": "更多操作",
    "Block {0}": "屏蔽 {0}",
    "Kring treats": "Kring 礼遇",
    "Claim in 2 taps": "点 2 下即可领取",
    "Show QR at counter": "在柜台出示二维码",
    "Pay the treat price": "按礼遇价到店付款",
    "Today’s treat": "今日礼遇",
    "Quiet hours today · 2–5pm": "今日闲时可用 · 14:00–17:00",
    "Quiet hours today · 2:30–5pm": "今日闲时可用 · 14:30–17:00",
    "Quiet hours today · 1–4pm": "今日闲时可用 · 13:00–16:00",
    "Quiet hours today · 2–6pm": "今日闲时可用 · 14:00–18:00",
    "Quiet hours today · 1–5pm": "今日闲时可用 · 13:00–17:00",
    "Early evening · 5–6:30pm": "傍晚时段 · 17:00–18:30",
    "{0} left": "剩余 {0} 份",
    "Claim · กริ๊ง!": "领取 · กริ๊ง!",
    "Claimed · show at counter": "已领取 · 柜台出示",
    "Classes": "课程体验",
    "Treats arrive 1 Dec": "礼遇将于 12 月 1 日上线",
    "Partner cafés, gyms, studios, and food spots unlock their quiet-hour treats on 1 Dec.": "合作咖啡馆、拳馆、工作室与美食店将于 12 月 1 日开放闲时礼遇。",
    "Own a café, gym or studio?": "拥有咖啡馆、健身房或工作室？",
    "Fill your quiet hours. Free during launch.": "让闲时满座。上线期间免费入驻。",
    "Join": "入驻",
    "YOUR KRING CARD": "你的 KRING 名片",
    "Explore Bangkok, make new friends": "来曼谷玩，交新朋友",
    "New friends in Bangkok": "曼谷的新朋友",
    "People into the same things": "和你爱好相同的人",
    "Say hi to people heading the same way": "向顺路的人打个招呼",
    "Claim café treats in quiet hours": "在闲时领取咖啡馆专属礼遇",
    "Level up · passport stamps · weekly prizes": "升级 · 收集护照印章 · 每周好礼",
    "Continue with Google": "通过 Google 继续",
    "More options": "更多选项",
    "Free · 20+ · we never post for you": "免费 · 20岁以上 · 绝不代发动态",
    "Without signing in": "免登录也可使用",
    "{0} places": "{0} 个收藏",
    "Today in BKK": "今日曼谷",
    "1155 · 191 · 1669": "1155 · 191 · 1669",
    "ANCHAN · LEVEL 1": "蝶豆花 · 等级 1",
    "THAI TEA · LEVEL 2": "泰茶 · 等级 2",
    "PANDAN · LEVEL 3": "斑兰 · 等级 3",
    "Member since Nov 2026 · Day {0} of {1}": "2026年11月加入 · 第 {0}/{1} 天",
    "Member since Nov 2026 · {0}-day streak": "2026年11月加入 · 连续 {0} 天",
    "plans joined": "已参与计划",
    "hellos left today": "今日剩余招呼",
    "saved on treats": "礼遇已省金额",
    "Next: Thai tea level": "下一级：泰茶等级",
    "{0} more post → 10% off coffee": "再发 {0} 条 → 咖啡 9 折",
    "{0} more posts → 10% off coffee": "再发 {0} 条 → 咖啡 9 折",
    "Bangkok passport": "曼谷护照",
    "{0} of 6 stamps · free treat at 6": "{0}/6 枚印章 · 集满 6 枚送免费礼遇",
    "My plans": "我的计划",
    "See all": "查看全部",
    "Post a plan": "发布计划",
    "Night market · Fri 7pm": "夜市 · 周五 19:00",
    "Run club · Sun": "跑步俱乐部 · 周日",
    "Sign-in opens on 1 Dec · join the waitlist": "登录将于 12 月 1 日开放 · 加入候补名单",
    "Leave your email and we’ll invite you the moment sign-in goes live on 1 Dec.": "留下你的邮箱，12 月 1 日登录上线时我们将第一时间邀请你。",
    "Your email address": "你的电子邮箱",
    "Join the waitlist · กริ๊ง!": "加入候补名单 · กริ๊ง!",
    "You’re on the 1 Dec launch list · กริ๊ง!": "你已加入 12 月 1 日首发名单 · กริ๊ง!",
    "Enter a valid email first": "请先输入有效的电子邮箱",
    "EXAMPLE": "示例",
    "Public events · say hi": "公共活动 · 打个招呼",
    "Post": "发布",
    "now": "现在",
    "Partner cafés, gyms, and studios open quiet-hour treats on launch day. Claim in 2 taps and pay at the counter.": "合作咖啡馆、健身房与工作室将在上线当天开放闲时礼遇。点 2 下领取，到店在柜台付款。",
    "Rain plan": "雨天方案",
    "Shaded cafés": "树荫咖啡馆",
    "Member since Nov 2026": "2026年11月加入",
    "Day {0} of {1}": "第 {0}/{1} 天",
    "1 more post → 10% off coffee": "再发 1 条 → 咖啡 9 折",
    "ANCHAN MEMBER": "蝶豆花会员",
    "Cafés": "咖啡馆",
    "Claim": "领取",
    "Classes & fun": "课程与娱乐",
    "Coffee": "咖啡",
    "Coming soon": "即将上线",
    "Expats & nomads": "外籍人士和数字游民",
    "Free member card": "免费会员卡",
    "Fun": "娱乐",
    "GUEST": "访客",
    "I’m going": "我要去",
    "Member treat": "会员优惠",
    "Next level": "下一级",
    "PANDAN MEMBER": "斑斓会员",
    "Pandan member": "斑斓会员",
    "People appear here as they join": "新加入的人会出现在这里",
    "Public event": "公共活动",
    "Rewards and passport": "奖励与护照",
    "Sign in and make your card to see people and say hi.": "登录并创建你的卡片，就能看到大家并打招呼。",
    "Sign in to say hi, claim treats and post": "登录后可打招呼、领取优惠和发帖",
    "Sign in to start your card · free": "登录开启你的卡片 · 免费",
    "Sign in · free": "登录 · 免费",
    "THAI TEA MEMBER": "泰式奶茶会员",
    "Thai tea member": "泰式奶茶会员",
    "YOUR PHOTO HERE": "你的照片放这里",
    "Your Bangkok trip": "你的曼谷之旅",
    "Your photo here": "你的照片放这里",
    "You’re one of the first. Post a photo so people can find you.": "你是最早的一批人。发张照片让大家找到你。",
    "off": "折扣",
    "since Nov 2026": "自 2026 年 11 月",
    "{0} claimed today": "今天已领取 {0}",
    "{0} of 6 stamps": "印章 {0}/6",
    "Street food": "街头小吃",
    "Food": "美食",
    "Beauty & spa": "美容与水疗",
    "Beauty": "美容",
  },
  hi: {
    "All Bangkok": "पूरा बैंकॉक",
    "Ari": "आरी (Ari)",
    "Siam": "सियाम (Siam)",
    "Thonglor": "थोंगलोर (Thonglor)",
    "Talad Noi": "तलात नोई",
    "Talat Noi": "तलात नोई",
    "Yaowarat": "याओवरात",
    "Silom": "सिलोम",
    "Ratchada": "राचादा",
    "Rain until 9pm · indoor plans win tonight": "रात 9 बजे तक बारिश · आज इनडोर प्लान बेहतर हैं",
    "Warm afternoon · shaded cafés & evening walks": "गर्म दोपहर · छायादार कैफ़े और शाम की सैर",
    "Plan ›": "प्लान ›",
    "Tonight in Bangkok": "आज रात बैंकॉक में",
    "real public events": "असली पब्लिक इवेंट्स",
    "Who’s going? กริ๊ง!": "कौन चल रहा है? กริ๊ง!",
    "I’m going to {0}": "मैं {0} जा रहा/रही हूँ",
    "Be the first in {0} today": "आज {0} में पोस्ट करने वाले पहले बनें",
    "Post a photo or a plan. The first 3 posts each day win a café treat.": "फ़ोटो या प्लान पोस्ट करें। रोज़ की पहली 3 पोस्ट को कैफ़े ट्रीट मिलती है।",
    "ASK A THAI": "किसी थाई से पूछें",
    "Visiting? Ask anything — real Thais answer, no AI.": "घूमने आए हैं? कुछ भी पूछें — असली थाई लोग जवाब देते हैं, AI नहीं।",
    "Ask a question": "सवाल पूछें",
    "Search interests: coffee, running…": "दिलचस्पी खोजें: कॉफ़ी, रनिंग…",
    "Everyone": "सभी",
    "Here now": "अभी यहाँ",
    "Visiting": "यात्री",
    "Here now · {0}": "अभी यहाँ · {0}",
    "{0} · now": "{0} · अभी",
    "No one fits this filter yet": "अभी इस फ़िल्टर से कोई मेल नहीं खाता",
    "Try clearing your filter or search to see everyone in Bangkok.": "बैंकॉक में सभी को देखने के लिए फ़िल्टर या खोज हटाएँ।",
    "First 100": "पहले 100",
    "Be one of Kring’s first 100 in Bangkok": "बैंकॉक में Kring के पहले 100 सदस्यों में शामिल हों",
    "People appear here as they join. Create your card early to say hi first on launch day.": "जैसे-जैसे लोग जुड़ेंगे यहाँ दिखेंगे। लॉन्च के दिन सबसे पहले हाय कहने के लिए अपना कार्ड बनाएँ।",
    "Create my card": "मेरा कार्ड बनाएँ",
    "Meanwhile": "तब तक",
    "Lumpini Running Club · Thu 5:45pm": "लुम्पिनी रनिंग क्लब · गुरु शाम 5:45",
    "Real public event. Post “I’m going” and others can say hi.": "असली सार्वजनिक इवेंट। “मैं जा रहा हूँ” पोस्ट करें ताकि बाकी लोग हाय कह सकें।",
    "More actions": "अन्य विकल्प",
    "Block {0}": "{0} को ब्लॉक करें",
    "Kring treats": "Kring ट्रीट्स",
    "Claim in 2 taps": "2 टैप में लें",
    "Show QR at counter": "काउंटर पर QR दिखाएँ",
    "Pay the treat price": "काउंटर पर ट्रीट कीमत दें",
    "Today’s treat": "आज की ट्रीट",
    "Quiet hours today · 2–5pm": "आज शांत घंटे · दोपहर 2–5",
    "Quiet hours today · 2:30–5pm": "आज शांत घंटे · दोपहर 2:30–5",
    "Quiet hours today · 1–4pm": "आज शांत घंटे · दोपहर 1–4",
    "Quiet hours today · 2–6pm": "आज शांत घंटे · दोपहर 2–6",
    "Quiet hours today · 1–5pm": "आज शांत घंटे · दोपहर 1–5",
    "Early evening · 5–6:30pm": "शाम · 5–6:30",
    "{0} left": "{0} बाकी",
    "Claim · กริ๊ง!": "लें · กริ๊ง!",
    "Claimed · show at counter": "ले लिया · काउंटर पर दिखाएँ",
    "Classes": "क्लासेस",
    "Treats arrive 1 Dec": "ट्रीट्स 1 दिसंबर से",
    "Partner cafés, gyms, studios, and food spots unlock their quiet-hour treats on 1 Dec.": "पार्टनर कैफ़े, जिम, स्टूडियो और फ़ूड स्पॉट्स 1 दिसंबर को अपने ऑफ़र खोलेंगे।",
    "Own a café, gym or studio?": "क्या आपका कैफ़े, जिम या स्टूडियो है?",
    "Fill your quiet hours. Free during launch.": "अपने शांत घंटों में मेहमान पाएँ। लॉन्च के दौरान मुफ़्त।",
    "Join": "जुड़ें",
    "YOUR KRING CARD": "आपका KRING कार्ड",
    "Explore Bangkok, make new friends": "बैंकॉक घूमें, नए दोस्त बनाएँ",
    "New friends in Bangkok": "बैंकॉक में नए दोस्त",
    "People into the same things": "आपकी जैसी पसंद वाले लोग",
    "Say hi to people heading the same way": "उसी तरफ़ जा रहे लोगों को हाय कहें",
    "Claim café treats in quiet hours": "शांत घंटों में कैफ़े ट्रीट्स लें",
    "Level up · passport stamps · weekly prizes": "लेवल अप · पासपोर्ट स्टैम्प्स · साप्ताहिक इनाम",
    "Continue with Google": "Google से जारी रखें",
    "More options": "अन्य विकल्प",
    "Free · 20+ · we never post for you": "मुफ़्त · 20+ · हम आपकी तरफ़ से कभी पोस्ट नहीं करते",
    "Without signing in": "बिना साइन इन किए",
    "{0} places": "{0} जगहें",
    "Today in BKK": "आज बैंकॉक में",
    "1155 · 191 · 1669": "1155 · 191 · 1669",
    "ANCHAN · LEVEL 1": "अनचन · लेवल 1",
    "THAI TEA · LEVEL 2": "थाई टी · लेवल 2",
    "PANDAN · LEVEL 3": "पांडन · लेवल 3",
    "Member since Nov 2026 · Day {0} of {1}": "नवंबर 2026 से सदस्य · दिन {0} / {1}",
    "Member since Nov 2026 · {0}-day streak": "नवंबर 2026 से सदस्य · {0}-दिन स्ट्रीक",
    "plans joined": "शामिल प्लान",
    "hellos left today": "आज बाकी हाय",
    "saved on treats": "ट्रीट्स पर बचत",
    "Next: Thai tea level": "अगला: थाई टी लेवल",
    "{0} more post → 10% off coffee": "{0} और पोस्ट → कॉफ़ी पर 10% छूट",
    "{0} more posts → 10% off coffee": "{0} और पोस्ट → कॉफ़ी पर 10% छूट",
    "Bangkok passport": "बैंकॉक पासपोर्ट",
    "{0} of 6 stamps · free treat at 6": "6 में से {0} स्टैम्प · 6 पर मुफ़्त ट्रीट",
    "My plans": "मेरे प्लान",
    "See all": "सभी देखें",
    "Post a plan": "प्लान पोस्ट करें",
    "Night market · Fri 7pm": "नाइट मार्केट · शुक्र शाम 7",
    "Run club · Sun": "रन क्लब · रवि",
    "Sign-in opens on 1 Dec · join the waitlist": "साइन-इन 1 दिसंबर को खुलेगा · वेटलिस्ट में जुड़ें",
    "Leave your email and we’ll invite you the moment sign-in goes live on 1 Dec.": "अपना ईमेल छोड़ें — 1 दिसंबर को साइन-इन शुरू होते ही हम आपको आमंत्रित करेंगे।",
    "Your email address": "आपका ईमेल पता",
    "Join the waitlist · กริ๊ง!": "वेटलिस्ट में जुड़ें · กริ๊ง!",
    "You’re on the 1 Dec launch list · กริ๊ง!": "आप 1 दिसंबर की लॉन्च लिस्ट में जुड़ गए हैं · กริ๊ง!",
    "Enter a valid email first": "कृपया पहले सही ईमेल लिखें",
    "EXAMPLE": "उदाहरण",
    "Public events · say hi": "पब्लिक इवेंट्स · हाय कहें",
    "Post": "पोस्ट करें",
    "now": "अभी",
    "Partner cafés, gyms, and studios open quiet-hour treats on launch day. Claim in 2 taps and pay at the counter.": "पार्टनर कैफ़े, जिम और स्टूडियो लॉन्च के दिन शांत-घंटों के ट्रीट्स खोलेंगे। 2 टैप में लें और काउंटर पर भुगतान करें।",
    "Rain plan": "बारिश प्लान",
    "Shaded cafés": "छायादार कैफ़े",
    "Member since Nov 2026": "नवंबर 2026 से सदस्य",
    "Day {0} of {1}": "दिन {0} / {1}",
    "1 more post → 10% off coffee": "1 और पोस्ट → कॉफ़ी पर 10% छूट",
    "ANCHAN MEMBER": "अंचन मेंबर",
    "Cafés": "कैफ़े",
    "Claim": "लें",
    "Classes & fun": "क्लास और मज़ा",
    "Coffee": "कॉफ़ी",
    "Coming soon": "जल्द आ रहा है",
    "Expats & nomads": "एक्सपैट्स और नोमैड्स",
    "Free member card": "फ़्री मेंबर कार्ड",
    "Fun": "मज़ा",
    "GUEST": "मेहमान",
    "I’m going": "मैं जा रहा/रही हूँ",
    "Member treat": "मेंबर ट्रीट",
    "Next level": "अगला लेवल",
    "PANDAN MEMBER": "पांडन मेंबर",
    "Pandan member": "पांडन मेंबर",
    "People appear here as they join": "जुड़ने वाले लोग यहाँ दिखेंगे",
    "Public event": "पब्लिक इवेंट",
    "Rewards and passport": "इनाम और पासपोर्ट",
    "Sign in and make your card to see people and say hi.": "लोगों को देखने और हाय कहने के लिए साइन इन करके अपना कार्ड बनाएँ।",
    "Sign in to say hi, claim treats and post": "हाय कहने, ट्रीट लेने और पोस्ट करने के लिए साइन इन करें",
    "Sign in to start your card · free": "अपना कार्ड शुरू करने के लिए साइन इन करें · फ़्री",
    "Sign in · free": "साइन इन · फ़्री",
    "THAI TEA MEMBER": "थाई टी मेंबर",
    "Thai tea member": "थाई टी मेंबर",
    "YOUR PHOTO HERE": "आपकी फ़ोटो यहाँ",
    "Your Bangkok trip": "आपकी बैंकॉक ट्रिप",
    "Your photo here": "आपकी फ़ोटो यहाँ",
    "You’re one of the first. Post a photo so people can find you.": "आप सबसे पहले लोगों में हैं। फ़ोटो पोस्ट करें ताकि लोग आपको ढूँढ सकें।",
    "off": "छूट",
    "since Nov 2026": "नवंबर 2026 से",
    "{0} claimed today": "आज {0} ने लिया",
    "{0} of 6 stamps": "6 में से {0} स्टैम्प",
    "Street food": "स्ट्रीट फ़ूड",
    "Food": "खाना",
    "Beauty & spa": "ब्यूटी और स्पा",
    "Beauty": "ब्यूटी",
  },
  ja: {
    "All Bangkok": "バンコク全域",
    "Ari": "アーリー",
    "Siam": "サイアム",
    "Thonglor": "トンロー",
    "Talad Noi": "タラートノイ",
    "Talat Noi": "タラートノイ",
    "Yaowarat": "ヤワラート",
    "Silom": "シーロム",
    "Ratchada": "ラチャダー",
    "Rain until 9pm · indoor plans win tonight": "21時まで雨予報 · 今夜は屋内プランがおすすめ",
    "Warm afternoon · shaded cafés & evening walks": "暖かい午後 · 日陰のカフェと夕方の散歩に最適",
    "Plan ›": "プラン ›",
    "Tonight in Bangkok": "今夜のバンコク",
    "real public events": "実際の公開イベント",
    "Who’s going? กริ๊ง!": "行く人いる？ กริ๊ง!",
    "I’m going to {0}": "{0} に行きます",
    "Be the first in {0} today": "今日の {0} で最初の投稿者に",
    "Post a photo or a plan. The first 3 posts each day win a café treat.": "写真や予定を投稿しよう。毎日最初の3件の投稿にカフェ特典をプレゼント。",
    "ASK A THAI": "タイ人に聞く",
    "Visiting? Ask anything — real Thais answer, no AI.": "旅行中？何でも聞いてください — AIではなく本物のタイ人が答えます。",
    "Ask a question": "質問する",
    "Search interests: coffee, running…": "興味で検索：コーヒー、ランニング…",
    "Everyone": "全員",
    "Here now": "今ここにいる",
    "Visiting": "旅行中",
    "Here now · {0}": "今ここ · {0}",
    "{0} · now": "{0} · 今",
    "No one fits this filter yet": "この条件に合う人はまだいません",
    "Try clearing your filter or search to see everyone in Bangkok.": "フィルターや検索をクリアしてバンコクの全員を表示しましょう。",
    "First 100": "最初の100人",
    "Be one of Kring’s first 100 in Bangkok": "バンコクで Kring 最初の100人のメンバーになろう",
    "People appear here as they join. Create your card early to say hi first on launch day.": "参加したメンバーがここに表示されます。公開日にすぐ挨拶できるよう早めにカードを作成しましょう。",
    "Create my card": "カードを作成",
    "Meanwhile": "その間に",
    "Lumpini Running Club · Thu 5:45pm": "ルンピニー・ランニングクラブ · 木曜 17:45",
    "Real public event. Post “I’m going” and others can say hi.": "実際の公開イベント。「行きます」と投稿すると他の人が挨拶できます。",
    "More actions": "その他の操作",
    "Block {0}": "{0} をブロック",
    "Kring treats": "Kring 特典",
    "Claim in 2 taps": "2タップで取得",
    "Show QR at counter": "会計時にQRを提示",
    "Pay the treat price": "特典価格をお支払い",
    "Today’s treat": "今日の特典",
    "Quiet hours today · 2–5pm": "本日のオフピーク · 14:00–17:00",
    "Quiet hours today · 2:30–5pm": "本日のオフピーク · 14:30–17:00",
    "Quiet hours today · 1–4pm": "本日のオフピーク · 13:00–16:00",
    "Quiet hours today · 2–6pm": "本日のオフピーク · 14:00–18:00",
    "Quiet hours today · 1–5pm": "本日のオフピーク · 13:00–17:00",
    "Early evening · 5–6:30pm": "夕方 · 17:00–18:30",
    "{0} left": "残り {0} 枠",
    "Claim · กริ๊ง!": "受け取る · กริ๊ง!",
    "Claimed · show at counter": "取得済み · カウンターで提示",
    "Classes": "クラス・体験",
    "Treats arrive 1 Dec": "特典は12月1日スタート",
    "Partner cafés, gyms, studios, and food spots unlock their quiet-hour treats on 1 Dec.": "提携カフェ、ジム、スタジオ、飲食店のオフピーク特典は12月1日に公開されます。",
    "Own a café, gym or studio?": "カフェ・ジム・スタジオのオーナー様へ",
    "Fill your quiet hours. Free during launch.": "アイドルタイムを集客に。ローンチ期間は無料。",
    "Join": "参加する",
    "YOUR KRING CARD": "あなたの KRING カード",
    "Explore Bangkok, make new friends": "バンコクを楽しんで、新しい友だちを",
    "New friends in Bangkok": "バンコクの新しい友だち",
    "People into the same things": "同じことが好きな人たち",
    "Say hi to people heading the same way": "同じ方向へ向かう人に気軽にあいさつ",
    "Claim café treats in quiet hours": "オフピーク時間にカフェ特典を利用",
    "Level up · passport stamps · weekly prizes": "レベルアップ · パスポートスタンプ · 週替わり特典",
    "Continue with Google": "Google で続ける",
    "More options": "その他の方法",
    "Free · 20+ · we never post for you": "無料 · 20歳以上 · 勝手な投稿は一切ありません",
    "Without signing in": "ログインせずに使える機能",
    "{0} places": "{0} 件",
    "Today in BKK": "今日のバンコク",
    "1155 · 191 · 1669": "1155 · 191 · 1669",
    "ANCHAN · LEVEL 1": "アンチャン · レベル 1",
    "THAI TEA · LEVEL 2": "タイティー · レベル 2",
    "PANDAN · LEVEL 3": "パンダン · レベル 3",
    "Member since Nov 2026 · Day {0} of {1}": "2026年11月登録 · {1}日中 {0}日目",
    "Member since Nov 2026 · {0}-day streak": "2026年11月登録 · {0}日連続",
    "plans joined": "参加した予定",
    "hellos left today": "今日の残りあいさつ",
    "saved on treats": "特典での節約額",
    "Next: Thai tea level": "次：タイティー・レベル",
    "{0} more post → 10% off coffee": "あと{0}件の投稿 → コーヒー10%オフ",
    "{0} more posts → 10% off coffee": "あと{0}件の投稿 → コーヒー10%オフ",
    "Bangkok passport": "バンコク・パスポート",
    "{0} of 6 stamps · free treat at 6": "スタンプ {0}/6個 · 6個で無料特典",
    "My plans": "マイプラン",
    "See all": "すべて見る",
    "Post a plan": "予定を投稿",
    "Night market · Fri 7pm": "ナイトマーケット · 金曜 19:00",
    "Run club · Sun": "ランクラブ · 日曜",
    "Sign-in opens on 1 Dec · join the waitlist": "ログインは12月1日開始 · ウェイトリストに登録",
    "Leave your email and we’ll invite you the moment sign-in goes live on 1 Dec.": "メールアドレスを登録すると、12月1日のログイン開始と同時にご招待します。",
    "Your email address": "メールアドレス",
    "Join the waitlist · กริ๊ง!": "ウェイトリストに登録 · กริ๊ง!",
    "You’re on the 1 Dec launch list · กริ๊ง!": "12月1日の先行リストに登録しました · กริ๊ง!",
    "Enter a valid email first": "有効なメールアドレスを入力してください",
    "EXAMPLE": "例",
    "Public events · say hi": "公開イベント · 気軽にあいさつ",
    "Post": "投稿",
    "now": "今",
    "Partner cafés, gyms, and studios open quiet-hour treats on launch day. Claim in 2 taps and pay at the counter.": "提携カフェ・ジム・スタジオのオフピーク特典は公開日にスタート。2タップで取得しカウンターでお支払い。",
    "Rain plan": "雨の日プラン",
    "Shaded cafés": "日陰のカフェ",
    "Member since Nov 2026": "2026年11月登録",
    "Day {0} of {1}": "{1}日中 {0}日目",
    "1 more post → 10% off coffee": "あと1件の投稿 → コーヒー10%オフ",
    "ANCHAN MEMBER": "アンチャン会員",
    "Cafés": "カフェ",
    "Claim": "受け取る",
    "Classes & fun": "クラス・体験",
    "Coffee": "コーヒー",
    "Coming soon": "近日公開",
    "Expats & nomads": "在住外国人・ノマド",
    "Free member card": "無料会員カード",
    "Fun": "お楽しみ",
    "GUEST": "ゲスト",
    "I’m going": "行きます",
    "Member treat": "会員特典",
    "Next level": "次のレベル",
    "PANDAN MEMBER": "パンダン会員",
    "Pandan member": "パンダン会員",
    "People appear here as they join": "参加した人がここに表示されます",
    "Public event": "公開イベント",
    "Rewards and passport": "特典とパスポート",
    "Sign in and make your card to see people and say hi.": "ログインしてカードを作ると、人を見てあいさつできます。",
    "Sign in to say hi, claim treats and post": "ログインしてあいさつ・特典・投稿",
    "Sign in to start your card · free": "ログインしてカードを作成 · 無料",
    "Sign in · free": "ログイン · 無料",
    "THAI TEA MEMBER": "タイティー会員",
    "Thai tea member": "タイティー会員",
    "YOUR PHOTO HERE": "あなたの写真をここに",
    "Your Bangkok trip": "あなたのバンコク旅",
    "Your photo here": "あなたの写真をここに",
    "You’re one of the first. Post a photo so people can find you.": "あなたは最初のメンバーの一人。写真を投稿して見つけてもらおう。",
    "off": "オフ",
    "since Nov 2026": "2026年11月から",
    "{0} claimed today": "今日 {0} 件受け取り",
    "{0} of 6 stamps": "スタンプ {0}/6",
    "Street food": "屋台グルメ",
    "Food": "グルメ",
    "Beauty & spa": "美容・スパ",
    "Beauty": "美容",
  },
  ko: {
    "All Bangkok": "방콕 전체",
    "Ari": "아리 (Ari)",
    "Siam": "시암 (Siam)",
    "Thonglor": "통로 (Thonglor)",
    "Talad Noi": "탈랏노이",
    "Talat Noi": "탈랏노이",
    "Yaowarat": "야와랏 (차이나타운)",
    "Silom": "실롬 (Silom)",
    "Ratchada": "라차다",
    "Rain until 9pm · indoor plans win tonight": "밤 9시까지 비 예보 · 오늘 밤은 실내 일정이 딱이에요",
    "Warm afternoon · shaded cafés & evening walks": "따뜻한 오후 · 그늘진 카페와 저녁 산책을 추천해요",
    "Plan ›": "일정 ›",
    "Tonight in Bangkok": "오늘 밤 방콕",
    "real public events": "실제 공개 행사",
    "Who’s going? กริ๊ง!": "같이 갈 사람? กริ๊ง!",
    "I’m going to {0}": "저 {0} 가요",
    "Be the first in {0} today": "오늘 {0}의 첫 게시물을 올려보세요",
    "Post a photo or a plan. The first 3 posts each day win a café treat.": "사진이나 일정을 올려보세요. 매일 첫 3개의 게시물에는 카페 혜택을 드려요.",
    "ASK A THAI": "태국인에게 묻기",
    "Visiting? Ask anything — real Thais answer, no AI.": "여행 중이신가요? 무엇이든 물어보세요 — AI가 아닌 실제 태국인이 답해드려요.",
    "Ask a question": "질문하기",
    "Search interests: coffee, running…": "관심사 검색: 커피, 러닝…",
    "Everyone": "전체",
    "Here now": "지금 여기",
    "Visiting": "여행 중",
    "Here now · {0}": "지금 여기 · {0}",
    "{0} · now": "{0} · 지금",
    "No one fits this filter yet": "아직 이 필터에 맞는 사람이 없어요",
    "Try clearing your filter or search to see everyone in Bangkok.": "방콕의 모든 멤버를 보려면 필터나 검색어를 지워보세요.",
    "First 100": "첫 100명",
    "Be one of Kring’s first 100 in Bangkok": "방콕 Kring의 첫 100명 멤버가 되어보세요",
    "People appear here as they join. Create your card early to say hi first on launch day.": "합류하는 멤버들이 이곳에 표시됩니다. 출시일에 먼저 인사할 수 있도록 카드를 미리 만들어 두세요.",
    "Create my card": "내 카드 만들기",
    "Meanwhile": "그동안 여기는 어때요?",
    "Lumpini Running Club · Thu 5:45pm": "룸피니 러닝 클럽 · 목 17:45",
    "Real public event. Post “I’m going” and others can say hi.": "실제 공개 이벤트예요. ‘저 가요’라고 올리면 다른 멤버들이 인사할 수 있어요.",
    "More actions": "더보기",
    "Block {0}": "{0} 차단",
    "Kring treats": "Kring 혜택",
    "Claim in 2 taps": "2번 탭해 받기",
    "Show QR at counter": "카운터에 QR 제시",
    "Pay the treat price": "할인가로 현장 결제",
    "Today’s treat": "오늘의 혜택",
    "Quiet hours today · 2–5pm": "오늘 한가한 시간 · 오후 2–5시",
    "Quiet hours today · 2:30–5pm": "오늘 한가한 시간 · 오후 2:30–5시",
    "Quiet hours today · 1–4pm": "오늘 한가한 시간 · 오후 1–4시",
    "Quiet hours today · 2–6pm": "오늘 한가한 시간 · 오후 2–6시",
    "Quiet hours today · 1–5pm": "오늘 한가한 시간 · 오후 1–5시",
    "Early evening · 5–6:30pm": "이른 저녁 · 오후 5–6:30",
    "{0} left": "{0}개 남음",
    "Claim · กริ๊ง!": "받기 · กริ๊ง!",
    "Claimed · show at counter": "받음 · 카운터에 제시",
    "Classes": "클래스",
    "Treats arrive 1 Dec": "혜택 12월 1일 오픈",
    "Partner cafés, gyms, studios, and food spots unlock their quiet-hour treats on 1 Dec.": "파트너 카페, 짐, 스튜디오, 맛집의 한가한 시간 혜택이 12월 1일에 열립니다.",
    "Own a café, gym or studio?": "카페, 짐, 스튜디오를 운영하시나요?",
    "Fill your quiet hours. Free during launch.": "한가한 시간을 채워보세요. 출시 기간 무료.",
    "Join": "파트너 신청",
    "YOUR KRING CARD": "나의 KRING 카드",
    "Explore Bangkok, make new friends": "방콕을 즐기고, 새 친구를 사귀어요",
    "New friends in Bangkok": "방콕의 새 친구",
    "People into the same things": "같은 걸 좋아하는 사람들",
    "Say hi to people heading the same way": "같은 방향으로 가는 사람들에게 인사해요",
    "Claim café treats in quiet hours": "한가한 시간대 카페 혜택을 받아요",
    "Level up · passport stamps · weekly prizes": "레벨업 · 여권 스탬프 · 주간 선물",
    "Continue with Google": "Google로 계속하기",
    "More options": "다른 방법 보기",
    "Free · 20+ · we never post for you": "무료 · 만 20세 이상 · 임의로 게시하지 않아요",
    "Without signing in": "로그인 없이 바로 쓰기",
    "{0} places": "{0}곳",
    "Today in BKK": "오늘의 방콕",
    "1155 · 191 · 1669": "1155 · 191 · 1669",
    "ANCHAN · LEVEL 1": "안찬 · 레벨 1",
    "THAI TEA · LEVEL 2": "타이티 · 레벨 2",
    "PANDAN · LEVEL 3": "판단 · 레벨 3",
    "Member since Nov 2026 · Day {0} of {1}": "2026년 11월 가입 · {1}일 중 {0}일째",
    "Member since Nov 2026 · {0}-day streak": "2026년 11월 가입 · {0}일 연속",
    "plans joined": "참여한 일정",
    "hellos left today": "오늘 남은 인사",
    "saved on treats": "혜택 절약 금액",
    "Next: Thai tea level": "다음: 타이티 레벨",
    "{0} more post → 10% off coffee": "게시물 {0}개 더 → 커피 10% 할인",
    "{0} more posts → 10% off coffee": "게시물 {0}개 더 → 커피 10% 할인",
    "Bangkok passport": "방콕 여권",
    "{0} of 6 stamps · free treat at 6": "스탬프 {0}/6개 · 6개 모으면 무료 혜택",
    "My plans": "내 일정",
    "See all": "모두 보기",
    "Post a plan": "일정 올리기",
    "Night market · Fri 7pm": "야시장 · 금 오후 7시",
    "Run club · Sun": "런 클럽 · 일",
    "Sign-in opens on 1 Dec · join the waitlist": "로그인 12월 1일 오픈 · 대기자 명단 등록",
    "Leave your email and we’ll invite you the moment sign-in goes live on 1 Dec.": "이메일을 남겨주시면 12월 1일 로그인이 열리자마자 초대해 드릴게요.",
    "Your email address": "이메일 주소",
    "Join the waitlist · กริ๊ง!": "대기자 등록 · กริ๊ง!",
    "You’re on the 1 Dec launch list · กริ๊ง!": "12월 1일 출시 알림 명단에 등록되었어요 · กริ๊ง!",
    "Enter a valid email first": "먼저 올바른 이메일을 입력해 주세요",
    "EXAMPLE": "예시",
    "Public events · say hi": "공개 모임 · 인사해요",
    "Post": "게시",
    "now": "지금",
    "Partner cafés, gyms, and studios open quiet-hour treats on launch day. Claim in 2 taps and pay at the counter.": "파트너 카페, 짐, 스튜디오가 출시일에 한가한 시간 혜택을 엽니다. 2번 탭해 받고 카운터에서 결제하세요.",
    "Rain plan": "우천 일정",
    "Shaded cafés": "그늘진 카페",
    "Member since Nov 2026": "2026년 11월 가입",
    "Day {0} of {1}": "{1}일 중 {0}일째",
    "1 more post → 10% off coffee": "게시물 1개 더 → 커피 10% 할인",
    "ANCHAN MEMBER": "안찬 멤버",
    "Cafés": "카페",
    "Claim": "받기",
    "Classes & fun": "클래스 & 즐길 거리",
    "Coffee": "커피",
    "Coming soon": "곧 공개",
    "Expats & nomads": "외국인 거주자 & 노마드",
    "Free member card": "무료 멤버 카드",
    "Fun": "즐길 거리",
    "GUEST": "게스트",
    "I’m going": "저 가요",
    "Member treat": "멤버 혜택",
    "Next level": "다음 레벨",
    "PANDAN MEMBER": "판단 멤버",
    "Pandan member": "판단 멤버",
    "People appear here as they join": "가입한 사람들이 여기에 보여요",
    "Public event": "공개 행사",
    "Rewards and passport": "보상 & 여권",
    "Sign in and make your card to see people and say hi.": "로그인하고 카드를 만들면 사람들을 보고 인사할 수 있어요.",
    "Sign in to say hi, claim treats and post": "로그인하고 인사, 혜택 받기, 게시하기",
    "Sign in to start your card · free": "로그인하고 카드 시작하기 · 무료",
    "Sign in · free": "로그인 · 무료",
    "THAI TEA MEMBER": "타이티 멤버",
    "Thai tea member": "타이티 멤버",
    "YOUR PHOTO HERE": "여기에 당신의 사진",
    "Your Bangkok trip": "나의 방콕 여행",
    "Your photo here": "여기에 당신의 사진",
    "You’re one of the first. Post a photo so people can find you.": "당신은 첫 멤버 중 한 명이에요. 사진을 올리면 사람들이 찾을 수 있어요.",
    "off": "할인",
    "since Nov 2026": "2026년 11월부터",
    "{0} claimed today": "오늘 {0}명 받음",
    "{0} of 6 stamps": "도장 {0}/6",
    "Street food": "길거리 음식",
    "Food": "음식",
    "Beauty & spa": "뷰티 & 스파",
    "Beauty": "뷰티",
  },
};

/** Feed top bar with the + button and area chips. Off in the live app since 15 Nov (founder): weather + chat only (demo/test builds keep it). */
const FEED_TOP_BAR = false;
/** 16 Nov: the weekly-prize ticker on the Feed, beside the weather pill (founder copy pack §1). One flag turns it off; the Me card stays. */
const PRIZE_TICKER_ON_FEED = true;

const QA_L: Record<string, Record<string, string>> = {"th": {"Something went wrong": "มีบางอย่างผิดพลาด", "Your saved places, deals, and queued messages are safe on your phone.": "ที่บันทึกไว้ ดีล และข้อความที่รอส่ง ยังอยู่ในเครื่องของคุณ", "Reload Kring": "โหลด กริ๊ง! ใหม่", "Quiet in the Bangkok Feed right now": "ตอนนี้ฟีดกรุงเทพฯ ยังเงียบอยู่", "Share a neighbourhood café photo or ask a question about Bangkok to start today’s feed.": "แชร์รูปคาเฟ่ในย่าน หรือถามอะไรเกี่ยวกับกรุงเทพฯ เพื่อเริ่มฟีดวันนี้", "Post a photo": "โพสต์รูป", "Ask a Thai": "ถามคนไทย", "Ask a Thai · Local Q&amp;A": "ถามคนไทย · ถาม-ตอบคนท้องถิ่น", "Answer": "ตอบ", "Ask yours": "ถามของคุณ", "★ Best of week": "★ ดีที่สุดของสัปดาห์", "Online now": "ออนไลน์อยู่", "Loading people in Bangkok…": "กำลังโหลดผู้คนในกรุงเทพฯ…", "Clear filters": "ล้างตัวกรอง", "Partner venue perks coming soon": "สิทธิพิเศษจากร้านพาร์ทเนอร์ เร็ว ๆ นี้", "Partner cafés and food spots appear here as soon as they join Kring.": "คาเฟ่และร้านอาหารพาร์ทเนอร์จะขึ้นที่นี่ทันทีที่เข้าร่วม กริ๊ง!", "Kring member card": "บัตรสมาชิก กริ๊ง!", "You are browsing as a guest": "คุณกำลังดูแบบผู้เยี่ยมชม", "Sign in to make your member card": "ลงชื่อเข้าใช้เพื่อสร้างบัตรสมาชิก", "Today in Bangkok": "วันนี้ที่กรุงเทพฯ", "Local’s pick for this weather": "คนท้องถิ่นแนะนำสำหรับอากาศแบบนี้", "Next ›": "ถัดไป ›", "กริ๊ง! Say hi": "กริ๊ง! ทักทาย", "Say hi · กริ๊ง!": "ทักทาย · กริ๊ง!", "One-message rule:": "กฎหนึ่งข้อความ:", "Sign in to continue": "ลงชื่อเข้าใช้เพื่อดำเนินการต่อ", "Browsing is always open. Sign in once to send a hello, claim a venue deal, or post a photo.": "ดูได้เสมอโดยไม่ต้องล็อกอิน ลงชื่อเข้าใช้ครั้งเดียวเพื่อทักทาย รับดีล หรือโพสต์รูป", "✈ Visiting Bangkok": "✈ มาเที่ยวกรุงเทพฯ", "🏠 I live here": "🏠 ฉันอยู่ที่นี่", "Continue with Apple": "ดำเนินการต่อด้วย Apple", "G Continue with Google": "G ดำเนินการต่อด้วย Google", "LINE Continue with LINE": "LINE ดำเนินการต่อด้วย LINE", "We only notify you when someone replies to your hello or answers your question. Zero spam.": "เราแจ้งเตือนเฉพาะตอนมีคนตอบคำทักทายหรือตอบคำถามของคุณ ไม่มีสแปม", "Turn on reply ring · กริ๊ง!": "เปิดเสียงแจ้งตอบกลับ · กริ๊ง!", "Share neighbourhood area only?": "แชร์แค่ชื่อย่านไหม?", "“I’m here now” shows only the neighbourhood name (like": "“อยู่ที่นี่ตอนนี้” จะแสดงแค่ชื่อย่าน (เช่น", ") — never your exact street or distance — and turns off automatically after 2 hours.": ") ไม่แสดงถนนหรือระยะทาง และปิดเองอัตโนมัติหลัง 2 ชั่วโมง", "Allow area-only for 2 hours": "อนุญาตเฉพาะชื่อย่าน 2 ชั่วโมง", "Share with Bangkok": "แชร์กับกรุงเทพฯ", "Post a photo or story": "โพสต์รูปหรือสตอรี่", "Share a café, street bite, or neighbourhood moment": "แชร์คาเฟ่ ของกินริมทาง หรือโมเมนต์ในย่าน", "Get real tips from locals on where to eat, walk, or explore": "รับเคล็ดลับจริงจากคนท้องถิ่น ว่าจะกิน เดิน หรือเที่ยวที่ไหน", "Feed Post": "โพสต์ในฟีด", "Area Story (24h)": "สตอรี่ย่าน (24 ชม.)", "+ Add area": "+ เพิ่มย่าน", "I’m here now (2h area only)": "อยู่ที่นี่ตอนนี้ (เฉพาะย่าน 2 ชม.)", "Share now · กริ๊ง!": "แชร์เลย · กริ๊ง!", "Post question to Feed": "โพสต์คำถามลงฟีด", "Share your local tip": "แชร์เคล็ดลับของคุณ", "Post answer": "โพสต์คำตอบ", "Filter people": "กรองผู้คน", "Speaks": "พูดภาษา", "Who": "ใคร", "Availability": "ว่างตอนไหน", "Report profile": "รายงานโปรไฟล์", "Deal for two · Split at counter": "ดีลสำหรับสองคน · แยกจ่ายที่เคาน์เตอร์", "Plan": "แพลน", "Deal": "ดีล", "Photo": "รูป", "Voice": "เสียง", "Show at counter · works offline": "โชว์ที่เคาน์เตอร์ · ใช้ได้แม้ออฟไลน์", "Valid for": "ใช้ได้อีก", "What “✓ verified” means": "“✓ ยืนยันแล้ว” หมายถึงอะไร", "A green": "ป้ายสีเขียว", "✓ verified": "✓ ยืนยันแล้ว", "Public places · In groups · Chats translated. Pick public cafés, BTS skywalks or lively food spots, and use the green shield in any chat for 1-tap help.": "ที่สาธารณะ · เป็นกลุ่ม · แชทแปลให้ เลือกคาเฟ่ สกายวอล์ก BTS หรือร้านอาหารที่คนเยอะ และกดโล่สีเขียวในแชตเพื่อขอความช่วยเหลือได้ใน 1 แตะ", "Scan at a café to connect &amp; log your Bangkok passport stamp": "สแกนที่คาเฟ่ เพื่อเชื่อมต่อและเก็บแสตมป์พาสปอร์ตกรุงเทพฯ", "Remove": "ลบ", "Traveller Passport": "พาสปอร์ตนักเดินทาง", "Thai Local Streak": "สตรีคคนไทย", "Trip Collection": "คอลเลกชันทริป", "🎟 Venue deals claimed": "🎟 ดีลร้านที่รับแล้ว", "👋 New friends over coffee": "👋 เพื่อนใหม่จากร้านกาแฟ", "💬 Ask a Thai questions": "💬 คำถาม ถามคนไทย", "Daily helper reward": "รางวัลคนช่วยประจำวัน", "Save profile": "บันทึกโปรไฟล์", "Hello sent · usually replies within a few hours · we’ll ring you": "ส่งคำทักทายแล้ว · ปกติตอบภายในไม่กี่ชั่วโมง · เราจะกริ๊งบอก", "Ticket saved to Me · show code at counter": "บันทึกตั๋วไว้ที่ ฉัน แล้ว · โชว์โค้ดที่เคาน์เตอร์", "Link copied": "คัดลอกลิงก์แล้ว", "Link ready to share": "ลิงก์พร้อมแชร์", "Area-only badge on · auto-turns off after 2 hours": "เปิดป้ายเฉพาะย่านแล้ว · ปิดเองหลัง 2 ชม.", "Add a photo first": "เพิ่มรูปก่อน", "Write your question first": "เขียนคำถามก่อน", "Question queued · will post when back online": "คำถามรอส่ง · จะโพสต์เมื่อกลับมาออนไลน์", "Question posted · we’ll ring you when answered": "โพสต์คำถามแล้ว · มีคนตอบเมื่อไรเราจะกริ๊งบอก", "Write a helpful tip first": "เขียนเคล็ดลับก่อน", "Your PDPA data JSON has been downloaded": "ดาวน์โหลดข้อมูล PDPA (JSON) แล้ว", "Data export prepared": "เตรียมไฟล์ข้อมูลแล้ว", "Signed out": "ออกจากระบบแล้ว", "Profile updated": "อัปเดตโปรไฟล์แล้ว", "Signed in with {0}": "ลงชื่อเข้าใช้ด้วย {0} แล้ว", "Queued hello to {0} · will send automatically when back online": "คำทักทายถึง {0} รอส่ง · จะส่งเองเมื่อออนไลน์", "No stories in {0} yet today — tap + to share the first one!": "วันนี้ยังไม่มีสตอรี่ใน {0} กด + เพื่อแชร์เป็นคนแรก!", "We’ll ring you as soon as {0} replies": "{0} ตอบเมื่อไร เราจะกริ๊งบอกทันที", "Back online · sent {0} queued items": "กลับมาออนไลน์ · ส่งรายการที่รอ {0} รายการแล้ว", "Write one friendly hello…": "เขียนคำทักทายสั้น ๆ หนึ่งข้อความ…", "What is good here right now?": "ตอนนี้ที่นี่มีอะไรดี?", "Ask anything about Bangkok cafés, neighbourhoods, street food, or getting around…": "ถามอะไรก็ได้เรื่องคาเฟ่ ย่าน ของกินริมทาง หรือการเดินทางในกรุงเทพฯ…", "Name the exact soi, best time to go, or what to order…": "บอกซอย เวลาที่ดีที่สุด หรือเมนูที่ควรสั่ง…", "Write a message (Thai auto-translates)…": "พิมพ์ข้อความ (แปลไทยอัตโนมัติ)…", "Your name": "ชื่อของคุณ", "Languages (e.g. EN · HI)": "ภาษา (เช่น TH · EN)", "One-line interest hook": "แนะนำตัวสั้น ๆ หนึ่งบรรทัด", "Claim · 2 taps": "รับ · กด 2 ครั้ง", "Example": "ตัวอย่าง", "for 2 people": "สำหรับ 2 คน", "Speaks {0}": "พูด {0}", "Thai locals": "คนไทย", "Travellers": "นักเดินทาง", "Anyone": "ทุกคน", "Any language": "ทุกภาษา", "Show {0} people": "ดู {0} คน", "Change photo": "เปลี่ยนรูป", "＋ Add photo": "＋ เพิ่มรูป", "Replying to {0} post": "ตอบโพสต์จาก {0}", "Replying to {0} story": "ตอบสตอรี่จาก {0}", "{0} of 15 daily hellos left today · no external links or phone numbers": "วันนี้ทักได้อีก {0} จาก 15 ครั้ง · ห้ามใส่ลิงก์หรือเบอร์โทร", "Hi {0}! Around for an iced coffee or short walk today?": "สวัสดี {0}! วันนี้ว่างไปกินกาแฟเย็นหรือเดินเล่นสั้น ๆ ไหม?", "Hey {0}! Which spot in this area is your favourite right now?": "หวัดดี {0}! แถวนี้ตอนนี้ชอบร้านไหนที่สุด?", "Hi {0}! Would you like to split a 2-for-1 coffee deal?": "สวัสดี {0}! ไปใช้ดีลกาแฟ 2 แก้วด้วยกันไหม?", "Hi {0}! Would love to say hi — are you around for coffee or a walk today?": "สวัสดี {0}! อยากทักทายหน่อย วันนี้ว่างไปกินกาแฟหรือเดินเล่นไหม?", "Expires at midnight": "หมดอายุเที่ยงคืน", "Want us to ring you when {0} replies?": "ให้เรากริ๊งบอกเมื่อ {0} ตอบไหม?", "Pay ฿{0} ({1}) at counter": "จ่าย ฿{0} ({1}) ที่เคาน์เตอร์", "Thai auto-translated": "แปลไทยอัตโนมัติ", "Traveller": "นักเดินทาง", "Thai local": "คนไทย", "Write a short friendly hello first.": "เขียนคำทักทายสั้น ๆ ก่อน", "Links are blocked in a first hello. Keep your first message inside Kring.": "ข้อความแรกห้ามใส่ลิงก์ คุยกันใน กริ๊ง! ก่อนนะ", "Phone numbers are blocked in a first hello for everyone’s safety.": "เพื่อความปลอดภัย ข้อความแรกห้ามใส่เบอร์โทร", "LINE IDs and external handles are blocked in the first message. Chat opens once they reply.": "ข้อความแรกห้ามใส่ไอดี LINE หรือบัญชีภายนอก แชตจะเปิดเมื่ออีกฝ่ายตอบ", "Please keep your first hello friendly and safe.": "ขอให้คำทักทายแรกเป็นมิตรและปลอดภัยนะ", "You already sent your one hello to {0}. Full chat opens as soon as they reply.": "คุณทัก {0} ไปแล้ว 1 ครั้ง แชตจะเปิดเมื่อเขาตอบ", "You have reached your daily limit of 15 hellos today. Try again tomorrow!": "วันนี้ทักครบ 15 ครั้งแล้ว พรุ่งนี้ลองใหม่นะ!"}, "zh": {"Something went wrong": "出了点问题", "Your saved places, deals, and queued messages are safe on your phone.": "你收藏的地点、优惠和待发消息都安全保存在手机上。", "Reload Kring": "重新加载 Kring", "Quiet in the Bangkok Feed right now": "曼谷动态现在还很安静", "Share a neighbourhood café photo or ask a question about Bangkok to start today’s feed.": "分享一张街区咖啡馆照片，或问一个关于曼谷的问题，开启今天的动态。", "Post a photo": "发照片", "Ask a Thai": "问问泰国人", "Ask a Thai · Local Q&amp;A": "问问泰国人 · 本地问答", "Answer": "回答", "Ask yours": "提问", "★ Best of week": "★ 本周最佳", "Online now": "在线", "Loading people in Bangkok…": "正在加载曼谷的人…", "Clear filters": "清除筛选", "Partner venue perks coming soon": "合作店铺福利即将上线", "Partner cafés and food spots appear here as soon as they join Kring.": "合作咖啡馆和美食店加入 Kring 后会立刻出现在这里。", "Kring member card": "Kring 会员卡", "You are browsing as a guest": "你正在以访客身份浏览", "Sign in to make your member card": "登录以创建会员卡", "Today in Bangkok": "今日曼谷", "Local’s pick for this weather": "本地人推荐（适合今天天气）", "Next ›": "下一个 ›", "กริ๊ง! Say hi": "กริ๊ง! 打招呼", "Say hi · กริ๊ง!": "打招呼 · กริ๊ง!", "One-message rule:": "一条消息规则：", "Sign in to continue": "登录以继续", "Browsing is always open. Sign in once to send a hello, claim a venue deal, or post a photo.": "浏览随时开放。登录一次即可打招呼、领取店铺优惠或发照片。", "✈ Visiting Bangkok": "✈ 来曼谷旅行", "🏠 I live here": "🏠 我住在这里", "Continue with Apple": "通过 Apple 继续", "G Continue with Google": "G 通过 Google 继续", "LINE Continue with LINE": "LINE 通过 LINE 继续", "We only notify you when someone replies to your hello or answers your question. Zero spam.": "只有在有人回复你的招呼或回答你的问题时才通知你。零骚扰。", "Turn on reply ring · กริ๊ง!": "开启回复提醒 · กริ๊ง!", "Share neighbourhood area only?": "只分享所在街区？", "“I’m here now” shows only the neighbourhood name (like": "“我在这儿”只显示街区名称（如", ") — never your exact street or distance — and turns off automatically after 2 hours.": "），绝不显示具体街道或距离，2 小时后自动关闭。", "Allow area-only for 2 hours": "允许仅显示街区 2 小时", "Share with Bangkok": "分享给曼谷", "Post a photo or story": "发照片或快拍", "Share a café, street bite, or neighbourhood moment": "分享咖啡馆、街头小吃或街区瞬间", "Get real tips from locals on where to eat, walk, or explore": "向本地人获取吃喝、散步、探索的真实建议", "Feed Post": "动态帖子", "Area Story (24h)": "街区快拍 (24 小时)", "+ Add area": "+ 添加街区", "I’m here now (2h area only)": "我在这儿（仅街区，2 小时）", "Share now · กริ๊ง!": "立即分享 · กริ๊ง!", "Post question to Feed": "把问题发到动态", "Share your local tip": "分享你的本地建议", "Post answer": "发布回答", "Filter people": "筛选用户", "Speaks": "会说", "Who": "谁", "Availability": "空闲状态", "Report profile": "举报资料", "Deal for two · Split at counter": "双人优惠 · 柜台分开付", "Plan": "计划", "Deal": "优惠", "Photo": "照片", "Voice": "语音", "Show at counter · works offline": "在柜台出示 · 离线可用", "Valid for": "有效期", "What “✓ verified” means": "“✓ 已验证”是什么意思", "A green": "绿色的", "✓ verified": "✓ 已验证", "Public places · In groups · Chats translated. Pick public cafés, BTS skywalks or lively food spots, and use the green shield in any chat for 1-tap help.": "公共场所 · 结伴成群 · 聊天自动翻译。选择公共咖啡馆、BTS 天桥或热闹的餐饮点，聊天中点绿色盾牌即可一键求助。", "Scan at a café to connect &amp; log your Bangkok passport stamp": "在咖啡馆扫码，互相连接并记录曼谷护照印章", "Remove": "移除", "Traveller Passport": "旅行者护照", "Thai Local Streak": "泰国本地连续打卡", "Trip Collection": "旅程收藏", "🎟 Venue deals claimed": "🎟 已领取的店铺优惠", "👋 New friends over coffee": "👋 喝咖啡认识的新朋友", "💬 Ask a Thai questions": "💬 问问泰国人 提问数", "Daily helper reward": "每日助人奖励", "Save profile": "保存资料", "Hello sent · usually replies within a few hours · we’ll ring you": "招呼已发送 · 通常几小时内回复 · 我们会提醒你", "Ticket saved to Me · show code at counter": "券已保存到“我” · 在柜台出示代码", "Link copied": "链接已复制", "Link ready to share": "链接可分享", "Area-only badge on · auto-turns off after 2 hours": "已开启仅街区标识 · 2 小时后自动关闭", "Add a photo first": "请先添加照片", "Write your question first": "请先写下问题", "Question queued · will post when back online": "问题已排队 · 恢复联网后发布", "Question posted · we’ll ring you when answered": "问题已发布 · 有回答时会提醒你", "Write a helpful tip first": "请先写下有用的建议", "Your PDPA data JSON has been downloaded": "你的 PDPA 数据 JSON 已下载", "Data export prepared": "数据导出已准备好", "Signed out": "已退出登录", "Profile updated": "资料已更新", "Signed in with {0}": "已通过 {0} 登录", "Queued hello to {0} · will send automatically when back online": "给 {0} 的招呼已排队 · 联网后自动发送", "No stories in {0} yet today — tap + to share the first one!": "今天 {0} 还没有快拍 — 点 + 分享第一个！", "We’ll ring you as soon as {0} replies": "{0} 一回复就提醒你", "Back online · sent {0} queued items": "已恢复联网 · 已发送 {0} 条待发内容", "Write one friendly hello…": "写一句友好的招呼…", "What is good here right now?": "这里现在有什么好的？", "Ask anything about Bangkok cafés, neighbourhoods, street food, or getting around…": "问任何关于曼谷咖啡馆、街区、街头小吃或交通的问题…", "Name the exact soi, best time to go, or what to order…": "写出具体的巷子、最佳时间或推荐点什么…", "Write a message (Thai auto-translates)…": "写消息（泰语自动翻译）…", "Your name": "你的名字", "Languages (e.g. EN · HI)": "语言（如 ZH · EN）", "One-line interest hook": "一句话兴趣介绍", "Claim · 2 taps": "领取 · 点 2 下", "Example": "示例", "for 2 people": "2 人份", "Speaks {0}": "会说 {0}", "Thai locals": "泰国本地人", "Travellers": "旅行者", "Anyone": "所有人", "Any language": "任何语言", "Show {0} people": "显示 {0} 人", "Change photo": "更换照片", "＋ Add photo": "＋ 添加照片", "Replying to {0} post": "回复 {0} 的帖子", "Replying to {0} story": "回复 {0} 的快拍", "{0} of 15 daily hellos left today · no external links or phone numbers": "今天还剩 {0}/15 次招呼 · 不可含外部链接或电话", "Hi {0}! Around for an iced coffee or short walk today?": "嗨 {0}！今天有空喝杯冰咖啡或散散步吗？", "Hey {0}! Which spot in this area is your favourite right now?": "嘿 {0}！这附近你现在最喜欢哪里？", "Hi {0}! Would you like to split a 2-for-1 coffee deal?": "嗨 {0}！要不要一起用买一送一的咖啡优惠？", "Hi {0}! Would love to say hi — are you around for coffee or a walk today?": "嗨 {0}！想打个招呼——今天有空喝咖啡或散步吗？", "Expires at midnight": "午夜过期", "Want us to ring you when {0} replies?": "{0} 回复时要提醒你吗？", "Pay ฿{0} ({1}) at counter": "在柜台支付 ฿{0}（{1}）", "Thai auto-translated": "泰语自动翻译", "Traveller": "旅行者", "Thai local": "泰国本地人", "Write a short friendly hello first.": "请先写一句友好的招呼。", "Links are blocked in a first hello. Keep your first message inside Kring.": "首次招呼不能含链接，请先在 Kring 内聊天。", "Phone numbers are blocked in a first hello for everyone’s safety.": "为了大家的安全，首次招呼不能含电话号码。", "LINE IDs and external handles are blocked in the first message. Chat opens once they reply.": "首条消息不能含 LINE ID 或外部账号。对方回复后即可聊天。", "Please keep your first hello friendly and safe.": "请让第一句招呼友好且安全。", "You already sent your one hello to {0}. Full chat opens as soon as they reply.": "你已向 {0} 打过招呼。对方回复后即可完整聊天。", "You have reached your daily limit of 15 hellos today. Try again tomorrow!": "今天 15 次招呼已用完，明天再试！"}, "hi": {"Something went wrong": "कुछ गड़बड़ हो गई", "Your saved places, deals, and queued messages are safe on your phone.": "आपकी सेव की गई जगहें, डील और कतार में रखे संदेश आपके फ़ोन पर सुरक्षित हैं।", "Reload Kring": "Kring फिर से लोड करें", "Quiet in the Bangkok Feed right now": "बैंकॉक फ़ीड अभी शांत है", "Share a neighbourhood café photo or ask a question about Bangkok to start today’s feed.": "आज की फ़ीड शुरू करने के लिए किसी मोहल्ले के कैफ़े की फ़ोटो शेयर करें या बैंकॉक के बारे में सवाल पूछें।", "Post a photo": "फ़ोटो पोस्ट करें", "Ask a Thai": "किसी थाई से पूछें", "Ask a Thai · Local Q&amp;A": "किसी थाई से पूछें · लोकल सवाल-जवाब", "Answer": "जवाब दें", "Ask yours": "अपना सवाल पूछें", "★ Best of week": "★ हफ़्ते का बेस्ट", "Online now": "अभी ऑनलाइन", "Loading people in Bangkok…": "बैंकॉक के लोग लोड हो रहे हैं…", "Clear filters": "फ़िल्टर हटाएँ", "Partner venue perks coming soon": "पार्टनर जगहों के ऑफ़र जल्द आ रहे हैं", "Partner cafés and food spots appear here as soon as they join Kring.": "पार्टनर कैफ़े और खाने की जगहें Kring से जुड़ते ही यहाँ दिखेंगी।", "Kring member card": "Kring मेंबर कार्ड", "You are browsing as a guest": "आप मेहमान के रूप में देख रहे हैं", "Sign in to make your member card": "मेंबर कार्ड बनाने के लिए साइन इन करें", "Today in Bangkok": "आज बैंकॉक में", "Local’s pick for this weather": "इस मौसम के लिए लोकल पसंद", "Next ›": "अगला ›", "กริ๊ง! Say hi": "กริ๊ง! हाय कहें", "Say hi · กริ๊ง!": "हाय कहें · กริ๊ง!", "One-message rule:": "एक-संदेश नियम:", "Sign in to continue": "जारी रखने के लिए साइन इन करें", "Browsing is always open. Sign in once to send a hello, claim a venue deal, or post a photo.": "देखना हमेशा खुला है। हाय भेजने, डील लेने या फ़ोटो पोस्ट करने के लिए एक बार साइन इन करें।", "✈ Visiting Bangkok": "✈ बैंकॉक घूमने आए हैं", "🏠 I live here": "🏠 मैं यहीं रहता/रहती हूँ", "Continue with Apple": "Apple से जारी रखें", "G Continue with Google": "G Google से जारी रखें", "LINE Continue with LINE": "LINE LINE से जारी रखें", "We only notify you when someone replies to your hello or answers your question. Zero spam.": "हम सिर्फ़ तब बताते हैं जब कोई आपके हाय या सवाल का जवाब दे। कोई स्पैम नहीं।", "Turn on reply ring · กริ๊ง!": "रिप्लाई रिंग चालू करें · กริ๊ง!", "Share neighbourhood area only?": "सिर्फ़ इलाका शेयर करें?", "“I’m here now” shows only the neighbourhood name (like": "“मैं अभी यहाँ हूँ” सिर्फ़ इलाके का नाम दिखाता है (जैसे", ") — never your exact street or distance — and turns off automatically after 2 hours.": ") — कभी आपकी सड़क या दूरी नहीं — और 2 घंटे बाद अपने-आप बंद हो जाता है।", "Allow area-only for 2 hours": "2 घंटे के लिए सिर्फ़ इलाका दिखाएँ", "Share with Bangkok": "बैंकॉक के साथ शेयर करें", "Post a photo or story": "फ़ोटो या स्टोरी पोस्ट करें", "Share a café, street bite, or neighbourhood moment": "कैफ़े, स्ट्रीट फ़ूड या मोहल्ले का कोई पल शेयर करें", "Get real tips from locals on where to eat, walk, or explore": "लोकल लोगों से असली टिप्स पाएँ — कहाँ खाएँ, घूमें या एक्सप्लोर करें", "Feed Post": "फ़ीड पोस्ट", "Area Story (24h)": "इलाका स्टोरी (24 घंटे)", "+ Add area": "+ इलाका जोड़ें", "I’m here now (2h area only)": "मैं अभी यहाँ हूँ (2 घंटे, सिर्फ़ इलाका)", "Share now · กริ๊ง!": "अभी शेयर करें · กริ๊ง!", "Post question to Feed": "सवाल फ़ीड पर पोस्ट करें", "Share your local tip": "अपनी लोकल टिप शेयर करें", "Post answer": "जवाब पोस्ट करें", "Filter people": "लोगों को फ़िल्टर करें", "Speaks": "बोलते हैं", "Who": "कौन", "Availability": "उपलब्धता", "Report profile": "प्रोफ़ाइल रिपोर्ट करें", "Deal for two · Split at counter": "दो लोगों की डील · काउंटर पर बाँटें", "Plan": "प्लान", "Deal": "डील", "Photo": "फ़ोटो", "Voice": "आवाज़", "Show at counter · works offline": "काउंटर पर दिखाएँ · ऑफ़लाइन भी चलता है", "Valid for": "मान्य समय", "What “✓ verified” means": "“✓ verified” का मतलब", "A green": "हरा", "✓ verified": "✓ verified", "Public places · In groups · Chats translated. Pick public cafés, BTS skywalks or lively food spots, and use the green shield in any chat for 1-tap help.": "सार्वजनिक जगहें · ग्रुप में · चैट का अनुवाद। सार्वजनिक कैफ़े, BTS स्काईवॉक या भीड़ वाली खाने की जगहें चुनें, और मदद के लिए किसी भी चैट में हरी ढाल दबाएँ।", "Scan at a café to connect &amp; log your Bangkok passport stamp": "कैफ़े में स्कैन करें — जुड़ें और अपनी बैंकॉक पासपोर्ट स्टैम्प लें", "Remove": "हटाएँ", "Traveller Passport": "ट्रैवलर पासपोर्ट", "Thai Local Streak": "थाई लोकल स्ट्रीक", "Trip Collection": "ट्रिप कलेक्शन", "🎟 Venue deals claimed": "🎟 ली गई डील", "👋 New friends over coffee": "👋 कॉफ़ी पर बने नए दोस्त", "💬 Ask a Thai questions": "💬 Ask a Thai सवाल", "Daily helper reward": "रोज़ का मददगार इनाम", "Save profile": "प्रोफ़ाइल सेव करें", "Hello sent · usually replies within a few hours · we’ll ring you": "हाय भेज दिया · आमतौर पर कुछ घंटों में जवाब · हम आपको बताएँगे", "Ticket saved to Me · show code at counter": "टिकट 'मैं' में सेव · काउंटर पर कोड दिखाएँ", "Link copied": "लिंक कॉपी हो गया", "Link ready to share": "लिंक शेयर के लिए तैयार", "Area-only badge on · auto-turns off after 2 hours": "सिर्फ़-इलाका बैज चालू · 2 घंटे बाद अपने-आप बंद", "Add a photo first": "पहले फ़ोटो जोड़ें", "Write your question first": "पहले अपना सवाल लिखें", "Question queued · will post when back online": "सवाल कतार में · ऑनलाइन होते ही पोस्ट होगा", "Question posted · we’ll ring you when answered": "सवाल पोस्ट हो गया · जवाब आने पर हम बताएँगे", "Write a helpful tip first": "पहले एक काम की टिप लिखें", "Your PDPA data JSON has been downloaded": "आपका PDPA डेटा JSON डाउनलोड हो गया", "Data export prepared": "डेटा एक्सपोर्ट तैयार", "Signed out": "साइन आउट हो गया", "Profile updated": "प्रोफ़ाइल अपडेट हो गई", "Signed in with {0}": "{0} से साइन इन हो गया", "Queued hello to {0} · will send automatically when back online": "{0} को हाय कतार में · ऑनलाइन होते ही अपने-आप जाएगा", "No stories in {0} yet today — tap + to share the first one!": "आज {0} में अभी कोई स्टोरी नहीं — पहली शेयर करने के लिए + दबाएँ!", "We’ll ring you as soon as {0} replies": "{0} के जवाब देते ही हम बताएँगे", "Back online · sent {0} queued items": "फिर ऑनलाइन · कतार के {0} आइटम भेजे", "Write one friendly hello…": "एक दोस्ताना हाय लिखें…", "What is good here right now?": "यहाँ अभी क्या अच्छा है?", "Ask anything about Bangkok cafés, neighbourhoods, street food, or getting around…": "बैंकॉक के कैफ़े, इलाकों, स्ट्रीट फ़ूड या आने-जाने के बारे में कुछ भी पूछें…", "Name the exact soi, best time to go, or what to order…": "सही सोई, जाने का सबसे अच्छा समय या क्या ऑर्डर करें बताएँ…", "Write a message (Thai auto-translates)…": "संदेश लिखें (थाई अपने-आप अनुवाद)…", "Your name": "आपका नाम", "Languages (e.g. EN · HI)": "भाषाएँ (जैसे EN · HI)", "One-line interest hook": "एक लाइन में अपनी दिलचस्पी", "Claim · 2 taps": "लें · 2 टैप", "Example": "उदाहरण", "for 2 people": "2 लोगों के लिए", "Speaks {0}": "{0} बोलते हैं", "Thai locals": "थाई लोकल", "Travellers": "यात्री", "Anyone": "कोई भी", "Any language": "कोई भी भाषा", "Show {0} people": "{0} लोग दिखाएँ", "Change photo": "फ़ोटो बदलें", "＋ Add photo": "＋ फ़ोटो जोड़ें", "Replying to {0} post": "{0} की पोस्ट का जवाब", "Replying to {0} story": "{0} की स्टोरी का जवाब", "{0} of 15 daily hellos left today · no external links or phone numbers": "आज 15 में से {0} हाय बाकी · कोई बाहरी लिंक या फ़ोन नंबर नहीं", "Hi {0}! Around for an iced coffee or short walk today?": "हाय {0}! आज आइस्ड कॉफ़ी या छोटी सैर के लिए फ़्री हो?", "Hey {0}! Which spot in this area is your favourite right now?": "हे {0}! इस इलाके में अभी तुम्हारी पसंदीदा जगह कौन सी है?", "Hi {0}! Would you like to split a 2-for-1 coffee deal?": "हाय {0}! 2-फ़ॉर-1 कॉफ़ी डील साथ में लोगे?", "Hi {0}! Would love to say hi — are you around for coffee or a walk today?": "हाय {0}! बस हाय कहना था — आज कॉफ़ी या सैर के लिए फ़्री हो?", "Expires at midnight": "आधी रात को खत्म", "Want us to ring you when {0} replies?": "{0} के जवाब देने पर बताएँ?", "Pay ฿{0} ({1}) at counter": "काउंटर पर ฿{0} ({1}) दें", "Thai auto-translated": "थाई अपने-आप अनुवाद", "Traveller": "यात्री", "Thai local": "थाई लोकल", "Write a short friendly hello first.": "पहले एक छोटा दोस्ताना हाय लिखें।", "Links are blocked in a first hello. Keep your first message inside Kring.": "पहले हाय में लिंक मना है। पहला संदेश Kring के अंदर रखें।", "Phone numbers are blocked in a first hello for everyone’s safety.": "सबकी सुरक्षा के लिए पहले हाय में फ़ोन नंबर मना है।", "LINE IDs and external handles are blocked in the first message. Chat opens once they reply.": "पहले संदेश में LINE ID या बाहरी हैंडल मना है। जवाब मिलते ही चैट खुल जाएगी।", "Please keep your first hello friendly and safe.": "कृपया पहला हाय दोस्ताना और सुरक्षित रखें।", "You already sent your one hello to {0}. Full chat opens as soon as they reply.": "आप {0} को अपना एक हाय भेज चुके हैं। जवाब मिलते ही पूरी चैट खुलेगी।", "You have reached your daily limit of 15 hellos today. Try again tomorrow!": "आज की 15 हाय की सीमा पूरी हो गई। कल फिर कोशिश करें!"}, "ja": {"Something went wrong": "問題が発生しました", "Your saved places, deals, and queued messages are safe on your phone.": "保存した場所・特典・送信待ちメッセージは端末に安全に残っています。", "Reload Kring": "Kring を再読み込み", "Quiet in the Bangkok Feed right now": "バンコクのフィードは今静かです", "Share a neighbourhood café photo or ask a question about Bangkok to start today’s feed.": "近所のカフェの写真を共有するか、バンコクについて質問して今日のフィードを始めましょう。", "Post a photo": "写真を投稿", "Ask a Thai": "タイ人に聞く", "Ask a Thai · Local Q&amp;A": "タイ人に聞く · 地元Q&A", "Answer": "回答する", "Ask yours": "質問する", "★ Best of week": "★ 今週のベスト", "Online now": "オンライン", "Loading people in Bangkok…": "バンコクの人を読み込み中…", "Clear filters": "絞り込みを解除", "Partner venue perks coming soon": "提携店の特典はまもなく", "Partner cafés and food spots appear here as soon as they join Kring.": "提携カフェや飲食店は Kring に参加するとここに表示されます。", "Kring member card": "Kring 会員カード", "You are browsing as a guest": "ゲストとして閲覧中です", "Sign in to make your member card": "ログインして会員カードを作成", "Today in Bangkok": "今日のバンコク", "Local’s pick for this weather": "この天気に地元民のおすすめ", "Next ›": "次へ ›", "กริ๊ง! Say hi": "กริ๊ง! あいさつ", "Say hi · กริ๊ง!": "あいさつ · กริ๊ง!", "One-message rule:": "1メッセージルール：", "Sign in to continue": "続けるにはログイン", "Browsing is always open. Sign in once to send a hello, claim a venue deal, or post a photo.": "閲覧はいつでも自由。あいさつ・特典の受け取り・写真投稿には一度ログインしてください。", "✈ Visiting Bangkok": "✈ バンコク旅行中", "🏠 I live here": "🏠 ここに住んでいます", "Continue with Apple": "Apple で続ける", "G Continue with Google": "G Google で続ける", "LINE Continue with LINE": "LINE LINE で続ける", "We only notify you when someone replies to your hello or answers your question. Zero spam.": "通知はあいさつへの返信や質問への回答があった時だけ。スパムなし。", "Turn on reply ring · กริ๊ง!": "返信通知をオン · กริ๊ง!", "Share neighbourhood area only?": "エリア名だけ共有しますか？", "“I’m here now” shows only the neighbourhood name (like": "「今ここにいる」はエリア名だけを表示（例：", ") — never your exact street or distance — and turns off automatically after 2 hours.": "）。正確な通りや距離は表示されず、2時間後に自動でオフになります。", "Allow area-only for 2 hours": "2時間エリアのみ許可", "Share with Bangkok": "バンコクに共有", "Post a photo or story": "写真やストーリーを投稿", "Share a café, street bite, or neighbourhood moment": "カフェ、屋台、街のひとコマを共有", "Get real tips from locals on where to eat, walk, or explore": "どこで食べ、歩き、探検するか地元民から本当のヒントを", "Feed Post": "フィード投稿", "Area Story (24h)": "エリアストーリー (24時間)", "+ Add area": "+ エリアを追加", "I’m here now (2h area only)": "今ここにいる（エリアのみ 2時間）", "Share now · กริ๊ง!": "今すぐ共有 · กริ๊ง!", "Post question to Feed": "質問をフィードに投稿", "Share your local tip": "地元のヒントを共有", "Post answer": "回答を投稿", "Filter people": "人を絞り込む", "Speaks": "話す言語", "Who": "誰", "Availability": "空き状況", "Report profile": "プロフィールを通報", "Deal for two · Split at counter": "2人向け特典 · 会計は別々", "Plan": "予定", "Deal": "特典", "Photo": "写真", "Voice": "音声", "Show at counter · works offline": "カウンターで提示 · オフラインでも使えます", "Valid for": "有効期限", "What “✓ verified” means": "「✓ 認証済み」とは", "A green": "緑の", "✓ verified": "✓ 認証済み", "Public places · In groups · Chats translated. Pick public cafés, BTS skywalks or lively food spots, and use the green shield in any chat for 1-tap help.": "公共の場所 · グループで · チャットは翻訳。人の多いカフェ、BTS スカイウォーク、にぎやかな飲食店を選んで。チャットの緑の盾で1タップでヘルプ。", "Scan at a café to connect &amp; log your Bangkok passport stamp": "カフェでスキャンしてつながり、バンコク・パスポートのスタンプを記録", "Remove": "削除", "Traveller Passport": "トラベラー・パスポート", "Thai Local Streak": "タイ地元ストリーク", "Trip Collection": "旅のコレクション", "🎟 Venue deals claimed": "🎟 受け取った特典", "👋 New friends over coffee": "👋 コーヒーで知り合った新しい友だち", "💬 Ask a Thai questions": "💬 タイ人への質問", "Daily helper reward": "毎日のお助け報酬", "Save profile": "プロフィールを保存", "Hello sent · usually replies within a few hours · we’ll ring you": "あいさつを送りました · 返信は通常数時間以内 · お知らせします", "Ticket saved to Me · show code at counter": "チケットをマイページに保存 · カウンターでコードを提示", "Link copied": "リンクをコピーしました", "Link ready to share": "共有リンクの準備ができました", "Area-only badge on · auto-turns off after 2 hours": "エリアのみバッジ オン · 2時間後に自動オフ", "Add a photo first": "先に写真を追加してください", "Write your question first": "先に質問を書いてください", "Question queued · will post when back online": "質問を保留中 · オンラインに戻ったら投稿します", "Question posted · we’ll ring you when answered": "質問を投稿しました · 回答があればお知らせします", "Write a helpful tip first": "先に役立つヒントを書いてください", "Your PDPA data JSON has been downloaded": "PDPA データ (JSON) をダウンロードしました", "Data export prepared": "データの書き出しを準備しました", "Signed out": "ログアウトしました", "Profile updated": "プロフィールを更新しました", "Signed in with {0}": "{0} でログインしました", "Queued hello to {0} · will send automatically when back online": "{0} へのあいさつを保留中 · オンラインで自動送信", "No stories in {0} yet today — tap + to share the first one!": "今日の {0} のストーリーはまだありません — + で最初の1件を！", "We’ll ring you as soon as {0} replies": "{0} さんが返信したらすぐお知らせします", "Back online · sent {0} queued items": "オンラインに復帰 · 保留中の {0} 件を送信", "Write one friendly hello…": "やさしいあいさつを1つ…", "What is good here right now?": "今ここで何がいい？", "Ask anything about Bangkok cafés, neighbourhoods, street food, or getting around…": "バンコクのカフェ、エリア、屋台、移動について何でも…", "Name the exact soi, best time to go, or what to order…": "ソイ名、おすすめの時間、注文すべきものを…", "Write a message (Thai auto-translates)…": "メッセージを入力（タイ語は自動翻訳）…", "Your name": "名前", "Languages (e.g. EN · HI)": "言語（例：JA · EN）", "One-line interest hook": "ひとことで興味を紹介", "Claim · 2 taps": "受け取る · 2タップ", "Example": "例", "for 2 people": "2名分", "Speaks {0}": "話す言語 {0}", "Thai locals": "タイの地元民", "Travellers": "旅行者", "Anyone": "誰でも", "Any language": "すべての言語", "Show {0} people": "{0}人を表示", "Change photo": "写真を変更", "＋ Add photo": "＋ 写真を追加", "Replying to {0} post": "{0}の投稿に返信", "Replying to {0} story": "{0}のストーリーに返信", "{0} of 15 daily hellos left today · no external links or phone numbers": "今日のあいさつ残り {0}/15 · 外部リンクや電話番号は不可", "Hi {0}! Around for an iced coffee or short walk today?": "こんにちは {0}！今日アイスコーヒーか少し散歩どう？", "Hey {0}! Which spot in this area is your favourite right now?": "やあ {0}！この辺で今いちばん好きな場所は？", "Hi {0}! Would you like to split a 2-for-1 coffee deal?": "こんにちは {0}！コーヒー2杯の特典、一緒に使わない？", "Hi {0}! Would love to say hi — are you around for coffee or a walk today?": "こんにちは {0}！あいさつしたくて — 今日コーヒーか散歩どう？", "Expires at midnight": "深夜0時に期限切れ", "Want us to ring you when {0} replies?": "{0}さんが返信したらお知らせしますか？", "Pay ฿{0} ({1}) at counter": "カウンターで ฿{0}（{1}）を支払い", "Thai auto-translated": "タイ語は自動翻訳", "Traveller": "旅行者", "Thai local": "タイの地元民", "Write a short friendly hello first.": "まず短いあいさつを書いてください。", "Links are blocked in a first hello. Keep your first message inside Kring.": "最初のあいさつにリンクは使えません。まずは Kring 内で。", "Phone numbers are blocked in a first hello for everyone’s safety.": "安全のため、最初のあいさつに電話番号は使えません。", "LINE IDs and external handles are blocked in the first message. Chat opens once they reply.": "最初のメッセージに LINE ID や外部アカウントは使えません。返信があればチャットが開きます。", "Please keep your first hello friendly and safe.": "最初のあいさつは親しみやすく安全に。", "You already sent your one hello to {0}. Full chat opens as soon as they reply.": "{0}さんへのあいさつは送信済みです。返信があればチャットが開きます。", "You have reached your daily limit of 15 hellos today. Try again tomorrow!": "今日のあいさつ上限15回に達しました。また明日！"}, "ko": {"Something went wrong": "문제가 발생했어요", "Your saved places, deals, and queued messages are safe on your phone.": "저장한 장소, 혜택, 대기 중인 메시지는 휴대폰에 안전하게 남아 있어요.", "Reload Kring": "Kring 다시 불러오기", "Quiet in the Bangkok Feed right now": "지금 방콕 피드는 조용해요", "Share a neighbourhood café photo or ask a question about Bangkok to start today’s feed.": "동네 카페 사진을 공유하거나 방콕에 대해 질문해서 오늘의 피드를 시작해 보세요.", "Post a photo": "사진 올리기", "Ask a Thai": "태국인에게 묻기", "Ask a Thai · Local Q&amp;A": "태국인에게 묻기 · 현지 Q&A", "Answer": "답하기", "Ask yours": "질문하기", "★ Best of week": "★ 이번 주 베스트", "Online now": "지금 온라인", "Loading people in Bangkok…": "방콕 사람들을 불러오는 중…", "Clear filters": "필터 지우기", "Partner venue perks coming soon": "파트너 매장 혜택 곧 공개", "Partner cafés and food spots appear here as soon as they join Kring.": "파트너 카페와 맛집은 Kring에 합류하는 즉시 여기에 표시돼요.", "Kring member card": "Kring 멤버 카드", "You are browsing as a guest": "게스트로 둘러보는 중이에요", "Sign in to make your member card": "로그인하고 멤버 카드 만들기", "Today in Bangkok": "오늘의 방콕", "Local’s pick for this weather": "이 날씨엔 현지인 추천", "Next ›": "다음 ›", "กริ๊ง! Say hi": "กริ๊ง! 인사하기", "Say hi · กริ๊ง!": "인사하기 · กริ๊ง!", "One-message rule:": "한 메시지 규칙:", "Sign in to continue": "계속하려면 로그인", "Browsing is always open. Sign in once to send a hello, claim a venue deal, or post a photo.": "둘러보기는 언제나 가능해요. 인사, 혜택 받기, 사진 올리기는 한 번만 로그인하면 돼요.", "✈ Visiting Bangkok": "✈ 방콕 여행 중", "🏠 I live here": "🏠 여기 살아요", "Continue with Apple": "Apple로 계속하기", "G Continue with Google": "G Google로 계속하기", "LINE Continue with LINE": "LINE LINE으로 계속하기", "We only notify you when someone replies to your hello or answers your question. Zero spam.": "인사에 답장하거나 질문에 답할 때만 알려드려요. 스팸 없음.", "Turn on reply ring · กริ๊ง!": "답장 알림 켜기 · กริ๊ง!", "Share neighbourhood area only?": "동네 이름만 공유할까요?", "“I’m here now” shows only the neighbourhood name (like": "‘지금 여기’는 동네 이름만 보여줘요 (예:", ") — never your exact street or distance — and turns off automatically after 2 hours.": ") 정확한 거리나 위치는 절대 안 보여주고, 2시간 뒤 자동으로 꺼져요.", "Allow area-only for 2 hours": "2시간 동안 동네만 허용", "Share with Bangkok": "방콕과 공유하기", "Post a photo or story": "사진 또는 스토리 올리기", "Share a café, street bite, or neighbourhood moment": "카페, 길거리 음식, 동네 순간을 공유해요", "Get real tips from locals on where to eat, walk, or explore": "어디서 먹고 걷고 둘러볼지 현지인의 진짜 팁을 받아요", "Feed Post": "피드 게시물", "Area Story (24h)": "동네 스토리 (24시간)", "+ Add area": "+ 동네 추가", "I’m here now (2h area only)": "지금 여기 (동네만, 2시간)", "Share now · กริ๊ง!": "지금 공유 · กริ๊ง!", "Post question to Feed": "질문을 피드에 올리기", "Share your local tip": "현지 팁 공유하기", "Post answer": "답변 올리기", "Filter people": "사람 필터", "Speaks": "사용 언어", "Who": "누구", "Availability": "가능 여부", "Report profile": "프로필 신고", "Deal for two · Split at counter": "2인 혜택 · 카운터에서 따로 결제", "Plan": "계획", "Deal": "혜택", "Photo": "사진", "Voice": "음성", "Show at counter · works offline": "카운터에서 보여주세요 · 오프라인에서도 돼요", "Valid for": "유효 시간", "What “✓ verified” means": "‘✓ 인증됨’이란?", "A green": "초록색", "✓ verified": "✓ 인증됨", "Public places · In groups · Chats translated. Pick public cafés, BTS skywalks or lively food spots, and use the green shield in any chat for 1-tap help.": "공공장소 · 여럿이 함께 · 채팅 번역. 공공 카페, BTS 스카이워크, 붐비는 식당을 고르고, 채팅의 초록 방패로 한 번에 도움을 요청하세요.", "Scan at a café to connect &amp; log your Bangkok passport stamp": "카페에서 스캔해서 연결하고 방콕 여권 도장을 남기세요", "Remove": "삭제", "Traveller Passport": "여행자 여권", "Thai Local Streak": "태국 현지 연속 기록", "Trip Collection": "여행 컬렉션", "🎟 Venue deals claimed": "🎟 받은 매장 혜택", "👋 New friends over coffee": "👋 커피로 사귄 새 친구", "💬 Ask a Thai questions": "💬 태국인에게 묻기 질문", "Daily helper reward": "일일 도우미 보상", "Save profile": "프로필 저장", "Hello sent · usually replies within a few hours · we’ll ring you": "인사를 보냈어요 · 보통 몇 시간 안에 답장 · 알려드릴게요", "Ticket saved to Me · show code at counter": "티켓을 나에 저장 · 카운터에서 코드를 보여주세요", "Link copied": "링크를 복사했어요", "Link ready to share": "공유할 링크가 준비됐어요", "Area-only badge on · auto-turns off after 2 hours": "동네만 배지 켜짐 · 2시간 뒤 자동으로 꺼져요", "Add a photo first": "먼저 사진을 추가하세요", "Write your question first": "먼저 질문을 써 주세요", "Question queued · will post when back online": "질문 대기 중 · 다시 연결되면 올라가요", "Question posted · we’ll ring you when answered": "질문을 올렸어요 · 답이 오면 알려드릴게요", "Write a helpful tip first": "먼저 도움이 되는 팁을 써 주세요", "Your PDPA data JSON has been downloaded": "PDPA 데이터 JSON을 다운로드했어요", "Data export prepared": "데이터 내보내기 준비 완료", "Signed out": "로그아웃했어요", "Profile updated": "프로필을 업데이트했어요", "Signed in with {0}": "{0}(으)로 로그인했어요", "Queued hello to {0} · will send automatically when back online": "{0}님께 인사 대기 중 · 연결되면 자동 전송", "No stories in {0} yet today — tap + to share the first one!": "오늘 {0}에는 아직 스토리가 없어요 — +를 눌러 첫 번째로 공유하세요!", "We’ll ring you as soon as {0} replies": "{0}님이 답장하면 바로 알려드릴게요", "Back online · sent {0} queued items": "다시 연결됨 · 대기 중이던 {0}개를 보냈어요", "Write one friendly hello…": "친근한 인사 한 마디…", "What is good here right now?": "지금 여기 뭐가 좋아요?", "Ask anything about Bangkok cafés, neighbourhoods, street food, or getting around…": "방콕 카페, 동네, 길거리 음식, 이동 방법 무엇이든 물어보세요…", "Name the exact soi, best time to go, or what to order…": "정확한 골목, 가기 좋은 시간, 주문할 메뉴를…", "Write a message (Thai auto-translates)…": "메시지 입력 (태국어 자동 번역)…", "Your name": "이름", "Languages (e.g. EN · HI)": "언어 (예: KO · EN)", "One-line interest hook": "관심사 한 줄 소개", "Claim · 2 taps": "받기 · 2번 탭", "Example": "예시", "for 2 people": "2인용", "Speaks {0}": "사용 언어 {0}", "Thai locals": "태국 현지인", "Travellers": "여행자", "Anyone": "누구나", "Any language": "모든 언어", "Show {0} people": "{0}명 보기", "Change photo": "사진 변경", "＋ Add photo": "＋ 사진 추가", "Replying to {0} post": "{0} 게시물에 답장", "Replying to {0} story": "{0} 스토리에 답장", "{0} of 15 daily hellos left today · no external links or phone numbers": "오늘 남은 인사 {0}/15 · 외부 링크·전화번호 금지", "Hi {0}! Around for an iced coffee or short walk today?": "안녕 {0}! 오늘 아이스 커피나 짧은 산책 어때요?", "Hey {0}! Which spot in this area is your favourite right now?": "안녕 {0}! 요즘 이 근처에서 제일 좋아하는 곳이 어디예요?", "Hi {0}! Would you like to split a 2-for-1 coffee deal?": "안녕 {0}! 1+1 커피 혜택 같이 쓸래요?", "Hi {0}! Would love to say hi — are you around for coffee or a walk today?": "안녕 {0}! 인사하고 싶어서요 — 오늘 커피나 산책 어때요?", "Expires at midnight": "자정에 만료", "Want us to ring you when {0} replies?": "{0}님이 답장하면 알려드릴까요?", "Pay ฿{0} ({1}) at counter": "카운터에서 ฿{0} ({1}) 결제", "Thai auto-translated": "태국어 자동 번역", "Traveller": "여행자", "Thai local": "태국 현지인", "Write a short friendly hello first.": "먼저 짧고 친근한 인사를 써 주세요.", "Links are blocked in a first hello. Keep your first message inside Kring.": "첫 인사에는 링크를 넣을 수 없어요. 첫 메시지는 Kring 안에서 해 주세요.", "Phone numbers are blocked in a first hello for everyone’s safety.": "모두의 안전을 위해 첫 인사에는 전화번호를 넣을 수 없어요.", "LINE IDs and external handles are blocked in the first message. Chat opens once they reply.": "첫 메시지에는 LINE ID나 외부 계정을 넣을 수 없어요. 답장이 오면 채팅이 열려요.", "Please keep your first hello friendly and safe.": "첫 인사는 친근하고 안전하게 해 주세요.", "You already sent your one hello to {0}. Full chat opens as soon as they reply.": "{0}님께 이미 인사를 보냈어요. 답장이 오면 채팅이 열려요.", "You have reached your daily limit of 15 hellos today. Try again tomorrow!": "오늘 인사 15회를 모두 썼어요. 내일 다시 해 주세요!"}};

const QA_TX = {
  en: { deleteRow: 'Delete my account & data', deleteQ: 'Delete everything?', deleteBody: 'This erases your Kring profile, saves, claimed treats, blocks and reports from this phone. Sign-in is not live yet, so Kring keeps no account for you on its servers. After launch, this also deletes your server data within 30 days.', deleteYes: 'Yes, delete', cancel: 'Cancel', deletedToast: 'Deleted from this phone. No server account exists yet.', pdpaIntro: 'Under Thailand’s PDPA you can download a copy of your data or delete it at any time. Questions: ops@kringapp.com', download: 'Download my data (JSON)', pickFirst: 'Open a chat first, then report or block that person from there', blockedToast: 'Blocked · they won’t see you and you won’t see them', reportedToast: 'Report saved · thank you', report: 'Report this person or message', block: 'Block this person', sharePlan: 'Share my plan with a friend', touristPolice: 'Tourist police (English & more)', police: 'Thai police', ambulance: 'Ambulance', embassy: 'Call my embassy', embassyToast: 'Tourist Police 1155 can connect you with your embassy' },
  th: { deleteRow: 'ลบบัญชีและข้อมูลของฉัน', deleteQ: 'ลบทั้งหมดเลยไหม?', deleteBody: 'จะลบโปรไฟล์ รายการที่บันทึก ดีลที่รับ การบล็อก และการรายงาน ออกจากเครื่องนี้ ตอนนี้ยังไม่เปิดระบบล็อกอิน กริ๊ง! จึงไม่มีบัญชีของคุณบนเซิร์ฟเวอร์ หลังเปิดตัว การลบนี้จะลบข้อมูลบนเซิร์ฟเวอร์ภายใน 30 วันด้วย', deleteYes: 'ลบเลย', cancel: 'ยกเลิก', deletedToast: 'ลบออกจากเครื่องนี้แล้ว ยังไม่มีบัญชีบนเซิร์ฟเวอร์', pdpaIntro: 'ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) คุณดาวน์โหลดหรือลบข้อมูลของคุณได้ทุกเมื่อ สอบถาม: ops@kringapp.com', download: 'ดาวน์โหลดข้อมูลของฉัน (JSON)', pickFirst: 'เปิดแชตก่อน แล้วรายงานหรือบล็อกคนนั้นจากในแชต', blockedToast: 'บล็อกแล้ว · จะไม่เห็นกันอีก', reportedToast: 'บันทึกการรายงานแล้ว · ขอบคุณ', report: 'รายงานคนนี้หรือข้อความนี้', block: 'บล็อกคนนี้', sharePlan: 'แชร์แพลนให้เพื่อน', touristPolice: 'ตำรวจท่องเที่ยว (ภาษาอังกฤษและอื่น ๆ)', police: 'ตำรวจ', ambulance: 'รถพยาบาล', embassy: 'โทรหาสถานทูต', embassyToast: 'ตำรวจท่องเที่ยว 1155 ช่วยติดต่อสถานทูตให้ได้' },
  zh: { deleteRow: '删除我的账户和数据', deleteQ: '全部删除？', deleteBody: '这会从本机删除你的资料、收藏、已领取的优惠、屏蔽和举报记录。登录功能尚未上线，因此 Kring 服务器上没有你的账户。上线后，此操作也会在 30 天内删除服务器数据。', deleteYes: '确认删除', cancel: '取消', deletedToast: '已从本机删除。服务器上尚无账户。', pdpaIntro: '根据泰国 PDPA，你可随时下载或删除你的数据。咨询：ops@kringapp.com', download: '下载我的数据 (JSON)', pickFirst: '请先打开聊天，再在聊天中举报或屏蔽对方', blockedToast: '已屏蔽 · 你们将互相看不到', reportedToast: '举报已保存 · 谢谢', report: '举报此人或此消息', block: '屏蔽此人', sharePlan: '把我的计划分享给朋友', touristPolice: '旅游警察（英语等多语种）', police: '泰国警察', ambulance: '救护车', embassy: '联系我的大使馆', embassyToast: '旅游警察 1155 可帮你联系大使馆' },
  hi: { deleteRow: 'मेरा अकाउंट और डेटा हटाएँ', deleteQ: 'सब कुछ हटाएँ?', deleteBody: 'इससे इस फ़ोन से आपकी प्रोफ़ाइल, सेव, लिए गए ऑफ़र, ब्लॉक और रिपोर्ट मिट जाएँगे। साइन-इन अभी शुरू नहीं हुआ है, इसलिए Kring के सर्वर पर आपका कोई अकाउंट नहीं है। लॉन्च के बाद यह 30 दिनों में सर्वर डेटा भी हटा देगा।', deleteYes: 'हाँ, हटाएँ', cancel: 'रद्द करें', deletedToast: 'इस फ़ोन से हटा दिया। सर्वर पर अभी कोई अकाउंट नहीं है।', pdpaIntro: 'थाईलैंड के PDPA के तहत आप कभी भी अपना डेटा डाउनलोड या डिलीट कर सकते हैं। सवाल: ops@kringapp.com', download: 'मेरा डेटा डाउनलोड करें (JSON)', pickFirst: 'पहले चैट खोलें, फिर वहीं से रिपोर्ट या ब्लॉक करें', blockedToast: 'ब्लॉक किया · अब आप एक-दूसरे को नहीं देखेंगे', reportedToast: 'रिपोर्ट सेव हुई · धन्यवाद', report: 'इस व्यक्ति या संदेश की रिपोर्ट करें', block: 'इस व्यक्ति को ब्लॉक करें', sharePlan: 'अपना प्लान दोस्त से शेयर करें', touristPolice: 'टूरिस्ट पुलिस (अंग्रेज़ी और अन्य)', police: 'थाई पुलिस', ambulance: 'एम्बुलेंस', embassy: 'मेरे दूतावास को कॉल करें', embassyToast: 'टूरिस्ट पुलिस 1155 आपको दूतावास से जोड़ सकती है' },
  ja: { deleteRow: 'アカウントとデータを削除', deleteQ: 'すべて削除しますか？', deleteBody: 'この端末からプロフィール、保存、受け取った特典、ブロック、通報を消去します。ログインはまだ公開前のため、Kring のサーバーにあなたのアカウントはありません。公開後は、サーバー上のデータも 30 日以内に削除されます。', deleteYes: '削除する', cancel: 'キャンセル', deletedToast: 'この端末から削除しました。サーバーにアカウントはまだありません。', pdpaIntro: 'タイの PDPA に基づき、いつでもデータのダウンロードや削除ができます。お問い合わせ：ops@kringapp.com', download: 'データをダウンロード (JSON)', pickFirst: '先にチャットを開き、そこから通報またはブロックしてください', blockedToast: 'ブロックしました · お互いに表示されません', reportedToast: '通報を保存しました · ありがとうございます', report: 'この人・メッセージを通報', block: 'この人をブロック', sharePlan: '予定を友だちに共有', touristPolice: 'ツーリストポリス（英語ほか）', police: 'タイ警察', ambulance: '救急車', embassy: '大使館に電話', embassyToast: 'ツーリストポリス 1155 が大使館につないでくれます' },
  ko: { deleteRow: '내 계정 및 데이터 삭제', deleteQ: '모두 삭제할까요?', deleteBody: '이 기기에서 프로필, 저장 항목, 받은 혜택, 차단 및 신고 기록이 지워집니다. 아직 로그인이 열리지 않아 Kring 서버에는 계정이 없습니다. 출시 후에는 30일 이내에 서버 데이터도 삭제됩니다.', deleteYes: '삭제', cancel: '취소', deletedToast: '이 기기에서 삭제했어요. 서버에는 아직 계정이 없어요.', pdpaIntro: '태국 PDPA에 따라 언제든지 데이터를 다운로드하거나 삭제할 수 있어요. 문의: ops@kringapp.com', download: '내 데이터 다운로드 (JSON)', pickFirst: '먼저 채팅을 연 뒤 그 안에서 신고하거나 차단하세요', blockedToast: '차단했어요 · 서로 보이지 않아요', reportedToast: '신고가 저장됐어요 · 감사합니다', report: '이 사람 또는 메시지 신고', block: '이 사람 차단', sharePlan: '친구에게 내 계획 공유', touristPolice: '관광 경찰 (영어 등)', police: '태국 경찰', ambulance: '구급차', embassy: '대사관에 전화', embassyToast: '관광 경찰 1155가 대사관과 연결해 드려요' },
} as const;

export type V8Tab = 'feed' | 'people' | 'deals' | 'me';

/** Language codes: cards store ISO-like ZH / JA / KO; older demo cards say CN / JP / KR. One code for both (audit P2-1). */
const LANG_ALIAS: Record<string, string> = { CN: 'ZH', JP: 'JA', KR: 'KO' };
const langCode = (c: string) => LANG_ALIAS[(c || '').toUpperCase()] || (c || '').toUpperCase();
const LANG_CHIP: Record<string, string> = { ZH: '中文', JA: '日本語', KO: '한국어' };

type SheetId =
  | null
  | 'ticket'
  | 'standhow'
  | 'weather'
  | 'story'
  | 'hi'
  | 'signin'
  | 'choose'
  | 'post'
  | 'filter'
  | 'inbox'
  | 'review'
  | 'thread'
  | 'redeem'
  | 'safety'
  | 'verified'
  | 'settings'
  | 'mycode'
  | 'saved'
  | 'passport'
  | 'editprofile'
  | 'notifprompt'
  | 'locationprompt'
  | 'pdpa'
  | 'persondetail'
  | 'v5card'
  | 'reelNudge'
  | 'rewards'
  | 'claim'
  | 'claimed'
  | 'ranking'
  | 'result'
  | 'savedreels'
  | 'place'
  | 'reelshare'
  | 'reelmore'
  | 'blocked'
  | 'official'
  | 'follow'
  | 'activity'
  | 'interests'
  | 'profile'
  | 'verify';

export interface V8UserAccount {
  id: string;
  name: string;
  provider: 'Apple' | 'Google' | 'LINE';
  role: 'traveller' | 'local';
  tripDay: number;
  tripTotalDays: number;
  langs: string;
  hook: string;
  avatar: string;
  verified?: boolean;
  currency: V8CurrencyInfo['code'];
  level: 'anchan' | 'tea' | 'pandan';
  postsCount: number;
  questionsAnsweredToday: number;
  streakDays: number;
  freeSkipsLeft: number;
}

/** Signed-out guest: no name, no photo, no trip, no level, never "verified". */
const GUEST_USER_PROFILE: V8UserAccount = {
  id: 'guest',
  name: '',
  provider: 'Google',
  role: 'traveller',
  tripDay: 0,
  tripTotalDays: 0,
  langs: '',
  hook: '',
  avatar: NEUTRAL_IMG,
  currency: 'INR',
  level: 'anchan',
  postsCount: 0,
  questionsAnsweredToday: 0,
  streakDays: 0,
  freeSkipsLeft: 2,
};

/** Shown when a guest taps Apple / Google / LINE in production mode (real sign-in is not wired yet). */
export const SIGNIN_NOT_READY_MSG = 'Sign-in opens in the test build';

function ringHaptic(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([25, 70, 25]);
    }
  } catch {
    // ignore
  }
}

class V8ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Unexpected error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100dvh',
            background: '#15131F',
            color: '#FFF7EC',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 28,
            textAlign: 'center',
            fontFamily: "'Bricolage Grotesque', 'Anuphan', sans-serif",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
            Something went wrong
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'rgba(255,247,236,0.7)',
              marginBottom: 18,
              maxWidth: 300,
              lineHeight: 1.5,
            }}
          >
            Your saved places, deals, and queued messages are safe on your phone.
          </div>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, message: '' });
              window.location.reload();
            }}
            style={{
              padding: '12px 24px',
              borderRadius: 999,
              border: 0,
              background: 'linear-gradient(135deg,#FF8A3D,#FF4FA3)',
              color: '#0B0A12',
              fontWeight: 800,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Reload Kring
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const KringAppV8Inner: React.FC<{ initialTab?: V8Tab }> = ({ initialTab }) => {
  const isDemo = useMemo(() => isDemoOrDevEnvironment(), []);

  // Language & Settings
  const [lang, setLang] = useState<V8Lang>(() => {
    try {
      // ?lang=th (LINE OA / shared links) wins over the saved choice and becomes the saved choice
      const asked = new URLSearchParams(window.location.search).get('lang')?.toLowerCase() as V8Lang | undefined;
      if (asked && V8_STRINGS[asked]) {
        localStorage.setItem('kr8_lang', asked);
        return asked;
      }
      const saved = localStorage.getItem('kr8_lang') as V8Lang | null;
      if (saved && V8_STRINGS[saved]) return saved;
      const nav = (navigator.languages && navigator.languages[0]) || navigator.language || '';
      const code = nav.slice(0, 2).toLowerCase() as V8Lang;
      if (V8_STRINGS[code]) return code;
    } catch {
      // ignore
    }
    return 'en';
  });
  useEffect(() => installZoomGuard(), []);   // F: pinching a Reel never leaves the app zoomed in
  useEffect(() => installKeyboardFocus(), []);   // P: the keyboard never covers the box being typed in
  const busyRef = useRef(false);
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => installVersionWatch(import.meta.env.BASE_URL || '/app/', () => busyRef.current, () => setUpdateReady(true)), []);   // J1
  useEffect(() => {
    try {
      document.documentElement.lang = lang;   // A-17: screen readers read Thai as Thai
    } catch {
      // ignore
    }
  }, [lang]);
  const t = V8_STRINGS[lang] || V8_STRINGS.en;
  const qx = (k: keyof typeof QA_TX['en']) => (QA_TX[lang] || QA_TX.en)[k] || QA_TX.en[k];
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Safety opened from inside a chat targets that chat; from Settings it targets nobody.
  const [safetyFromChat, setSafetyFromChat] = useState(false);
  // 16 Nov perf 2: Chinese, Hindi, Japanese and Korean strings are downloaded only when chosen (English shows for a moment)
  const [, setStringsTick] = useState(0);
  useEffect(() => { if (!v5LangReady(lang)) void loadV5Lang(lang).then(() => setStringsTick((n) => n + 1)); }, [lang]);
  const L = (en: string): string =>
    ((V5_L[lang] && V5_L[lang][en]) || (KX_L[lang] && KX_L[lang][en]) || (V9_L[lang] && V9_L[lang][en]) || (QA_L[lang] && QA_L[lang][en]) || en).replace(/&amp;/g, '&');
  const Lf = (en: string, a: string, b = ''): string => L(en).replace('{0}', a).replace('{1}', b);
  /** "TH · EN" → "ไทย · อังกฤษ" in the member's language (polish #11: no stray English codes in a Thai line) */
  const langWords = (codes: string) => codes.split(/\s*·\s*/).filter(Boolean).map((c) => L(LANG_NAME[c.toUpperCase()] || c)).join(' · ');
  /** Real partner deals (0023) carry their own words in baht; Thai screens show Thai with English under it. */
  const dealMain = (d: V8Deal): string => (lang === 'th' ? d.dealTh || d.dealEn : d.dealEn) || '';
  // audit P3-5: never the same treat twice (the owner typed Thai in the English box, or the same text in both)
  const dealSub = (d: V8Deal): string => (lang === 'th' && d.dealTh && d.dealEn && d.dealEn.trim() !== d.dealTh.trim() && !/[\u0E01-\u0E3A\u0E40-\u0E5B]/.test(d.dealEn) ? d.dealEn : '');
  const dealHours = (d: V8Deal): string => (lang === 'th' ? d.hoursTh || d.hoursEn : d.hoursEn) || '';
  const dealVenue = (d: V8Deal): string => (lang === 'th' && d.venueTh ? d.venueTh : d.venue);

  const [selectedArea, setSelectedArea] = useState<string>('All Bangkok');
  const [waitlistEmail, setWaitlistEmail] = useState<string>('');
  const [waitlistSubmitted, setWaitlistSubmitted] = useState<boolean>(false);
  const [personMenuOpen, setPersonMenuOpen] = useState(false);

  const [calmMode, setCalmMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kr8_calm') === '1';
    } catch {
      return false;
    }
  });

  const [morningNotif, setMorningNotif] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('kr8_morning_notif');
      return v === null ? true : v === '1';
    } catch {
      return true;
    }
  });

  // Auth: sign-in only at action (Say hi, Claim, Post, Ask)
  const [signedIn, setSignedIn] = useState<boolean>(() => {
    if (!isDemo) return false;
    try {
      return localStorage.getItem('kr8_signed_in') === '1';
    } catch {
      return false;
    }
  });
  const [user, setUser] = useState<V8UserAccount>(() => {
    // Production: always the guest profile until real sign-in exists (never a stored/fake identity).
    // Demo: the prototype profile is filled in by the lazy demo-data loader below.
    return GUEST_USER_PROFILE;
  });
  const dispCur: V8UserAccount['currency'] =
    user.id !== 'guest' && !isDemo
      ? user.currency
      : (({ hi: 'INR', zh: 'CNY', ja: 'JPY', ko: 'KRW' } as Record<string, V8UserAccount['currency']>)[lang] || 'USD');
  const [signInNotice, setSignInNotice] = useState<string>('');
  const pendingActionRef = useRef<(() => void) | null>(null);
  const draftDoneRef = useRef(false);   // N: the draft was already used on this page (email-code sign-in) or restored

  // Navigation & Sheets (all sheets closed by default)
  // 17 Nov: a refresh keeps the tab (deep links still win; see tabMemory.ts)
  const [tab, setTab] = useState<V8Tab>(() => initialTab || (typeof window !== 'undefined' ? restoredTab(window.location.search) : null) || 'feed');
  useEffect(() => { rememberTab(tab); }, [tab]);
  const [sheet, setSheet] = useState<SheetId>(null);
  const sheetRef = useRef<SheetId>(null);
  useEffect(() => {
    const was = sheetRef.current;
    sheetRef.current = sheet;
    if (sheet && !was) {
      try { window.history.pushState({ kr8Sheet: true }, ''); } catch { /* ignore */ }
    } else if (!sheet && was && window.history.state && window.history.state.kr8Sheet) {
      try { window.history.back(); } catch { /* ignore */ }
    }
  }, [sheet]);
  useEffect(() => {
    const onPop = () => {
      if (sheetRef.current) {
        sheetRef.current = null;
        setSheet(null);
      }
    };
    // keyboard users: Escape closes the open sheet (same path as the Back button)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sheetRef.current) setSheet(null);
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  useEffect(() => { if (sheet !== 'pdpa') setConfirmDelete(false); }, [sheet]);

  // Offline & Queue state
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine !== false : true
  );
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(
    () => getOfflineQueue().length
  );

  // Toast & Inline ring burst
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [burstActive, setBurstActive] = useState<boolean>(false);
  const [, setMemberRingsState] = useState<RingsState>('spin');

  // Feed & Pull-to-refresh (production starts empty and fetches real Supabase rows; ?demo=1 loads prototype examples)
  const [feedItems, setFeedItems] = useState<V8FeedItem[]>(() =>
    []
  );
  const [feedSettled, setFeedSettled] = useState(false);
  useEffect(() => {   // once the feed is up, fetch the other screens quietly so opening them is instant
    if (!feedSettled) return;
    const id = window.setTimeout(prefetchParts, 2500);
    return () => window.clearTimeout(id);
  }, [feedSettled]);
  const boot0Poster = typeof window === 'undefined' ? '' : String((window as unknown as { __kr8Poster0?: string }).__kr8Poster0 || '');
  const [stories, setStories] = useState<Record<string, V8StorySlide[]>>({});
  const [seenStoryAreas, setSeenStoryAreas] = useState<Record<string, boolean>>({});
  const [activeStoryArea, setActiveStoryArea] = useState<string>('Ari');
  const [activeStoryIndex, setActiveStoryIndex] = useState<number>(0);
  const [, setOrbVisible] = useState<boolean>(false);
  const [newPillVisible, setNewPillVisible] = useState<boolean>(false);
  // Number of genuinely new feed rows found on refresh; the "N new" pill only shows when > 0.
  const [newRowsCount, setNewRowsCount] = useState<number>(0);
  const feedScrollRef = useRef<HTMLDivElement | null>(null);

  // Weather
  const [weather, setWeather] = useState<V8Weather>(DEFAULT_WEATHER);

  // People & Filters (production fetches ONLY real Supabase profiles — zero fake people in production)
  const [people, setPeople] = useState<V8Person[]>([]);
  const [peopleLoading, setPeopleLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterLang, setFilterLang] = useState<string>('');
  const [filterWho, setFilterWho] = useState<string>('');
  const [filterOnline, setFilterOnline] = useState<boolean>(false);
  const [blockedIds, setBlockedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('kr8_blocked');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [selectedPerson, setSelectedPerson] = useState<V8Person | null>(null);

  // Say Hi / One-Message Rule / Daily Limit 15
  const [hiTarget, setHiTarget] = useState<{
    name: string;
    img: string;
    context: string;
    id?: string;
    /** opened from a Reel: the first line asks about the spot (audit P2-9) */
    fromReel?: boolean;
  }>({
    name: '',
    img: NEUTRAL_IMG,
    context: '',
  });
  const [hiMessage, setHiMessage] = useState<string>('');
  const [hiError, setHiError] = useState<string>('');
  const [sentHelloRecipients, setSentHelloRecipients] = useState<Record<string, boolean>>(
    () => {
      try {
        const raw = localStorage.getItem('kr8_sent_hellos');
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    }
  );
  const [dailyHelloCount, setDailyHelloCount] = useState<number>(() => {
    try {
      const todayKey = new Date().toISOString().slice(0, 10);
      const raw = localStorage.getItem(`kr8_hellos_${todayKey}`);
      return raw ? Number(raw) || 0 : 0;
    } catch {
      return 0;
    }
  });
  const [askedNotifAfterFirstHello, setAskedNotifAfterFirstHello] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kr8_notif_prompted') === '1';
    } catch {
      return false;
    }
  });
  const [lastHelloTargetName, setLastHelloTargetName] = useState<string>('');

  // Saved items
  const feedItemsRef = useRef<V8FeedItem[]>([]);
  feedItemsRef.current = feedItems;
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('kr8_saved');
      return raw ? JSON.parse(raw) : isDemo ? { 'post-nam-yaowarat': true } : {};
    } catch {
      return isDemo ? { 'post-nam-yaowarat': true } : {};
    }
  });

  // Deals & Claimed Vouchers (production fetches ONLY real partner deals — zero fake deals in production)
  const [deals, setDeals] = useState<V8Deal[]>([]);
  const [dealCat, setDealCat] = useState<'all' | 'coffee' | 'food' | 'fun'>('all');
  const [claimedDeals, setClaimedDeals] = useState<Record<string, { claimedAt: number; used: boolean }>>(
    () => {
      try {
        const raw = localStorage.getItem('kr8_claimed_deals');
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    }
  );
  const [activeRedeemDealId, setActiveRedeemDealId] = useState<string>('');
  const [redeemSecondsLeft, setRedeemSecondsLeft] = useState<number>(600);

  // Chat / Inbox / Requests
  const [requests, setRequests] = useState<V8HelloRequest[]>([]);
  const [reviewIdx, setReviewIdx] = useState<number>(0);
  const [threads, setThreads] = useState<V8ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>('');
  const [chatInput, setChatInput] = useState<string>('');
  const [plusMenuOpen, setPlusMenuOpen] = useState<boolean>(false);

  // Posting / Ask a Thai / Answer state
  // Composer always opens empty: the member picks their own photo ("Add photo").
  const [postPhotoUrl, setPostPhotoUrl] = useState<string>('');
  // Reels (0024): picked file, problems, upload stage + progress, and what already landed (for Retry)
  const [reelInfo, setReelInfo] = useState<ReelInfo | null>(null);
  const [reelTrim, setReelTrim] = useState<ReelInfo | null>(null);   // 16 Nov: a clip over 60 s waiting on the trim step
  const [reelProblem, setReelProblem] = useState<string>('');
  const [reelStage, setReelStage] = useState<'idle' | 'preparing' | 'uploading' | 'saving' | 'failed'>('idle');
  busyRef.current = ['preparing', 'uploading', 'saving'].includes(reelStage) || sheet !== null;   // J1: never reload mid-upload / claim / chat
  const [reelProgress, setReelProgress] = useState(0);
  const reelWorkRef = useRef<{ ready?: ReelReady; up?: UploadedReel & { done: string[] } }>({});
  const [postKind, setPostKind] = useState<'post' | 'story'>('post');
  const [postCaption, setPostCaption] = useState<string>('');
  const [postArea, setPostArea] = useState<string | null>(null);
  const [postHereNow, setPostHereNow] = useState<boolean>(false);
  const [locationGranted, setLocationGranted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kr8_loc_granted') === '1';
    } catch {
      return false;
    }
  });

  // Sign-in form options
  const [signInTripMode, setSignInTripMode] = useState<'trip' | 'local'>('trip');

  // Edit profile form
  const [editName, setEditName] = useState<string>(user.name);
  const [editLangs, setEditLangs] = useState<string>(user.langs);
  const [editHook, setEditHook] = useState<string>(user.hook);
  // ── V5 live mode (VITE_AUTH_LIVE=1): real Supabase account + member card. Demo builds keep their examples.
  const live = V5_AUTH_LIVE && !isDemo;
  // Ask a Thai (16 Nov, founder-approved Screen 2): Feed top switch. Reels stays the default.
  const [feedMode, setFeedMode] = useState<'reels' | 'ask'>(() => (typeof location !== 'undefined' && /[?&]feed=ask\b/.test(location.search) ? 'ask' : 'reels'));
  const askMeRef = useRef<AskPerson | null>(null);
  const [askSeen, setAskSeen] = useState<boolean>(() => { try { return localStorage.getItem('kr8_ask_seen') === '1'; } catch { return true; } });
  const pickFeedMode = (m: 'reels' | 'ask') => {
    setFeedMode(m);
    if (m === 'ask' && !askSeen) { setAskSeen(true); try { localStorage.setItem('kr8_ask_seen', '1'); } catch { /* private mode */ } }
  };
  const askApi = useMemo(() => createAskApi({ live, demo: isDemo, me: () => askMeRef.current,
    base: ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.BASE_URL) || '/' }), [live, isDemo]);
  const [v5Uid, setV5Uid] = useState<string>('');
  const [v5Card, setV5Card] = useState<V5Card | null>(null);
  askMeRef.current = !signedIn ? null
    : live ? (v5Uid && v5Card ? { id: v5Uid, name: v5Card.first_name, photo: v5Card.photo || initialAvatar(v5Card.first_name), local: v5Card.who === 'local' } : null)
    : { id: user.id || 'me', name: user.name, photo: user.avatar || initialAvatar(user.name), local: user.role === 'local' };
  const [v5SignInNotice, setV5SignInNotice] = useState<string>('');
  const [postEventId, setPostEventId] = useState<string>('');
  const v5BusyRef = useRef<Record<string, boolean>>({});
  const v5Msg = (e: unknown, name = ''): string => {
    const [k, a] = v5ErrText(typeof e === 'string' ? e : v5ErrCode(e), name);
    return a !== undefined ? L(k).replace('{0}', a) : L(k);
  };
  /** Runs one live action at a time per key, so double taps never send twice. */
  const v5Once = async (key: string, fn: () => Promise<void>) => {
    if (v5BusyRef.current[key]) return;
    v5BusyRef.current[key] = true;
    try {
      await fn();
    } finally {
      v5BusyRef.current[key] = false;
    }
  };
  const v5LastUid = useRef<string>('');
  const activeThreadIdRef = useRef<string>('');
  const v5ApplyMe = (me: V5Me) => {
    setV5Card(me.card);
    setDailyHelloCount(me.hellos_today || 0);
    if (me.card) {
      const c = me.card;
      setSignedIn(true);
      setUser((prev) => ({
        ...prev,
        id: v5LastUid.current || prev.id,
        name: c.first_name,
        langs: (c.langs || []).join(' · '),
        hook: c.bio || '',
        avatar: c.photo || NEUTRAL_IMG,
        role: c.who,
        verified: c.verified === true,
        provider: 'Google',
        postsCount: me.posts || 0,
      }));
    } else {
      setSignedIn(false);
    }
  };
  // ?join=1 (website join buttons, LIFF join link): read once, then removed from the address bar so a reload does not repeat it
  const v5JoinRef = useRef<boolean>((() => {
    try {
      const u = new URL(window.location.href);
      const st = u.searchParams.get('liff.state') || '';
      const on = u.searchParams.get('join') === '1' || /[?&]join=1\b/.test(decodeURIComponent(st));
      // kept for this tab so it survives the LINE login / LIFF round trip, which can drop the query
      if (on) sessionStorage.setItem('kr8_join', '1');
      if (u.searchParams.get('join') === '1' && !st) { u.searchParams.delete('join'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); }
      return on || sessionStorage.getItem('kr8_join') === '1';
    } catch { return false; }
  })());
  const v5JoinAsked = useRef<boolean>(v5JoinRef.current);
  // ?install=1 (website Install button): the install sheet comes first; sign-in / "Make your card" wait until it is closed (16 Nov)
  const installAskRef = useRef<boolean>(takeInstallAsk());
  const [installAsking, setInstallAsking] = useState<boolean>(installAskRef.current);
  const cardAfterInstallRef = useRef(false);
  const installAskDone = () => {
    if (!installAskRef.current) return;
    installAskRef.current = false;
    setInstallAsking(false);
    if (cardAfterInstallRef.current) { cardAfterInstallRef.current = false; if (!sheetRef.current) setSheet('v5card'); }
  };
  const v5ApplySession = async (uid: string | null) => {
    if (!uid) {
      setV5Uid('');
      setV5Card(null);
      setSignedIn(false);
      setUser(GUEST_USER_PROFILE);
      setThreads([]);
      setRequests([]);
      return;
    }
    setV5Uid(uid);
    try {
      const me = await v5Me();
      v5ApplyMe(me);
      if (me.card) void v5SyncAttribution();   // signed in on a phone that opened a ?ref= / ?src= link
      if (!me.card) {
        if (installAskRef.current) cardAfterInstallRef.current = true;   // after the install step, never before it
        else setSheet('v5card');
      } else if (v5JoinRef.current) {
        // 13 Nov: a website "Join the community" tap from someone already in: their card on Me, plus the first-Reel nudge if they have no Reel yet
        v5JoinRef.current = false;
        try { sessionStorage.removeItem('kr8_join'); } catch { /* ignore */ }
        setTab('me');
        if (sheetRef.current === 'signin') setSheet(null);
        if (!(me.posts > 0) && !installAskRef.current) setTimeout(() => setSheet('reelNudge'), 400);
      } else if (sheetRef.current === 'signin') {
        setSheet(null);
        showToast(L('Signed in · กริ๊ง!'));
        const next = pendingActionRef.current;
        pendingActionRef.current = null;
        if (next) { draftDoneRef.current = true; void clearSignInDraft(); setTimeout(() => next(), 60); }
      }
    } catch (e) {
      showToast(v5Msg(e));
    }
  };
  const v5LoadMessages = async (tid: string) => {
    try {
      const msgs = await v5Messages(tid);
      // once the other person has written, the one-message rule no longer applies (even before the next inbox refresh)
      setThreads((prev) =>
        prev.map((t) =>
          t.id === tid
            ? ({ ...t, messages: msgs, unread: false, ...(msgs.some((m) => m.sender === 'them') ? { v5Status: 'open' } : {}) } as V8ChatThread)
            : t
        )
      );
    } catch {
      // keep what is on screen
    }
  };
  const v5RefreshInbox = async () => {
    try {
      const { threads: th, requests: rq } = await v5Inbox();
      setThreads((prev) =>
        th
          // a hello waiting for my answer lives in "requests" until I open it
          .filter((t) => !(t.v5Status === 'pending' && !t.v5OpenedByMe) || t.id === activeThreadIdRef.current)
          .map((t) => {
            const old = prev.find((o) => o.id === t.id);
            return old ? { ...t, messages: old.messages } : t;
          })
      );
      setRequests(rq);
      if (sheetRef.current === 'thread' && activeThreadIdRef.current) await v5LoadMessages(activeThreadIdRef.current);
    } catch {
      // offline or signed out: keep what is on screen
    }
  };
  const v5Download = (data: unknown, name: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
  };

  useEffect(() => {
    if (!toastMsg) return;
    const timer = setTimeout(() => setToastMsg(null), 2600);
    return () => clearTimeout(timer);
  }, [toastMsg]);

  const triggerRingBurst = () => {
    ringHaptic();
    setBurstActive(true);
    setMemberRingsState('celebrate');
    setTimeout(() => {
      setBurstActive(false);
      setMemberRingsState('spin');
    }, 900);
  };

  useEffect(() => {
    try {
      localStorage.setItem('kr8_calm', calmMode ? '1' : '0');
    } catch {
      // ignore
    }
  }, [calmMode]);

  useEffect(() => {
    try {
      localStorage.setItem('kr8_lang', lang);
    } catch {
      // ignore
    }
  }, [lang]);

  // Fetch live Bangkok weather from Open-Meteo
  useEffect(() => {
    let cancelled = false;
    fetchBangkokWeather().then((w) => {
      if (!cancelled) setWeather(w);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load real data from Supabase in production (or keep demo data when ?demo=1)
  const loadLiveData = async () => {
    if (isDemo) {
      // Prototype examples live in a separate lazy chunk that production never downloads.
      const demo = await import('./v8DemoData');
      setFeedItems(demo.INITIAL_FEED_ITEMS);
      setFeedSettled(true);
      setStories(demo.INITIAL_STORIES);
      setPeople(demo.DEMO_PEOPLE);
      setDeals(demo.INITIAL_DEALS);
      setRequests(demo.DEMO_REQUESTS);
      setThreads(demo.DEMO_THREADS);
      setActiveThreadId(demo.DEMO_THREADS[0]?.id || '');
      setActiveRedeemDealId(demo.INITIAL_DEALS[0]?.id || '');
      setUser(() => {
        try {
          const raw = localStorage.getItem('kr8_user');
          if (raw) return { ...demo.DEMO_USER_PROFILE, ...JSON.parse(raw) };
        } catch {
          // ignore
        }
        return demo.DEMO_USER_PROFILE;
      });
      setPeopleLoading(false);
      return;
    }
    setPeopleLoading(true);
    if (live) {
      // 16 Nov perf 2: the feed goes on screen the moment it is here (it no longer waits for treats and people). A signed-in
      // member first sees the visitor feed index.html already fetched, then their own. Treats and people start after the feed,
      // so on a slow phone they do not compete with the first Reel for the network.
      let shown = false;
      v5FeedPeek().then((q) => { if (q && q.length) { shown = true; setFeedItems((prev) => (prev.length ? prev : q)); setFeedSettled(true); } }).catch(() => undefined);
      const feedP = v5Feed().then((f) => { if (f.length || !shown) setFeedItems(f); }, () => { if (!shown) setFeedItems([]); }).finally(() => setFeedSettled(true));
      const after = <T,>(f: () => Promise<T>) => Promise.race([feedP, new Promise((r) => setTimeout(r, 2500))]).then(f);
      const [p, d] = await Promise.all([
        v5Card ? after(() => v5People()).catch(() => [] as V8Person[]) : Promise.resolve([] as V8Person[]),
        after(() => v5Treats()).catch(() => [] as V8Deal[]),
      ]);
      setPeople(p);
      setDeals(d);
      setClaimedDeals(Object.fromEntries(d.filter((x) => x.code).map((x) => [x.id, { claimedAt: Date.now(), used: false }])));
      setPeopleLoading(false);
      return;
    }
    const [supaPeople, supaFeed, supaDeals] = await Promise.all([
      fetchRealPeopleFromSupabase(),
      fetchRealFeedFromSupabase(),
      fetchRealDealsFromSupabase(),
    ]);
    setPeople(supaPeople);
    setFeedItems(supaFeed);
    setDeals(supaDeals);
    setPeopleLoading(false);
  };

  useEffect(() => {
    loadLiveData();
  }, [isDemo, v5Uid, v5Card]);

  // V5: real session (Google redirect or email code) → member card → signed in.
  useEffect(() => {
    if (!live) return;
    let off: (() => void) | undefined;
    let cancelled = false;
    setSignedIn(false);
    const oauthErr = v5TakeOAuthError();
    if (oauthErr) {
      setV5SignInNotice(v5Msg(oauthErr));
      setSheet('signin');
    }
    (async () => {
      // LIFF one-tap (only in builds with VITE_LIFF_ID; empty → this block is not even in the bundle)
      // arrived from an in-app browser with a one-time hand-off code (?ho=): signed in here before anything reads the session
      await v5HandoffBoot().catch(() => 'failed');
      if (cancelled) return;
      if (import.meta.env.VITE_LIFF_ID) {
        try {
          const r = await import('./v5Liff').then((m) => m.v5LiffBoot());
          if (r === 'redirect' || cancelled) return;
        } catch (e) {
          if (cancelled) return;
          setV5SignInNotice(v5Msg(e));
          setSheet('signin');
        }
      }
      const s0 = await v5Session().catch(() => null);
      if (cancelled) return;
      v5LastUid.current = s0?.user?.id || '';
      await v5ApplySession(s0?.user?.id || null);
      setV5AuthReady(true);
      // Recruiter / invite link (?ref=… or ?join=1) and not signed in: open the join sheet straight away, LINE first (13 Nov funnel fix)
      try {
        const q0 = new URLSearchParams(window.location.search);
        if (!s0?.user?.id && (q0.get('ref') || v5JoinAsked.current) && !sheetRef.current && !installAskRef.current) setSheet('signin');
        // audit P3-14: ?open=rewards while signed out → sign-in first; the rewards page opens right after (pushOpenRef effect)
        else if (!s0?.user?.id && q0.get('open') === 'rewards' && !sheetRef.current) { setV5SignInNotice(L('Sign in to see your rewards')); setSheet('signin'); }
      } catch { /* ignore */ }
      off = await v5OnAuth((s1) => {
        const id = s1?.user?.id || '';
        if (id !== v5LastUid.current) {
          v5LastUid.current = id;
          v5ApplySession(id || null);
        }
      });
      if (cancelled) off();
    })();
    return () => {
      cancelled = true;
      off?.();
    };
  }, [live]);

  // V5: inbox + live chat (Realtime, with a polling fallback when the socket is not up).
  useEffect(() => { if (live && v5Uid && v5Card) a2hsSignedInVisit(); }, [live, v5Uid, !!v5Card]);   // J5: second visit on another day
  // N: after a sign-in that left the page (LINE / Google), put the visitor's Reel draft or greeting back
  useEffect(() => {
    if (!live || !v5Uid || !v5Card || draftDoneRef.current) return;
    draftDoneRef.current = true;
    if (pendingActionRef.current) { void clearSignInDraft(); return; }
    void loadSignInDraft().then(async (got) => {
      if (!got) return;
      await clearSignInDraft();
      const d = got.draft;
      if (d.kind === 'hi' && d.hi) {
        setHiTarget({ name: d.hi.name, img: d.hi.img, context: d.hi.context, id: d.hi.id });
        setHiMessage(d.hi.message);
        setHiError('');
        setSheet('hi');
      } else if (d.kind === 'reel') {
        if (got.video) { try { acceptReelRef.current(await checkReel(got.video)); } catch { /* the member picks the clip again */ } }
        setPostCaption(d.caption || '');
        if (d.places?.length) setPostPlaces(d.places);
        if (d.area) setPostArea(d.area);
        setPostHereNow(!!d.here);
        setSheet('post');
      }
      showToast(L('Your draft is back · กริ๊ง!'));
    }).catch(() => undefined);
  }, [live, v5Uid, !!v5Card]);
  useEffect(() => {
    if (!live || !v5Uid || !v5Card) return;
    let off: (() => void) | undefined;
    let dead = false;
    v5RefreshInbox();
    v5Subscribe(() => {
      v5RefreshInbox();
    }).then((f) => {
      if (dead) f();
      else off = f;
    });
    return () => {
      dead = true;
      off?.();
    };
  }, [live, v5Uid, Boolean(v5Card)]);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
    if (live && sheet === 'thread' && activeThreadId) v5LoadMessages(activeThreadId);
  }, [live, sheet, activeThreadId]);
  useEffect(() => {
    if (sheet === null) setPostEventId('');
  }, [sheet]);
  // V5: People and Feed refresh when their tab is opened (at most every 20 s), so new members and posts show up.
  const v5TabFetchedAt = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!live) return;
    const now = Date.now();
    if (now - (v5TabFetchedAt.current[tab] || 0) < 20000) return;
    v5TabFetchedAt.current[tab] = now;
    if (tab === 'people' && v5Card) v5People().then(setPeople).catch(() => undefined);
    if (tab === 'feed') v5Feed().then(setFeedItems).catch(() => undefined);
    if (tab === 'deals') v5Treats().then(setDeals).catch(() => undefined);
  }, [live, tab, Boolean(v5Card)]);

  // audit P2-8: back online → People (and the feed) load again by themselves (they stayed empty until a manual refresh)
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!isOnline) { wasOffline.current = true; return; }
    if (!wasOffline.current || !live) return;
    wasOffline.current = false;
    v5TabFetchedAt.current = {};
    if (v5Card) v5People().then(setPeople).catch(() => undefined);
    v5Feed().then(setFeedItems).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, live]);

  // Online / Offline listeners + auto-flush offline queue
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      const q = getOfflineQueue();
      if (q.length > 0) {
        clearOfflineQueue();
        setOfflineQueueCount(0);
        showToast(Lf('Back online · sent {0} queued items', String(q.length)));
      }
    };
    const onOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Deep link support (?tab=, ?deal=, ?person=, ?post=)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') as V8Tab | null;
    if (tabParam && ['feed', 'people', 'deals', 'me'].includes(tabParam)) {
      setTab(tabParam);
    }
    // 17 Nov: ?tab= is used once, so a later refresh opens the tab the member moved to (not the link's tab again)
    if (params.has('tab')) {
      try { const u = new URL(window.location.href); u.searchParams.delete('tab'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch { /* ignore */ }
    }
    const dealParam = params.get('deal');
    if (dealParam) {
      setTab('deals');
      setActiveRedeemDealId(dealParam);
    }
    const personParam = params.get('person');
    if (personParam) {
      setTab('people');
      setSearchQuery(personParam);
    }
    const postParam = params.get('post');
    if (postParam) {
      setTab('feed');
    }
  }, []);

  // 10-minute voucher countdown timer when Redeem sheet is open
  useEffect(() => {
    if (sheet !== 'redeem') return;
    setRedeemSecondsLeft(600);
    const interval = setInterval(() => {
      setRedeemSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [sheet, activeRedeemDealId]);

  // Auto-expire "I'm here now" badges after 2 hours
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setFeedItems((prev) =>
        prev.map((item) =>
          item.here && item.hereExpiresAt && item.hereExpiresAt < now
            ? { ...item, here: false }
            : item
        )
      );
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Sign-in gate helper: only prompt sign-in when performing an action
  const requireSignInForAction = (action: () => void) => {
    if (signedIn) {
      action();
    } else {
      pendingActionRef.current = action;
      setSignInNotice('');
      setSheet(live && v5Uid && !v5Card ? 'v5card' : 'signin');
    }
  };

  const completeSignIn = (provider: 'Apple' | 'Google' | 'LINE') => {
    if (live) {
      // V5: every sign-in button opens the real sheet (Google + email code); the auth listener finishes the job.
      setSheet(v5Uid && !v5Card ? 'v5card' : 'signin');
      return;
    }
    if (!isDemo) {
      // No fake success in production: real OAuth is not wired in this build yet.
      setSignInNotice(SIGNIN_NOT_READY_MSG);
      showToast(SIGNIN_NOT_READY_MSG);
      return;
    }
    setSignedIn(true);
    const updatedUser: V8UserAccount = {
      ...user,
      provider,
      role: signInTripMode === 'local' ? 'local' : 'traveller',
    };
    setUser(updatedUser);
    try {
      localStorage.setItem('kr8_signed_in', '1');
      localStorage.setItem('kr8_user', JSON.stringify(updatedUser));
    } catch {
      // ignore
    }
    const nextAction = pendingActionRef.current;
    pendingActionRef.current = null;
    setSheet(null);
    showToast(Lf('Signed in with {0}', provider));
    if (nextAction) {
      setTimeout(() => nextAction(), 60);
    }
  };

  const peopleStills = feedItems.map((f) => f.poster || (f.video ? f.img : '')).filter((u): u is string => !!u).slice(0, 6);
  const filteredPeople = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return people.filter((p) => {
      if (blockedIds.includes(p.id) || blockedIds.includes(p.name)) return false;
      const matchQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.hook.toLowerCase().includes(q) ||
        p.tags.toLowerCase().includes(q) ||
        p.langs.toLowerCase().includes(q);
      const matchLang = !filterLang || p.langCodes.some((c) => langCode(c) === filterLang);
      const matchWho = !filterWho || p.who === filterWho;
      const matchOnline = !filterOnline || p.online;
      return matchQuery && matchLang && matchWho && matchOnline;
    });
  }, [people, blockedIds, searchQuery, filterLang, filterWho, filterOnline]);

  const filteredDeals = useMemo(() => {
    if (dealCat === 'all') return deals;
    return deals.filter((d) => d.cat === dealCat);
  }, [deals, dealCat]);

  const unusedClaimedDeal = useMemo(() => {
    const unusedIds = Object.keys(claimedDeals).filter(
      (id) => claimedDeals[id] && !claimedDeals[id].used
    );
    if (unusedIds.length === 0) return null;
    const latestId = unusedIds[unusedIds.length - 1];
    return deals.find((d) => d.id === latestId) || deals[0] || null;
  }, [claimedDeals, deals]);

  const savedFeedItems = useMemo(
    () => feedItems.filter((item) => item.id && savedIds[item.id]),
    [feedItems, savedIds]
  );

  const visitedAreasSet = useMemo(() => {
    const s = new Set<string>();
    Object.keys(claimedDeals).forEach((id) => {
      const d = deals.find((item) => item.id === id);
      if (d?.area) s.add(d.area.toUpperCase());
    });
    feedItems.forEach((f) => {
      if (f.name === user.name && f.area) {
        s.add(f.area.toUpperCase());
      }
    });
    if (isDemo && signedIn) {
      s.add('ARI');
      s.add('SIAM');
      s.add('TALAD NOI');
      s.add('TALAT NOI');
    }
    return s;
  }, [claimedDeals, deals, feedItems, user.name, isDemo, signedIn]);

  const PASSPORT_AREAS = ['ARI', 'SIAM', 'TALAT NOI', 'THONGLOR', 'YAOWARAT', 'SILOM'] as const;
  const stampsFilledCount = PASSPORT_AREAS.filter(
    (a) => visitedAreasSet.has(a) || (a === 'TALAT NOI' && visitedAreasSet.has('TALAD NOI'))
  ).length;

  /** Re-fetch the feed and return how many rows are genuinely new (0 on an empty or unchanged feed). */
  const refreshFeedForNewRows = async (): Promise<number> => {
    if (isDemo) return 0;
    const fresh = await fetchRealFeedFromSupabase();
    const known = new Set(feedItems.map((f) => f.id));
    const added = fresh.filter((f) => f.id && !known.has(f.id));
    if (added.length > 0) setFeedItems(fresh);
    return added.length;
  };

  const handleDockTap = (target: V8Tab) => {
    if (sheet && ['rewards', 'claim', 'claimed', 'ranking', 'result', 'savedreels', 'place', 'profile'].includes(sheet)) setSheet(null);
    if (target === 'feed' && tab === 'feed') {
      setOrbVisible(true);
      void refreshFeedForNewRows().then((count) => {
        setTimeout(() => {
          setOrbVisible(false);
          setNewRowsCount(count);
          setNewPillVisible(count > 0);
        }, 950);
      });
      return;
    }
    setTab(target);
  };

  // audit P2-9: friendly first lines, never a meet-up ask (founder: "make new friends", no meet wording)
  const openSayHi = (name: string, img: string, context: string, id?: string, fromReel = false) => {
    setHiTarget({ name, img, context, id, fromReel });
    setHiMessage(fromReel ? Lf('Hi {0}! Love this Reel! Where is it?', name) : Lf('Hi {0}! 👋 Hi from Kring.', name));
    setHiError('');
    setSheet('hi');
  };

  const handleSendHello = () => {
    if (live) {
      const pre = validateFirstHelloMessage(hiMessage);
      if (!pre.valid) {
        setHiError(L(pre.reason || 'Please keep your first hello friendly and safe.'));
        return;
      }
      const target = hiTarget;
      const body = hiMessage.trim();
      if (!signedIn) void saveSignInDraft({ kind: 'hi', hi: { ...target, message: hiMessage } });   // N
      requireSignInForAction(() =>
        void v5Once('hello', async () => {
          if (!target.id || target.id === v5LastUid.current) {
            setHiError(v5Msg('NO_PERSON'));
            return;
          }
          try {
            await v5Hello(target.id, body);
          } catch (e) {
            setHiError(v5Msg(e, target.name));
            return;
          }
          setDailyHelloCount((n) => n + 1);
          setSentHelloRecipients((prev) => ({ ...prev, [target.name]: true }));
          a2hsFirstValue('hello');
          triggerRingBurst();
          setLastHelloTargetName(target.name);
          showToast(L('Hello sent · usually replies within a few hours · we’ll ring you'));
          v5RefreshInbox();
          if (!askedNotifAfterFirstHello) {
            setAskedNotifAfterFirstHello(true);
            try {
              localStorage.setItem('kr8_notif_prompted', '1');
            } catch {
              // ignore
            }
            setSheet('notifprompt');
          } else {
            setSheet(null);
          }
        })
      );
      return;
    }
    const pre = validateFirstHelloMessage(hiMessage);
    if (!pre.valid) {
      setHiError(L(pre.reason || 'Please keep your first hello friendly and safe.'));
      return;
    }
    requireSignInForAction(() => {
      if (sentHelloRecipients[hiTarget.name]) {
        setHiError(
          Lf('You already sent your one hello to {0}. Full chat opens as soon as they reply.', hiTarget.name)
        );
        return;
      }
      if (dailyHelloCount >= 15) {
        setHiError(
          L('You have reached your daily limit of 15 hellos today. Try again tomorrow!')
        );
        return;
      }
      const check = validateFirstHelloMessage(hiMessage);
      if (!check.valid) {
        setHiError(L(check.reason || 'Please keep your first hello friendly and safe.'));
        return;
      }

      if (!isOnline) {
        const q = enqueueOfflineAction('hello', {
          to: hiTarget.name,
          message: hiMessage.trim(),
        });
        setOfflineQueueCount(q.length);
        setSheet(null);
        showToast(
          Lf('Queued hello to {0} · will send automatically when back online', hiTarget.name)
        );
        return;
      }

      const nextSent = { ...sentHelloRecipients, [hiTarget.name]: true };
      setSentHelloRecipients(nextSent);
      const nextCount = dailyHelloCount + 1;
      setDailyHelloCount(nextCount);
      try {
        localStorage.setItem('kr8_sent_hellos', JSON.stringify(nextSent));
        const todayKey = new Date().toISOString().slice(0, 10);
        localStorage.setItem(`kr8_hellos_${todayKey}`, String(nextCount));
      } catch {
        // ignore
      }

      triggerRingBurst();
      setLastHelloTargetName(hiTarget.name);
      showToast(
        L('Hello sent · usually replies within a few hours · we’ll ring you')
      );

      if (!askedNotifAfterFirstHello) {
        setAskedNotifAfterFirstHello(true);
        try {
          localStorage.setItem('kr8_notif_prompted', '1');
        } catch {
          // ignore
        }
        setSheet('notifprompt');
      } else {
        setSheet(null);
      }
    });
  };

  const [standHowDeal, setStandHowDeal] = useState<V8Deal | null>(null);
  const [hereBusy, setHereBusy] = useState(false);
  // OPTION A (D-10NOV-E): "I'm here" → soft location (never blocks) → live pass; opening it is the use
  const openHerePass = (deal: V8Deal) => {
    requireSignInForAction(() => {
      setHereBusy(true);
      const go = (lat: number | null, lng: number | null) => {
        setHereBusy(false);
        standRef.current = null;
        setStandOpen({ slug: deal.id, src: 'here', lat, lng });
        setSheet('ticket');
      };
      try {
        if (!navigator.geolocation) { go(null, null); return; }
        navigator.geolocation.getCurrentPosition((p) => go(p.coords.latitude, p.coords.longitude), () => go(null, null),
          { enableHighAccuracy: true, timeout: 7000, maximumAge: 60_000 });
      } catch { go(null, null); }
    });
  };
  const handleClaimDeal = (deal: V8Deal) => {
    if (live && (deal.dealEn || deal.dealTh)) {
      // partner treat (OPTION A, D-10NOV-E): nothing to claim here; at the place the guest taps "I'm here"
      setStandHowDeal(deal);
      setSheet('standhow');
      return;
    }
    if (live) {
      requireSignInForAction(() =>
        void v5Once('claim-' + deal.id, async () => {
          if (deal.code) {
            setActiveRedeemDealId(deal.id);
            setSheet('redeem');
            return;
          }
          try {
            const code = await v5Claim(deal.id);
            setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, code, claimed: d.claimed + 1, leftCount: Math.max(0, (d.leftCount ?? 1) - 1) } : d)));
            setClaimedDeals((prev) => ({ ...prev, [deal.id]: { claimedAt: Date.now(), used: false } }));
            setActiveRedeemDealId(deal.id);
            setSheet('redeem');
            triggerRingBurst();
            showToast(L('Treat claimed · show the QR at the counter'));
          } catch (e) {
            showToast(v5Msg(e));
          }
          v5Treats().then(setDeals).catch(() => undefined);
        })
      );
      return;
    }
    requireSignInForAction(() => {
      if (claimedDeals[deal.id] && !claimedDeals[deal.id].used) {
        setActiveRedeemDealId(deal.id);
        setSheet('redeem');
        return;
      }
      const next = {
        ...claimedDeals,
        [deal.id]: { claimedAt: Date.now(), used: false },
      };
      setClaimedDeals(next);
      try {
        localStorage.setItem('kr8_claimed_deals', JSON.stringify(next));
      } catch {
        // ignore
      }
      setDeals((prev) =>
        prev.map((d) => (d.id === deal.id ? { ...d, claimed: d.claimed + 1 } : d))
      );
      setActiveRedeemDealId(deal.id);
      triggerRingBurst();
      showToast(L("Ticket saved to Me · show code at counter"));
    });
  };

  const storeSaved = (next: Record<string, boolean>) => {
    setSavedIds(next);
    try {
      localStorage.setItem('kr8_saved', JSON.stringify(next));
    } catch {
      // ignore
    }
  };
  const handleToggleSave = (id: string) => {
    const on = !savedIds[id];
    storeSaved({ ...savedIds, [id]: on });
    showToast(on ? L('Saved to Me') : L('Removed from Saved'));
    if (on) a2hsFirstValue('save');
    // signed in (live): saves live on the account, so they follow the member to a new phone
    if (live && v5Card && /^[0-9a-f-]{36}$/.test(id)) {
      void v5ToggleSave(id)
        .then((serverOn) => {
          if (serverOn !== on) setSavedIds((prev) => ({ ...prev, [id]: serverOn }));
        })
        .catch((e) => {
          setSavedIds((prev) => ({ ...prev, [id]: !on }));
          showToast(v5Msg(e));
        });
    }
  };

  // ── Reel social (0026): like, double-tap, share sheet, Not interested / Report, place tag, views
  const [reelSheetId, setReelSheetId] = useState<string>('');
  const [heartBurst, setHeartBurst] = useState<{ id: string; n: number } | null>(null);
  const [tagPlaces, setTagPlaces] = useState<V5TagPlace[]>([]);
  const [postPlace, setPostPlace] = useState<string>('');
  const reelTapRef = useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const patchFeed = (id: string, patch: Partial<V8FeedItem>) =>
    setFeedItems((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const handleLikeReel = (p: V8FeedItem, fromDoubleTap = false) => {
    if (!live || !p.id) return;
    if ((p as V5FeedItem).mine) {
      if (!fromDoubleTap) showToast(L('That’s your own Reel.'));
      return;
    }
    if (fromDoubleTap && p.liked) return;   // double-tap only ever likes
    const id = p.id;
    requireSignInForAction(() =>
      void v5Once('like-' + id, async () => {
        const cur = feedItemsRef.current.find((f) => f.id === id) || p;
        const was = { liked: !!cur.liked, likes: cur.likes || 0 };
        patchFeed(id, { liked: !was.liked, likes: Math.max(0, was.likes + (was.liked ? -1 : 1)) });
        try {
          const r = await v5ToggleLike(id);
          patchFeed(id, { liked: r.liked, likes: r.likes });
        } catch (e) {
          patchFeed(id, was);
          showToast(v5Msg(e));
        }
      })
    );
  };
  /** One tap = sound on/off (right away, inside the tap, so phones allow it). Two quick taps = like + heart. */
  const handleReelTap = (e: React.MouseEvent<HTMLDivElement>, p: V8FeedItem) => {
    const target = e.target as HTMLElement | null;
    if (!target || target.closest('button, a, input, textarea, select')) return;
    toggleReelSound(e);
    const now = Date.now();
    const last = reelTapRef.current;
    if (p.id && last.id === p.id && now - last.at < 320) {
      reelTapRef.current = { id: '', at: 0 };
      if ((p as V5FeedItem).mine || p.reelPending) return;
      setHeartBurst({ id: p.id, n: now });
      handleLikeReel(p, true);
    } else {
      reelTapRef.current = { id: p.id || '', at: now };
    }
  };
  const activeReel = feedItems.find((f) => f.id === reelSheetId);
  const [reportStep, setReportStep] = useState(false);
  const openReelSheet = (p: V8FeedItem, which: 'reelshare' | 'reelmore') => {
    if (!p.id) return;
    setReportStep(false);
    setReelSheetId(p.id);
    setSheet(which);
    // the share link (/r/<short>) is fetched now, so the tap on Copy / Share can use it at once (phones only allow copy inside the tap)
    if (which === 'reelshare' && live && /^[0-9a-f-]{36}$/.test(p.id)) void kxShareLink(p.id).catch(() => undefined);
  };
  const shareReel = async (p: V8FeedItem, channel: 'line' | 'copy' | 'native') => {
    if (!p.id) return;
    // https://kringapp.com/r/<short>: the website logs the open (+Rings for the poster, never from LINE) and sends people to this Reel
    const url = kxShareLinkCached(p.id) || (live && /^[0-9a-f-]{36}$/.test(p.id) ? await kxShareLink(p.id).catch(() => v5ReelLink(p.id)) : v5ReelLink(p.id));
    const text = `${p.name || 'Kring'} · ${p.area ? L(p.area) : L('All Bangkok')} · ${L('Explore Bangkok, make new friends')} · กริ๊ง!`;
    if (channel === 'line') {
      window.open(`https://line.me/R/share?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank', 'noopener');
    } else if (channel === 'copy') {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch { /* ignore */ }
        ta.remove();
      }
      showToast(L('Link copied'));
    } else {
      try {
        await navigator.share({ title: 'Kring · กริ๊ง!', text, url });
      } catch {
        return;   // closed the share sheet: nothing shared
      }
    }
    void v5LogShare(p.id, channel);
    setSheet(null);
  };
  const dropReelLocally = (id: string) => setFeedItems((prev) => prev.filter((f) => f.id !== id));
  const handleNotInterested = (p: V8FeedItem) => {
    const id = p.id;
    if (!id) return;
    requireSignInForAction(() =>
      void v5Once('hide-' + id, async () => {
        try {
          await v5NotInterested(id);
          dropReelLocally(id);
          setSheet(null);
          showToast(L('Hidden · you won’t see this Reel again'));
        } catch (e) {
          showToast(v5Msg(e));
        }
      })
    );
  };
  const handleReportReel = (p: V8FeedItem, reason: V5ReportReason) => {
    const id = p.id;
    if (!id) return;
    requireSignInForAction(() =>
      void v5Once('report-' + id, async () => {
        try {
          await v5ReportReel(id, reason);
          dropReelLocally(id);
          setSheet(null);
          showToast(reason === 'block' ? L('Blocked · you won’t see their Reels') : L('Thanks · we’ll check it. You won’t see this Reel again.'));
          v5Feed().then(setFeedItems).catch(() => undefined);
        } catch (e) {
          showToast(v5Msg(e));
        }
      })
    );
  };
  // Settings → Blocked people (A-08: unblock screen)
  const [blockList, setBlockList] = useState<V5Blocked[] | null>(null);
  useEffect(() => {
    if (sheet !== 'blocked' || !live) return;
    setBlockList(null);
    v5MyBlocks().then((r) => setBlockList(r || [])).catch(() => setBlockList([]));
  }, [sheet, live]);
  const handleUnblock = (b: V5Blocked) =>
    void v5Once('unblock-' + b.user_id, async () => {
      try {
        await v5Unblock(b.user_id);
        setBlockList((prev) => (prev || []).filter((x) => x.user_id !== b.user_id));
        setBlockedIds((prev) => prev.filter((x) => x !== b.user_id));
        showToast(L('Unblocked'));
        v5Feed().then(setFeedItems).catch(() => undefined);
      } catch (e) {
        showToast(v5Msg(e));
      }
    });

  // Android back button / browser back (A-11): an open sheet takes one history step; Back closes it.
  // Leaving the Feed tab takes one step too; Back returns to the Feed before it leaves the app.
  const histSheetRef = useRef(false);
  const histTabRef = useRef(false);
  const ignorePopRef = useRef(0);
  const tabNowRef = useRef(tab);
  tabNowRef.current = tab;
  useEffect(() => {
    try {
      if (sheet && !histSheetRef.current) {
        history.pushState({ kr8: 'sheet' }, '');
        histSheetRef.current = true;
      } else if (!sheet && histSheetRef.current) {
        histSheetRef.current = false;
        if (history.state && history.state.kr8 === 'sheet') {
          ignorePopRef.current += 1;
          history.back();
        }
      }
    } catch {
      // ignore
    }
  }, [sheet]);
  useEffect(() => {
    try {
      if (tab !== 'feed' && !histTabRef.current && !histSheetRef.current) {
        // 17 Nov: after a refresh on a tab, the browser already holds our tab step; reuse it (no extra Back press)
        if (!(history.state && history.state.kr8 === 'tab')) history.pushState({ kr8: 'tab' }, '');
        histTabRef.current = true;
      } else if (tab === 'feed' && histTabRef.current && !histSheetRef.current) {
        histTabRef.current = false;
        if (history.state && history.state.kr8 === 'tab') {
          ignorePopRef.current += 1;
          history.back();
        }
      }
    } catch {
      // ignore
    }
  }, [tab]);
  useEffect(() => {
    const onPop = () => {
      if (ignorePopRef.current > 0) {
        ignorePopRef.current -= 1;
        return;
      }
      if (histSheetRef.current) {
        histSheetRef.current = false;
        setSheet(null);
        return;
      }
      if (histTabRef.current || tabNowRef.current !== 'feed') {
        histTabRef.current = false;
        setTab('feed');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Me tab (locked 10 Nov): my profile, Top 10 rank, someone else's profile, follow lists, activity
  const [meProfile, setMeProfile] = useState<V5Profile | null>(null);
  const [meRank, setMeRank] = useState<number | null>(null);
  const [mePosters, setMePosters] = useState<Record<string, string>>({});
  const [otherProfile, setOtherProfile] = useState<V5Profile | null>(null);
  const [, setOtherRank] = useState<number | null>(null);
  // Card + Rings + Ranking + Places (feat/card-rewards-rank-places)
  const [kxMe, setKxMe] = useState<KxCardExtras | null>(null);
  const [kxOther, setKxOther] = useState<KxCardExtras | null>(null);
  const [kxWeekRank, setKxWeekRank] = useState<number | null>(null);
  const [kxRewards, setKxRewards] = useState<KxRewards | null>(null);
  const [kxClaimFocus, setKxClaimFocus] = useState<{ id: string | null; fresh: boolean }>({ id: null, fresh: false });
  const [kxPrizeSel, setKxPrizeSel] = useState<KxPrize | null>(null);
  const [kxResult, setKxResult] = useState<KxWeekResult | null>(null);
  const [kxSaved, setKxSaved] = useState<KxSavedReel[] | null>(null);
  const [kxRankLine, setKxRankLine] = useState<string>('');
  // 16 Nov prize banner: this week's board for the member (the same kr8_weekly_ranking call the Me row makes), shared by the Feed ticker and the Me card
  const [kxWeek, setKxWeek] = useState<KxRanking | null>(null);
  const [prizeHideTick, setPrizeHideTick] = useState(0);
  const kxWeekAt = useRef(0);
  const [kxMathFor, setKxMathFor] = useState<string | null>(null);
  const [kxHow, setKxHow] = useState(false);
  const [kxPlaceId, setKxPlaceId] = useState<string>('');
  const [kxFeedX, setKxFeedX] = useState<Record<string, KxFeedExtra>>({});
  const [postPlaces, setPostPlaces] = useState<PickedPlace[]>([]);
  const [placeSearchOpen, setPlaceSearchOpen] = useState(false);
  const [kxInviter, setKxInviter] = useState<string>('');
  const kxLoadRewards = async () => {
    // 16 Nov fix: one quiet retry before the error toast (the card shows the last known number, never a stuck '…')
    try { const r = await kxMyRewards().catch(() => new Promise<void>((ok) => setTimeout(ok, 1500)).then(() => kxMyRewards())); setKxRewards(r); setKxMe((m) => (m ? { ...m, week: r.week, week_rank: r.rank, lifetime: r.lifetime, level: r.level, prizes: r.prizes.filter((x) => x.status === 'won').length } : m)); return r; } catch (e) { showToast(v5Msg(e)); return null; }
  };
  const kxInviteLink = (no: number | null | undefined) => `${location.origin}${import.meta.env.BASE_URL}?ref=${inviteCode(no ?? kxMe?.member_no)}`;
  const kxShareInvite = async (no?: number | null) => {
    const url = kxInviteLink(no);
    const text = `${user.name || ''} · Kring · ${L('Explore Bangkok, make new friends')}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'Kring · กริ๊ง!', text, url }); return; }
      await navigator.clipboard.writeText(url);
      showToast(L('Link copied'));
    } catch { /* closed the share sheet */ }
  };
  const [kxPlaceHalf, setKxPlaceHalf] = useState<{ half: boolean; preview: { name_en: string; name_th: string | null; area: string } | null }>({ half: false, preview: null });
  const kxOpenPlace = (id: string, preview: { name_en: string; name_th: string | null; area: string } | null = null, half = false) => { setKxPlaceHalf({ half, preview }); setKxPlaceId(id); setSheet('place'); };
  /** Share one of my Reels by its /r/<short> link (from the math sheet or the week result). */
  const kxShareReelId = async (id: string | null) => {
    if (!id) return;
    let url = '';
    try { url = await kxShareLink(id); } catch (e) { showToast(v5Msg(e)); return; }
    try {
      if (navigator.share) { await navigator.share({ title: 'Kring · กริ๊ง!', text: `${user.name || 'Kring'} · ${L('Explore Bangkok, make new friends')} · กริ๊ง!`, url }); return; }
      await navigator.clipboard.writeText(url);
      showToast(L('Link copied'));
    } catch { /* closed the share sheet */ }
  };
  /** The Ranking tile's second line: the next step and what it pays. */
  const kxTileLine = (r: KxRanking): string => {
    const g = r.gap;
    if (!g) return '';
    if (g.prize_now > 0 && (g.state === 'top' || !g.target)) return Lf('{0} now', baht(g.prize_now));
    if (g.state === 'far') return Lf('{0} to top 10', String(g.top10_need ?? g.target?.need ?? ''));
    if (g.state === 'off' && !(r.mine && r.mine.live > 0)) return r.open_seats > 0 ? (r.open_seats === 1 ? L('1 seat open') : Lf('{0} seats open', String(r.open_seats))) : '';
    if (g.target && g.target.prize > 0) return Lf('{0} to {1}', String(g.target.need), baht(g.target.prize));
    return '';
  };
  /** One call refreshes the Me row and both prize banners. At most once a minute unless forced (opening Me forces it, as before). */
  const kxLoadWeek = (force = false) => {
    if (!force && Date.now() - kxWeekAt.current < 60_000) return;
    kxWeekAt.current = Date.now();
    kxRanking('all').then((r) => {
      setKxWeek(r); setKxWeekRank(r.me?.rank ?? null); setKxRankLine(kxTileLine(r));
      // the "This week" Rings on Me come from the same board (kr8_week_board), so the row and the banners never disagree
      setKxMe((m) => (m ? { ...m, week: r.me?.rings ?? 0, week_rank: r.me?.all_rank ?? null } : m));
    }).catch(() => { kxWeekAt.current = 0; });
  };
  const kxLoadSaved = () => kxSavedReels().then((rows) => { setKxSaved(rows || []); void signPosters((rows || []).slice(0, 3).map((x) => x.poster_path)); }).catch(() => setKxSaved((x) => x || []));
  // a visitor who came through a share link (/r/<short> → ?reel=…&so=<open id>): once signed in, tell the server who it was (own opens count 0)
  const kxOpenRef = useRef<string | null>((() => { try { const v = new URLSearchParams(location.search).get('so'); return v && /^[0-9a-f-]{36}$/.test(v) ? v : null; } catch { return null; } })());
  useEffect(() => {
    if (!live || !v5Uid || !kxOpenRef.current) return;
    const id = kxOpenRef.current;
    kxOpenRef.current = null;
    void kxShareOpenSeen(id);
  }, [live, v5Uid]);   // eslint-disable-line react-hooks/exhaustive-deps
  // on open: marks today for the streak badge (no Rings), tells the member when a held code has arrived, and shows last week's result once
  const [kxReady, setKxReady] = useState(false);
  useEffect(() => {
    if (!live || !v5Uid || !v5Card) return;
    const day = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const key = `kr8_checkin_${v5Uid}`;
    let seenDay = '';
    try { seenDay = localStorage.getItem(key) || ''; } catch { /* private mode */ }
    let dead = false;
    kxCheckin().then((c) => {
      if (dead) return;
      try { localStorage.setItem(key, day); } catch { /* private mode */ }
      let seen: string[] = [];
      try { seen = JSON.parse(localStorage.getItem('kr8_ready_seen') || '[]'); } catch { seen = []; }
      const fresh = (c.ready || []).filter((r) => !seen.includes(r.id));
      if (fresh.length) {
        setKxReady(true);
        const r = fresh[0];
        setTimeout(() => showToast(Lf('Your {0} code is ready', `${r.brand === 'grab' ? 'Grab' : r.brand === 'shopeepay' ? 'ShopeePay' : 'TrueMoney'} ฿${r.amount}`)), 1200);
        try { localStorage.setItem('kr8_ready_seen', JSON.stringify([...seen, ...fresh.map((x) => x.id)].slice(-50))); } catch { /* private mode */ }
      }
      // week close: the first open after Monday 00:00 shows the result once (top 10 only; winners get one-tap Claim)
      const res = c.result;
      if (res && res.rank <= 10) {
        const k = `kr8_result_seen_${v5Uid}`;
        let seenWeek = '';
        try { seenWeek = localStorage.getItem(k) || ''; } catch { /* private mode */ }
        if (seenWeek !== res.week) {
          try { localStorage.setItem(k, res.week); } catch { /* private mode */ }
          setKxResult(res);
          setTimeout(() => { if (!sheetRef.current) setSheet('result'); }, 900);
        }
      }
      if ((c.prizes ?? 0) > 0) setKxReady(true);
      void seenDay;
    }).catch(() => undefined);
    return () => { dead = true; };
  }, [live, v5Uid, !!v5Card]);   // eslint-disable-line react-hooks/exhaustive-deps
  // places + TikTok for the Reels in the feed (one call per new batch)
  useEffect(() => {
    if (!live) return;
    const ids = feedItems.filter((f) => (f as { video?: string }).video && /^[0-9a-f-]{36}$/.test(f.id) && !(f.id in kxFeedX)).map((f) => f.id);
    if (!ids.length) return;
    let dead = false;
    kxFeedExtras(ids).then((rows) => {
      if (dead) return;
      setKxFeedX((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = next[id] || { post_id: id, tiktok: null, places: [] };
        for (const r of rows || []) next[r.post_id] = r;
        return next;
      });
    }).catch(() => undefined);
    return () => { dead = true; };
  }, [live, feedItems]);   // eslint-disable-line react-hooks/exhaustive-deps
  // ?place=<id> opens a place page; a member invite code (?ref=k00412) shows the friend's first name on the join sheet
  useEffect(() => {
    if (!live) return;
    try {
      const q = new URLSearchParams(location.search);
      const pid = q.get('place');
      if (pid && /^[0-9a-f-]{36}$/.test(pid)) kxOpenPlace(pid);
    } catch { /* ignore */ }
    const ref = v5StoredRef();
    if (/^k[0-9]{5,7}$/.test(ref)) kxRefName(ref).then((n) => { if (n) setKxInviter(n); }).catch(() => undefined);
  }, [live]);   // eslint-disable-line react-hooks/exhaustive-deps
  // did the member already have a card when the card sheet opened? (new card → "Card minted!")
  const v5CardWasRef = useRef<boolean>(false);
  useEffect(() => { if (sheet === 'v5card') v5CardWasRef.current = !!v5Card; }, [sheet]);   // eslint-disable-line react-hooks/exhaustive-deps
  // 16 Nov: Kring is for real people. A member whose card photo shows no clear face (helmet, fireworks, scenery, cartoon)
  // gets the card screen once per app session with "add a photo where your face is clearly visible". Checked on the phone.
  const [photoFix, setPhotoFix] = useState(false);
  const photoAskedRef = useRef(false);
  useEffect(() => {
    if (!live || !v5Card) { setPhotoFix(false); return; }
    const src = v5Card.photo || '';
    const key = 'kr8_dp_ok2:' + src.split('?')[0];   // 17 Nov: v2 = stricter check (old 'ok' marks are ignored)
    let ok = false;
    try { ok = !!src && localStorage.getItem(key) === '1'; } catch { /* ignore */ }
    // 0076: the card photo's face code (one person, one account), once per photo, in the background
    const cardPrint = () => { void ensureCardPrint(src, { describe: (u) => loadImage(u).then(faceDescriptor), save: v5SaveCardPrint }); };
    if (ok) { setPhotoFix(false); cardPrint(); return; }
    let gone = false;
    (async () => {
      const v = src ? await checkProfilePhoto(src) : 'none';
      if (gone) return;
      if (v === 'ok' || v === 'error') {
        if (v === 'ok') { try { localStorage.setItem(key, '1'); } catch { /* ignore */ } cardPrint(); }
        setPhotoFix(false);
        return;
      }
      setPhotoFix(true);
      if (!photoAskedRef.current) {
        photoAskedRef.current = true;
        setSheet((cur) => cur || 'v5card');
      }
    })();
    return () => { gone = true; };
  }, [live, v5Card?.photo]);   // eslint-disable-line react-hooks/exhaustive-deps
  const kxPostAt = (p?: PickedPlace) => {
    if (p) { setPostPlaces((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev].slice(0, 2))); setPostArea((a) => a || p.kr_area || 'Bangkok'); }
    setTab('feed');
    setPostPhotoUrl('');
    setSheet('post');
    v5LogClient('reel_open', 'place');
  };
  // ───────── go-live build (15 Nov): Reel player, profile grid, tagged people, one-time coach marks ─────────
  const [goPlayer, setGoPlayer] = useState<{ reels: GoReel[]; start: number; viewProfile?: { id: string; name: string; photo: string | null } | null; title?: string } | null>(null);
  const [goOtherReels, setGoOtherReels] = useState<KxMemberReels | null>(null);
  const [goOtherGender, setGoOtherGender] = useState<string | null>(null);
  const [goMine, setGoMine] = useState<KxGridReel[] | null>(null);
  const [goMeTab, setGoMeTab] = useState<'reels' | 'saved'>('reels');
  const [goDealF, setGoDealF] = useState<'all' | 'perks' | 'trip'>('all');
  const [postPeople, setPostPeople] = useState<KxTagPerson[]>([]);
  const [goPeople, setGoPeople] = useState<Record<string, KxTagPerson[]>>({});
  const [coachSpot, setCoachSpot] = useState<CoachSpot | null>(null);
  const coachRef = useRef<CoachState>(newCoachState());
  const goLoadMine = () => { if (v5Uid) kxMemberReels(v5Uid).then((r) => { setGoMine(r.reels || []); if ((r.reels || []).some((x) => x.status === 'approved')) a2hsMoment('reel_approved'); }).catch(() => setGoMine((x) => x || [])); };
  const goOpenPlayer = (reels: GoReel[], start: number, extra: { viewProfile?: { id: string; name: string; photo: string | null } | null; title?: string } = {}) => {
    if (!reels.length) return;
    setGoPlayer({ reels, start, ...extra });
    kxReelPeople(reels.map((r) => r.id)).then((rows) => {
      if (!rows || !rows.length) return;
      const m = new Map(rows.map((x) => [x.post_id, x.people]));
      setGoPlayer((cur) => (cur && cur.reels === reels ? { ...cur, reels: reels.map((r) => ({ ...r, people: m.get(r.id) || r.people })) } : cur));
    }).catch(() => undefined);
  };
  const goIsMine = (id: string) => !!goPlayer?.reels.find((r) => r.id === id)?.mine;
  const goLike = (id: string): Promise<{ liked: boolean; likes: number } | null> => new Promise((done) => {
    if (goIsMine(id)) { showToast(L('That’s your own Reel.')); done(null); return; }
    let ran = false;
    requireSignInForAction(() => {
      ran = true;
      v5ToggleLike(id).then((r) => { patchFeed(id, { liked: r.liked, likes: r.likes }); done(r); }).catch((e) => { showToast(v5Msg(e)); done(null); });
    });
    if (!ran) { setGoPlayer(null); done(null); }
  });
  const goSave = (id: string): Promise<boolean | null> => new Promise((done) => {
    let ran = false;
    requireSignInForAction(() => {
      ran = true;
      v5ToggleSave(id).then((on) => {
        setSavedIds((prev) => ({ ...prev, [id]: on }));
        showToast(on ? L('Saved to Me') : L('Removed from Saved'));
        void kxLoadSaved();
        done(on);
      }).catch((e) => { showToast(v5Msg(e)); done(null); });
    });
    if (!ran) { setGoPlayer(null); done(null); }
  });
  /** Ranking: tap a member → their best Reel of the week, full screen, with "View profile". No Reel this week → their profile. */
  const goOpenBest = async (id: string) => {
    try {
      const [mr, p] = await Promise.all([kxMemberReels(id), v5Profile(id)]);
      const ok = mr.reels.filter((r) => r.status === 'approved');
      const best = ok.find((r) => r.id === mr.best);
      if (!best) { void openProfile(id); return; }
      const author = { id, name: p.first_name, photo: p.photo, handle: p.ig_handle };
      const rest = ok.filter((r) => r.id !== best.id && r.this_week).sort((a, b) => b.rings - a.rings);
      goOpenPlayer([best, ...rest].map((r) => gridToGo(r, author, id === v5Uid)), 0, { viewProfile: { id, name: p.first_name, photo: p.photo } });
    } catch { void openProfile(id); }
  };
  const coachTry = (due: CoachKey[], find: (k: CoachKey) => { el: Element | null | undefined; text: string }) => {
    if (!live || coachSpot) return;
    const st = coachRef.current;
    const key = coachPick(st, due.filter((k) => coachDue(st, k, { sheetOpen: false, onScreen: false })));
    if (!key) return;
    const { el, text } = find(key);
    const r = el?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return;
    const root = document.querySelector('.v8-app-root')?.getBoundingClientRect();
    // marked as seen when the member closes it (below), so a mark that a sheet covered straight away shows again next time
    setCoachSpot({ key, rect: { x: r.left - (root?.left || 0), y: r.top, w: r.width, h: r.height }, text });
  };
  useEffect(() => {
    if (live && v5Uid && v5Card) void coachSync(coachRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, v5Uid, !!v5Card]);
  // a sheet that opens by itself (week result, sign-in…) always wins over a feed coach mark: the mark steps aside, unseen
  useEffect(() => {
    if (sheet && coachSpot && (coachSpot.key === 'save' || coachSpot.key === 'post')) setCoachSpot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);
  const goSessionN = useMemo(() => {
    try { const n = Number(localStorage.getItem('kr8_sessions') || '0') + 1; localStorage.setItem('kr8_sessions', String(n)); return n; } catch { return 1; }
  }, []);
  // Feed coach marks: Save on the first Reel (mark 1); from the second visit, "+" for members with no Reel yet (mark 2)
  useEffect(() => {
    if (!live || !v5Card || tab !== 'feed' || sheet || goPlayer || coachSpot) return;
    const t = setTimeout(() => {
      if (sheetRef.current || document.querySelector('.kx-page, .go-page, .v8-sheet, .kx-shbg')) return;
      const slides = [...document.querySelectorAll<HTMLElement>('#s-feed .slide.has-reel')];
      const cur = slides.find((el) => { const r = el.getBoundingClientRect(); return r.top > -80 && r.top < window.innerHeight / 2; });
      const due: CoachKey[] = [];
      if (FEED_TOP_BAR && goSessionN >= 2 && kxMe && kxMe.has_reel === false) due.push('post');   // the + only exists with the top bar
      if (cur?.querySelector('[data-act="save"]')) due.push('save');
      coachTry(due, (k) => (k === 'post'
        ? { el: document.querySelector('#s-feed .kp-plus'), text: L('Post your first Reel here') }
        : { el: cur?.querySelector('[data-act="save"]'), text: Lf('A save gives {0} 3 Rings. A like gives 1.', cur?.querySelector('.reel-author')?.textContent?.trim().split(/\s/)[0] || L('the poster')) }));
    }, 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, !!v5Card, tab, sheet, !!goPlayer, feedItems.length, kxMe?.has_reel]);
  // "with @name" under Reels in the feed (one call per new batch)
  useEffect(() => {
    if (!live) return;
    const ids = feedItems.filter((f) => (f as { video?: string }).video && /^[0-9a-f-]{36}$/.test(f.id) && !(f.id in goPeople)).map((f) => f.id);
    if (!ids.length) return;
    let dead = false;
    kxReelPeople(ids).then((rows) => {
      if (dead) return;
      setGoPeople((prev) => { const next = { ...prev }; for (const id of ids) next[id] = next[id] || []; for (const r of rows || []) next[r.post_id] = r.people; return next; });
    }).catch(() => undefined);
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, feedItems]);
  const [followFor, setFollowFor] = useState<{ user: string; name: string; counts: [number, number]; initial: 'followers' | 'following' } | null>(null);
  const [activityRows, setActivityRows] = useState<V5Activity[] | null>(null);
  const [activityUnread, setActivityUnread] = useState(false);
  const [activitySeenAt, setActivitySeenAt] = useState('');
  const [followBusy, setFollowBusy] = useState(false);
  const [verifyPending, setVerifyPending] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const signPosters = async (paths: string[]) => {
    if (!paths.length) return;
    try {
      const m = await import('./v5Reel');
      const signed = await m.signReelPaths(paths);
      setMePosters((prev) => ({ ...prev, ...signed }));
    } catch {
      // posters stay blank
    }
  };
  const rankOf = async (uid: string): Promise<number | null> => {
    try {
      const rows = await v5Top10('today');
      return rows.find((r) => r.user_id === uid)?.rank ?? null;
    } catch {
      return null;
    }
  };
  const loadMe = async () => {
    if (!live || !v5Uid || !v5Card) return;
    try {
      const p = await v5Profile();
      setMeProfile(p);
      void signPosters(p.reels.map((r) => r.poster_path));
      kxCardExtras().then(setKxMe).catch(() => undefined);
      kxLoadWeek(true);
      void kxLoadSaved();
      goLoadMine();
      setMeRank(await rankOf(p.user_id));
      if (!p.verified) v5MyVerification().then((v) => setVerifyPending(v?.status === 'pending')).catch(() => undefined);
    } catch {
      // keep what is on screen
    }
    try {
      const a = await v5Activity();
      setActivityRows(a);
      const seen = (() => { try { return localStorage.getItem('kr8_activity_seen') || ''; } catch { return ''; } })();
      setActivityUnread(!!a.length && a[0].at > seen);
      void signPosters(a.map((x) => x.poster_path || '').filter(Boolean));
    } catch {
      // no activity yet
    }
  };
  useEffect(() => {
    if (live && v5Uid && v5Card && tab === 'me') void loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, v5Uid, !!v5Card, tab, v5Card?.first_name, v5Card?.photo]);
  // 16 Nov prize banner: the week is fetched once signed in, again when the app comes back to the front or the Feed is opened
  // (at most once a minute), and every 5 minutes while the app is on screen, so the Rings on the banner stay current.
  useEffect(() => {
    if (!live || !v5Uid || !v5Card) { setKxWeek(null); kxWeekAt.current = 0; return; }
    kxLoadWeek(true);
    const vis = () => { if (document.visibilityState === 'visible') kxLoadWeek(); };
    document.addEventListener('visibilitychange', vis);
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') kxLoadWeek(); }, 300000);
    return () => { document.removeEventListener('visibilitychange', vis); window.clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, v5Uid, !!v5Card]);
  useEffect(() => { if (live && v5Uid && v5Card && tab === 'feed') kxLoadWeek(); }, [tab]);   // eslint-disable-line react-hooks/exhaustive-deps
  // "Online" = opened the app in the last 5 minutes
  // 0061: the admin's own ghost card shows one line on Me (the database already hides it from everyone else)
  const [v5Ghost, setV5Ghost] = useState(false);
  useEffect(() => {
    if (!live || !v5Uid || !v5Card) { setV5Ghost(false); return; }
    let on = true;
    void v5MyGhost().then((g) => { if (on) setV5Ghost(g); });
    return () => { on = false; };
  }, [live, v5Uid, !!v5Card]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!live || !v5Uid || !v5Card) return;
    void v5Touch();
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void v5Touch(); }, 120000);
    return () => window.clearInterval(id);
  }, [live, v5Uid, !!v5Card]);
  const openProfile = async (id?: string | null) => {
    if (!id) return;
    // 0073: the Kring Team account is a sender only: a small official card, never a member profile (no Say hi / Follow)
    if (live && (await v5TeamIds().catch(() => [] as string[])).includes(id)) { setSheet('official'); return; }
    if (live && id === v5Uid) {
      setSheet(null);
      setTab('me');
      return;
    }
    try {
      const p = await v5Profile(id);
      setOtherProfile(p);
      setOtherRank(null);
      setKxOther(null);
      kxCardExtras(id).then(setKxOther).catch(() => undefined);
      setGoOtherGender(null);
      void kxGenderShown(id).then(setGoOtherGender);
      setGoOtherReels(null);
      kxMemberReels(id).then(setGoOtherReels).catch(() => setGoOtherReels({ user_id: id, mine: false, best: null, reels: [] }));
      setSheet('profile');
      void signPosters(p.reels.map((r) => r.poster_path));
      void rankOf(id).then(setOtherRank);
    } catch (e) {
      showToast(v5Msg(e));
    }
  };
  const toggleFollow = async (id: string, on: boolean): Promise<boolean> => {
    let result = on;
    await new Promise<void>((done) =>
      requireSignInForAction(() =>
        void v5Once('follow-' + id, async () => {
          try {
            if (on) await v5Unfollow(id);
            else await v5Follow(id);
            result = !on;
          } catch (e) {
            showToast(v5Msg(e));
          } finally {
            done();
          }
        })
      )
    );
    return result;
  };
  const handleProfileFollow = async () => {
    if (!otherProfile) return;
    setFollowBusy(true);
    const was = otherProfile.i_follow;
    const now = await toggleFollow(otherProfile.user_id, was);
    setOtherProfile((p) => (p ? { ...p, i_follow: now, followers: Math.max(0, p.followers + (now === was ? 0 : now ? 1 : -1)) } : p));
    setFollowBusy(false);
    if (now !== was) showToast(now ? Lf('Following {0}', otherProfile.first_name) : Lf('Unfollowed {0}', otherProfile.first_name));
  };
  const openFollowList = (p: V5Profile, kind: 'followers' | 'following') => {
    if (!live || !v5Uid) {
      requireSignInForAction(() => undefined);
      return;
    }
    setFollowFor({ user: p.user_id, name: p.first_name, counts: [p.followers, p.following], initial: kind });
    setSheet('follow');
  };
  const shareProfile = async (p: V5Profile) => {
    const url = v5ProfileLink(p.user_id);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Kring · กริ๊ง!', text: `${p.first_name} · Kring · ${L('Explore Bangkok, make new friends')}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast(L('Link copied'));
    } catch {
      // closed the share sheet
    }
  };
  const openReelFromProfile = (id: string) => {
    setSheet(null);
    setTab('feed');
    setTimeout(() => document.querySelector(`[data-post-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' }), 150);
  };
  // tapping the dock while a profile is open goes to that tab
  const tabForProfileRef = useRef(tab);
  useEffect(() => {
    if (tabForProfileRef.current !== tab && sheetRef.current === 'profile') setSheet(null);
    tabForProfileRef.current = tab;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  // kringapp.com/app/?u=<id> opens that profile
  const profileLinkRef = useRef<string | null>((() => { try { return new URLSearchParams(location.search).get('u'); } catch { return null; } })());
  useEffect(() => {
    const id = profileLinkRef.current;
    if (!live || !id || !/^[0-9a-f-]{36}$/.test(id)) return;
    profileLinkRef.current = null;
    void openProfile(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, v5Uid]);

  // STAFF SWIPE: kringapp.com/app/?v=<slug>&src=stand (counter stand QR) opens the live ticket; survives the Google sign-in redirect
  const [standInit] = useState<{ slug: string; src: string } | null>(() => {
    try {
      const q = new URLSearchParams(location.search);
      const v = (q.get('v') || '').trim().toLowerCase();
      if (/^[a-z0-9-]{2,60}$/.test(v)) {
        const r = { slug: v, src: 'here' };   // OPTION A: any ?v=<place> link (practice test link, old stand QRs) opens the live pass
        sessionStorage.setItem('kr8_stand', JSON.stringify({ ...r, at: Date.now() }));
        return r;
      }
      const s0 = JSON.parse(sessionStorage.getItem('kr8_stand') || 'null') as { slug: string; src: string; at: number } | null;
      if (s0 && Date.now() - s0.at < 15 * 60_000) return { slug: s0.slug, src: s0.src };
    } catch { /* ignore */ }
    return null;
  });   // lazy: runs once (it writes the resume note, so it must not run on every render)
  const standRef = useRef(standInit);
  const [v5AuthReady, setV5AuthReady] = useState(false);
  const [standOpen, setStandOpen] = useState<{ slug: string; src: string; lat?: number | null; lng?: number | null } | null>(null);
  useEffect(() => {
    if (!live || !standRef.current || standOpen) return;
    setStandOpen(standRef.current);
    setSheet('ticket');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);
  const closeTicket = () => {
    standRef.current = null;
    setStandOpen(null);
    try { sessionStorage.removeItem('kr8_stand'); } catch { /* ignore */ }
    try { const u = new URL(location.href); u.searchParams.delete('v'); u.searchParams.delete('src'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); } catch { /* ignore */ }
    setSheet(null);
  };
  // door sticker QR: kringapp.com/app/?place=<slug> → that place in Deals
  const placeLinkRef = useRef<string | null>((() => { try { return new URLSearchParams(location.search).get('place'); } catch { return null; } })());
  useEffect(() => {
    const id = placeLinkRef.current;
    if (!id || !deals.length) return;
    placeLinkRef.current = null;
    openReelPlace({ dealId: id } as NonNullable<V8FeedItem['place']>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals.length]);

  const openReelPlace = (place: NonNullable<V8FeedItem['place']>) => {
    setDealCat('all');
    setTab('deals');
    setTimeout(() => {
      const el = place.dealId ? document.querySelector(`[data-deal-id="${CSS.escape(place.dealId)}"]`) : null;
      if (el) {
        el.scrollIntoView({ block: 'center' });
        el.classList.add('kp-flash');
        setTimeout(() => el.classList.remove('kp-flash'), 1600);
      }
    }, 150);
  };

  const handleShareLink = async (title: string, queryParam: string) => {
    const url = `${window.location.origin}${window.location.pathname}?${queryParam}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Kring · ${title}`, text: L('Explore Bangkok, make new friends'), url });
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        showToast(L("Link copied"));
        return;
      }
    } catch {
      // ignore
    }
    showToast(L("Link ready to share"));
  };

  const handleToggleHereNow = () => {
    if (!postHereNow && !locationGranted) {
      setSheet('locationprompt');
      return;
    }
    setPostHereNow((v) => !v);
  };

  const handleGrantLocationAreaOnly = () => {
    setLocationGranted(true);
    try {
      localStorage.setItem('kr8_loc_granted', '1');
    } catch {
      // ignore
    }
    setPostHereNow(true);
    setSheet('post');
    showToast(L("Area-only badge on · auto-turns off after 2 hours"));
  };

  const [reelPreviewPoster, setReelPreviewPoster] = useState('');
  const reelProblemText = (code: string): string => {
    // fix-it messages: Thai first, English under (members often forward these to a friend who helps)
    const both = (en: string) => (lang === 'th' && L(en) !== en ? `${L(en)}\n${en}` : L(en));
    switch (code) {
      case 'TOO_SHORT': return L('Reel is too short · 5–60 seconds');
      case 'TOO_LONG': return both('Clip is over 10 minutes · pick a shorter one');
      // trim (16 Nov): neither WebCodecs nor the re-record could cut the part on this phone; the long file is never uploaded
      case 'TRIM_FAIL': return both('This phone couldn’t cut this clip, so nothing was uploaded. Pick a clip of 60 s or less, or open Kring in Chrome or Safari.');
      case 'INTERRUPTED': return both('The screen closed while your Reel was being prepared, so nothing was uploaded. Tap Post again and keep this screen open.');
      case 'EMPTY': return both('This file is empty (0 KB). Save the clip to your phone first, then pick it again.');
      case 'HEVC': return both('This clip is HEVC (High efficiency video), which this browser can’t open. Fix: Camera settings → turn off “High efficiency video” and film again, or send the clip to yourself in LINE and pick that copy.');
      case 'NOT_VERTICAL': return L('Please use a vertical (9:16) video');
      // วิดีโอใหญ่ไป ลองตัดให้สั้นลง หรือถ่ายที่ 1080p (Video is too big; try trimming it shorter or filming at 1080p)
      case 'TOO_BIG': return both('Video is too big · try trimming it shorter or filming at 1080p');
      case 'NOT_VIDEO': return L('Pick a video file (MP4, MOV or WebM)');
      case 'UPLOAD': return L('Upload stopped · tap Retry');
      case 'REPICK': return both('Your phone lost the video file. Choose the video again, then tap Post.');
      // audit P3-12: a damaged file is not fixed by "save it to your phone first"
      default: return both('This browser can’t open this clip. The file may be damaged, or still only in the cloud. Try another clip, or send it to yourself in LINE and pick that copy.');
    }
  };
  const showReelPoster = (info: ReelInfo) => {
    // 16 Nov: a clip the phone's <video> cannot draw (4K / HEVC) showed a black preview; show the WebCodecs-decoded frame
    void import('./v5Reel').then((m) => m.previewPoster(info)).then((u) => { if (u) setReelPreviewPoster((old) => { if (old) URL.revokeObjectURL(old); return u; }); }).catch(() => undefined);
  };
  /** A checked clip: over 60 s goes to the trim step first (16 Nov), otherwise straight to compose (unchanged). */
  const acceptReel = (info: ReelInfo) => {
    if (info.needsTrim) {
      setReelTrim(info);
      v5LogClient('reel_trim', 'open', `${Math.round(info.durationMs / 1000)}s ${Math.round(info.file.size / 1e5) / 10}MB ${info.decodable === false ? 'nodecode' : ''} ${/; wv\)/.test(navigator.userAgent) ? 'inapp' : ''}`.trim());
      if (info.decodable === false) showReelPoster(info);
      return;
    }
    setReelInfo(info);
    showReelPoster(info);
  };
  const acceptReelRef = useRef(acceptReel);
  acceptReelRef.current = acceptReel;
  const chooseTrim = (w: { startMs: number; endMs: number }) => {
    if (!reelTrim) return;
    const info = applyTrim(reelTrim, w);
    v5LogClient('reel_trim', 'done', `${clock(w.startMs)}-${clock(w.endMs)} of ${clock(reelTrim.durationMs)}`);
    setReelTrim(null);
    setReelPreviewPoster((old) => { if (old) URL.revokeObjectURL(old); return ''; });
    setReelInfo(info);
    showReelPoster(info);
  };
  const leaveTrim = () => {
    v5LogClient('reel_trim', 'back');
    if (reelTrim) URL.revokeObjectURL(reelTrim.url);
    setReelTrim(null);
    setReelPreviewPoster((old) => { if (old) URL.revokeObjectURL(old); return ''; });
  };
  const pickReel = async (file: File | undefined) => {
    setReelProblem('');
    setReelStage('idle');
    reelWorkRef.current = {};
    if (reelInfo) URL.revokeObjectURL(reelInfo.url);
    setReelInfo(null);
    if (reelTrim) URL.revokeObjectURL(reelTrim.url);
    setReelTrim(null);
    setReelPreviewPoster((old) => { if (old) URL.revokeObjectURL(old); return ''; });
    if (!file) return;
    try {
      acceptReel(await checkReel(file));
    } catch (e) {
      setReelProblem(reelProblemText(e instanceof ReelError ? e.code : 'UNREADABLE'));
      v5LogClient('reel_pick_fail', e instanceof ReelError ? e.code : 'UNREADABLE', `${file.type || '?'} ${Math.round(file.size / 1e5) / 10}MB`);
    }
  };
  const publishReel = async (cap: string) => {
    if (!reelInfo) return;
    const reelArea = postArea || postPlaces[0]?.kr_area || (postPlaces.length ? 'Bangkok' : '');
    if (!reelArea) { showToast(L('Add the area pin first')); return; }   // area pin is required for Reels
    const ac = reelWorkRef.current.ready ? null : makeAudio();   // inside the tap: lets the phone capture the sound
    try {
      if (!reelWorkRef.current.ready) {
        setReelStage('preparing');
        setReelProgress(0);
        reelWorkRef.current.ready = await prepareReel(reelInfo, ac, setReelProgress);
      }
      setReelStage('uploading');
      setReelProgress(0);
      reelWorkRef.current.up = await uploadReel(reelWorkRef.current.ready, setReelProgress, reelWorkRef.current.up);
      setReelStage('saving');
      const r = postPlaces.length
        ? await kxCreateReel(reelWorkRef.current.up, reelWorkRef.current.ready, reelArea, cap, postHereNow, postPlaces.map((x) => x.id))
        : { ...(await createReel(reelWorkRef.current.up, reelWorkRef.current.ready, reelArea, cap, postHereNow)), rings: 0, places: 0 };
      if (postPeople.length) await kxTagPeople(r.id, postPeople.map((x) => x.user_id)).catch(() => undefined);
      setPostPeople([]);
      goLoadMine();
      if (postPlace) await v5SetReelPlace(r.id, postPlace).catch(() => undefined);
      setPostPlace('');
      if (postPlaces.length) rememberPlaces(postPlaces);
      setPostPlaces([]);
      URL.revokeObjectURL(reelInfo.url);
      setReelInfo(null);
      reelWorkRef.current = {};
      setReelStage('idle');
      setPostCaption('');
      setSheet(null);
      setTab('feed');
      triggerRingBurst();
      showToast(r.status === 'approved' ? L('Reel posted · กริ๊ง!') : L('Reel sent · it shows in the feed after a quick check'));
      a2hsFirstValue('reel');
      pushMoment('first_reel');   // 16 Nov dings: ask after the first Reel (small card, never the browser prompt by itself)
      v5Feed().then(setFeedItems).catch(() => undefined);
    } catch (e) {
      if (e instanceof ReelError && e.code === 'TRIM_FAIL') {
        // nothing was uploaded; back to "Pick a clip" with the Thai + English message (caption, place and tags are kept)
        v5LogClient('reel_trim', `fail:${e.why || 'none'}`, `${reelInfo.file.type || '?'} ${Math.round(reelInfo.file.size / 1e5) / 10}MB ${Math.round((reelInfo.fullMs || 0) / 1000)}s ${/; wv\)/.test(navigator.userAgent) ? 'inapp' : ''}`);
        URL.revokeObjectURL(reelInfo.url);
        setReelInfo(null);
        reelWorkRef.current = {};
        setReelStage('idle');
        setReelProblem(reelProblemText('TRIM_FAIL'));
        return;
      }
      setReelStage('failed');
      setReelProblem(e instanceof ReelError ? reelProblemText(e.code) : v5Msg(e));
      v5LogClient('reel_publish_fail', e instanceof ReelError ? `${e.code}${e.status !== undefined ? ':' + e.status : ''}` : ((e as { code?: string })?.code || (e as Error)?.message || 'UNKNOWN'),
        `${reelInfo.file.type || '?'} ${Math.round(reelInfo.file.size / 1e5) / 10}MB ${Math.round(reelInfo.durationMs / 1000)}s ${reelInfo.width}x${reelInfo.height} ${/; wv\)/.test(navigator.userAgent) ? 'inapp' : ''}`);
    } finally {
      void ac?.close().catch(() => undefined);
    }
  };

  // Signed in: saves made on this phone while signed out join the account once, then the account list wins.
  useEffect(() => {
    if (!live || !v5Uid || !v5Card) return;
    let dead = false;
    (async () => {
      try {
        const local = Object.keys(savedIds).filter((k) => savedIds[k] && /^[0-9a-f-]{36}$/.test(k));
        if (local.length) await v5MergeSaves(local.slice(0, 100));
        const ids = await v5MySaves();
        if (dead) return;
        const next: Record<string, boolean> = {};
        for (const k of Object.keys(savedIds)) if (savedIds[k] && !/^[0-9a-f-]{36}$/.test(k)) next[k] = true;   // demo / deal ids stay on the phone
        for (const id of ids || []) next[id] = true;
        storeSaved(next);
      } catch {
        // keep the phone list
      }
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, v5Uid, !!v5Card]);
  // Composer: live partner places a Kring Local can tag on a Reel
  useEffect(() => {
    if (!live || sheet !== 'post' || tagPlaces.length) return;
    v5TagPlaces().then((r) => setTagPlaces(r || [])).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, sheet]);

  // Deep link from a gift winner list: /app/?reel=<id> scrolls the feed to that Reel once it is loaded.
  const reelLinkRef = useRef<string | null>((() => { try { return new URLSearchParams(location.search).get('reel'); } catch { return null; } })());
  useEffect(() => {
    const id = reelLinkRef.current;
    if (!id || !feedItems.some((f) => f.id === id)) return;
    reelLinkRef.current = null;
    setTab('feed');
    requestAnimationFrame(() => document.querySelector(`[data-post-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' }));
  }, [feedItems]);

  // ── 16 Nov dings (push): Settings toggle, links from a tapped ding, daily re-sync of this phone ──
  const [pushSt, setPushSt] = useState<PushState>('off');
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => { if (sheet === 'settings' && pushConfigured()) void pushState().then(setPushSt).catch(() => undefined); }, [sheet]);
  const pushSubLine = (st: PushState): string =>
    st === 'on' ? 'On · this phone gets dings'
      : st === 'denied' ? 'Blocked in your browser settings'
        : st === 'ios-install' ? 'Add Kring to your home screen first'
          : st === 'inapp' ? 'Open Kring in your phone’s browser'
            : st === 'unsupported' ? 'This browser can’t show dings' : PUSH_ASK_LINE;
  const togglePush = async () => {
    if (pushBusy) return;
    if (pushSt === 'ios-install') { setSheet(null); openInstallSheet(); return; }
    if (pushSt === 'inapp') { setSheet(null); openEscape('dings'); return; }   // in-app browser: into the real browser first
    if (pushSt === 'unsupported') return;
    setPushBusy(true);
    try {
      if (pushSt === 'on') { await pushDisable(); setPushSt('off'); showToast(L('Dings off')); return; }
      const r = await pushEnable();   // a tap: the only other place the browser prompt can appear
      if (r === 'on') { setPushSt('on'); showToast(L('Dings on · กริ๊ง!')); }
      else if (r === 'denied') { setPushSt('denied'); showToast(L('Dings are blocked. Allow notifications for kringapp.com in your browser settings.')); }
      else showToast(L('Could not turn on dings. Try again in Settings.'));
    } finally { setPushBusy(false); }
  };
  const openPushLink = (link: PushLink | null) => {
    if (!link) return;
    if (link.reel) { reelLinkRef.current = link.reel; setSheet(null); setTab('feed'); v5Feed().then(setFeedItems).catch(() => undefined); return; }
    if (link.tab) setTab(link.tab);
    if (link.rewards && live) { setKxReady(false); setSheet('rewards'); void kxLoadRewards(); }
  };
  // a ding tapped while Kring is open: the service worker focuses this window and sends the link (no reload)
  const openPushLinkRef = useRef(openPushLink);
  openPushLinkRef.current = openPushLink;
  useEffect(() => {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!sw) return;
    const on = (e: MessageEvent) => { const d = e.data as { type?: string; url?: string } | null; if (d?.type === 'kr8-push-open' && d.url) openPushLinkRef.current(parsePushLink(d.url)); };
    sw.addEventListener('message', on);
    return () => sw.removeEventListener('message', on);
  }, []);
  // a ding tapped while Kring was closed opens /app/?tab=me&open=rewards: the rewards page once the member is signed in
  const pushOpenRef = useRef<boolean>((() => { try { return new URLSearchParams(location.search).get('open') === 'rewards'; } catch { return false; } })());
  useEffect(() => {
    if (!pushOpenRef.current || !live || !signedIn || !v5Uid) return;
    pushOpenRef.current = false;
    openPushLink({ rewards: true });
  }, [live, signedIn, v5Uid]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (live && signedIn && v5Uid) void pushResync(v5Uid).catch(() => undefined); }, [live, signedIn, v5Uid]);
  // came here from an in-app browser after tapping Turn on dings (?dings=1): ask again here, one tap
  useEffect(() => {
    try {
      const u = new URL(location.href);
      if (u.searchParams.get('dings') !== '1') return;
      u.searchParams.delete('dings');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      pushMoment('escaped');
    } catch { /* ignore */ }
  }, []);

  // "+" (15 Nov): live, it goes straight to the Reel compose screen ("Ask a Thai" is gone, so there is nothing to choose)
  const openCreate = () => {
    if (!live) { setSheet('choose'); return; }
    setPostPhotoUrl('');
    setPostCaption('');
    setSheet('post');
    v5LogClient('reel_open', 'feed');
  };
  const handlePublishPost = () => {
    if (live) {
      if (!signedIn) void saveSignInDraft({ kind: 'reel', caption: postCaption, places: postPlaces, area: postArea, here: postHereNow }, reelInfo?.file);   // N
      requireSignInForAction(() =>
        void v5Once('post', async () => {
          const cap = postCaption.trim();
          if (reelInfo) {
            await publishReel(cap);
            return;
          }
          // Reels-only (founder 9 Nov): without a Reel only an event "I'm going" plan can still be posted as text
          if (!postEventId) {
            showToast(L('Add a Reel first'));
            return;
          }
          const kind = postPhotoUrl ? 'photo' : 'plan';
          if (kind === 'plan' && !cap) {
            showToast(L('Write your plan first'));
            return;
          }
          try {
            const photo = postPhotoUrl ? await v5CompressImage(postPhotoUrl, 1080, 380000) : null;
            await v5CreatePost({ kind, area: postArea, body: cap, photo, eventId: postEventId || null, here: postHereNow });
          } catch (e) {
            showToast(v5Msg(e));
            return;
          }
          setPostCaption('');
          setPostPhotoUrl('');
          setPostEventId('');
          setSheet(null);
          setTab('feed');
          triggerRingBurst();
          showToast(L('Posted to Bangkok Feed · กริ๊ง!'));
          v5Feed().then(setFeedItems).catch(() => undefined);
        })
      );
      return;
    }
    requireSignInForAction(() => {
      if (!postPhotoUrl) {
        showToast(L("Add a photo first"));
        return;
      }
      const cap = postCaption.trim();
      const areaName = postArea || 'Bangkok';
      if (postKind === 'story') {
        const newSlide: V8StorySlide = {
          img: postPhotoUrl,
          who: `${user.name} · ${user.langs}`,
          av: user.avatar,
          cap,
          time: 'Just now · expires midnight',
          expiresAtMidnight: true,
        };
        setStories((prev) => ({
          ...prev,
          [areaName]: [newSlide, ...(prev[areaName] || [])],
        }));
        setSeenStoryAreas((prev) => ({ ...prev, [areaName]: false }));
      } else {
        const newPost: V8FeedItem = {
          id: `post-${Date.now()}`,
          type: 'photo',
          img: postPhotoUrl,
          av: user.avatar,
          name: user.name,
          langs: user.langs,
          area: postArea || undefined,
          here: postHereNow,
          hereExpiresAt: postHereNow ? Date.now() + 2 * 60 * 60 * 1000 : undefined,
          cap,
          hiCount: 0,
        };
        setFeedItems((prev) => [newPost, ...prev]);
      }

      const nextPostsCount = user.postsCount + 1;
      const nextLevel: V8UserAccount['level'] =
        nextPostsCount >= 6 ? 'pandan' : nextPostsCount >= 3 ? 'tea' : 'anchan';
      const updatedUser = { ...user, postsCount: nextPostsCount, level: nextLevel };
      setUser(updatedUser);
      try {
        localStorage.setItem('kr8_user', JSON.stringify(updatedUser));
      } catch {
        // ignore
      }

      setPostCaption('');
      setPostPhotoUrl('');
      setSheet(null);
      setTab('feed');
      triggerRingBurst();
      showToast(
        postKind === 'story'
          ? `Story added to ${areaName} · expires at midnight`
          : 'Posted to Bangkok Feed · กริ๊ง!'
      );
    });
  };


  const handleReviewDecision = (replyNow: boolean) => {
    if (live) {
      const req = requests[reviewIdx];
      if (!req) {
        setSheet('inbox');
        return;
      }
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      setReviewIdx(0);
      if (replyNow) {
        activeThreadIdRef.current = req.id;
        setActiveThreadId(req.id);
        setThreads((prev) =>
          prev.some((t) => t.id === req.id)
            ? prev
            : [({ id: req.id, personId: '', name: req.name, avatar: req.img, langs: '', verified: req.verified, lastPreview: req.msg, timeLabel: 'Now',
                unread: false, messages: [{ id: 'hello', sender: 'them', text: req.msg, createdAt: '' }], v5Status: 'pending', v5OpenedByMe: false } as V5Thread), ...prev]
        );
        setSheet('thread');
        v5RefreshInbox();
      } else if (requests.length <= 1) {
        setSheet('inbox');
      }
      return;
    }
    const currentReq = requests[reviewIdx];
    if (!currentReq) {
      setSheet('inbox');
      return;
    }
    const remaining = requests.filter((_, i) => i !== reviewIdx);
    setRequests(remaining);
    setReviewIdx(0);

    if (replyNow) {
      const newThreadId = `thread-${currentReq.id}`;
      const newThread: V8ChatThread = {
        id: newThreadId,
        personId: currentReq.id,
        name: currentReq.name,
        avatar: currentReq.img,
        langs: currentReq.meta.replace(/^.*Speaks\s*/i, '') || 'TH · EN',
        verified: currentReq.verified,
        lastPreview: currentReq.msg,
        timeLabel: 'Now',
        unread: false,
        messages: [
          {
            id: `m-${Date.now()}`,
            sender: 'them',
            text: currentReq.msg,
            translation: hasThaiScript(currentReq.msg)
              ? translateThaiLineToEnglish(currentReq.msg)
              : undefined,
            createdAt: 'Just now',
          },
        ],
      };
      setThreads((prev) => [newThread, ...prev]);
      setActiveThreadId(newThreadId);
      triggerRingBurst();
      setSheet('thread');
    } else {
      if (remaining.length === 0) {
        setSheet('inbox');
      }
    }
  };

  const handleSendChatMessage = (customText?: string) => {
    if (live) {
      const th = activeThread as V5Thread | null;
      const txt = (customText ?? chatInput).trim();
      if (!th || !txt) return;
      if (th.v5Status === 'pending' && th.v5OpenedByMe && !th.messages.some((m) => m.sender === 'them')) {
        showToast(v5Msg('ONE_MESSAGE_RULE', th.name));
        return;
      }
      void v5Once('msg', async () => {
        const tmpId = `tmp-${Date.now()}`;
        setThreads((prev) => prev.map((t) => (t.id === th.id ? { ...t, lastPreview: txt, timeLabel: 'Now', messages: [...t.messages, { id: tmpId, sender: 'me', text: txt, createdAt: 'Now' }] } : t)));
        if (!customText) setChatInput('');
        try {
          await v5SendMessage(th.id, txt);
        } catch (e) {
          setThreads((prev) => prev.map((t) => (t.id === th.id ? { ...t, messages: t.messages.filter((m) => m.id !== tmpId) } : t)));
          if (!customText) setChatInput(txt);
          const code = v5ErrCode(e);
          showToast(code === 'NETWORK' || code === 'UNKNOWN' ? L('Message not sent. Tap send to try again.') : v5Msg(e, th.name));
          return;
        }
        await v5LoadMessages(th.id);
        v5RefreshInbox();
      });
      return;
    }
    const txt = (customText ?? chatInput).trim();
    if (!txt) return;
    setThreads((prev) =>
      prev.map((th) =>
        th.id === activeThreadId
          ? {
              ...th,
              lastPreview: txt,
              timeLabel: 'Now',
              messages: [
                ...th.messages,
                {
                  id: `msg-${Date.now()}`,
                  sender: 'me',
                  text: txt,
                  translation: hasThaiScript(txt)
                    ? translateThaiLineToEnglish(txt)
                    : undefined,
                  createdAt: 'Now',
                },
              ],
            }
          : th
      )
    );
    if (!customText) setChatInput('');
  };

  const handleBlockTarget = (targetIdOrName: string) => {
    if (live) {
      if (!/^[0-9a-f-]{36}$/i.test(targetIdOrName || '')) {
        showToast(qx('pickFirst'));
        return;
      }
      void v5Once('block', async () => {
        try {
          await v5Block(targetIdOrName);
        } catch (e) {
          showToast(v5Msg(e));
          return;
        }
        setBlockedIds((prev) => Array.from(new Set([...prev, targetIdOrName])));
        setThreads((prev) => prev.filter((th) => th.personId !== targetIdOrName));
        setPeople((prev) => prev.filter((p) => p.id !== targetIdOrName));
        setSheet(null);
        showToast(qx('blockedToast'));
        v5RefreshInbox();
        v5Feed().then(setFeedItems).catch(() => undefined);
      });
      return;
    }
    if (!targetIdOrName || targetIdOrName === 'user') {
      showToast(qx('pickFirst'));
      return;
    }
    const next = Array.from(new Set([...blockedIds, targetIdOrName]));
    setBlockedIds(next);
    try {
      localStorage.setItem('kr8_blocked', JSON.stringify(next));
    } catch {
      // ignore
    }
    setThreads((prev) =>
      prev.filter((th) => th.personId !== targetIdOrName && th.name !== targetIdOrName)
    );
    setRequests((prev) =>
      prev.filter((r) => r.id !== targetIdOrName && r.name !== targetIdOrName)
    );
    setSheet(null);
    showToast(qx('blockedToast'));
  };

  const handleDownloadPdpaJson = () => {
    if (live) {
      void v5Once('export', async () => {
        try {
          v5Download(await v5Export(), 'kring-pdpa-data.json');
          showToast(L('Your PDPA data JSON has been downloaded'));
        } catch (e) {
          showToast(v5Msg(e));
        }
      });
      return;
    }
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      pdpaController: 'Kring Bangkok',
      profile: user,
      savedIds,
      claimedDeals,
      sentHelloRecipients,
    };
    try {
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kring-pdpa-data-${user.name.toLowerCase()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(L("Your PDPA data JSON has been downloaded"));
    } catch {
      showToast(L("Data export prepared"));
    }
  };

  const handleDeleteAccount = () => {
    if (live) {
      void v5Once('delete', async () => {
        let kept = false;
        try {
          kept = (await v5DeleteMe()).keptSignIn;
        } catch {
          showToast(L('Couldn’t delete right now. Try again.'));
          return;
        }
        v5LastUid.current = '';
        await v5ApplySession(null);
        setClaimedDeals({});
        setSavedIds({});
        setSentHelloRecipients({});
        setBlockedIds([]);
        setConfirmDelete(false);
        setSheet(null);
        showToast(kept ? L('Your card was deleted. Your admin sign-in is kept.') : L('Your Kring account and data were deleted.'));
      });
      return;
    }
    try {
      localStorage.removeItem('kr8_signed_in');
      localStorage.removeItem('kr8_user');
      localStorage.removeItem('kr8_saved');
      localStorage.removeItem('kr8_claimed_deals');
      localStorage.removeItem('kr8_sent_hellos');
    } catch {
      // ignore
    }
    setSignedIn(false);
    setClaimedDeals({});
    setSavedIds({});
    setSentHelloRecipients({});
    try {
      localStorage.removeItem('kr8_blocked');
      localStorage.removeItem('kr8_reports');
    } catch {
      // ignore
    }
    setConfirmDelete(false);
    setSheet(null);
    showToast(qx('deletedToast'));
  };

  const activeThread = useMemo(
    () => threads.find((th) => th.id === activeThreadId) || threads[0] || null,
    [threads, activeThreadId]
  );
  // automatic chat translation (free on the device where the browser can; the server for everyone else)
  const chatTr = useChatTranslate(live && sheet === 'thread', activeThread?.id ?? null, activeThread?.messages ?? [], lang);
  const [trOrig, setTrOrig] = useState<Record<string, boolean>>({});      // messages the member tapped to see the original

  const activeRedeemDeal = useMemo(
    () => deals.find((d) => d.id === activeRedeemDealId) || deals[0] || null,
    [deals, activeRedeemDealId]
  );

  const currentStorySlides = stories[activeStoryArea] || [];
  const currentStorySlide =
    currentStorySlides[activeStoryIndex] || currentStorySlides[0] || null;

  const hasUnreadChat = requests.length > 0 || threads.some((th) => th.unread);

  /** Tonight in Bangkok public events with “Who’s going? กริ๊ง!” — shown on the empty feed and as the first card of a busy feed. */
  /** Locked 6 Nov feed: full-screen swipe photos. Quiet-day fillers = public events as full-screen photos, full-screen pink Ask a Thai, first-post invite. */
  const renderFillerSlides = () => (
    <>
      {v8LiveEvents(selectedArea).map((ev: V8PublicEvent) => {
        const tagText = ev.tagByLang[lang] || ev.tag;
        const nameText = ev.nameByLang[lang] || ev.name;
        const whenWhereText = ev.whenWhereByLang[lang] || ev.whenWhere;
        return (
          <div className="slide kp-ev-slide" key={`ev-${ev.id}`}>
            <div
              className="kp-ev-bg"
              style={{ backgroundImage: ev.bgImage ? `url('${ev.bgImage}')` : ev.bgGradient }}
            />
            <div className="kp-shade" />
            <span className="kp-live">{tagText}</span>
            <div className="kp-meta">
              <b>{nameText}</b>
              <span>{whenWhereText} · {L('Public event')}</span>
            </div>
            <div className="kp-side">
              <button
                type="button"
                className="kp-sb ring v9-ev-btn"
                aria-label={L('Who’s going? กริ๊ง!')}
                onClick={() => requireSignInForAction(() => {
                  setPostPhotoUrl('');
                  setPostArea(ev.area);
                  setPostEventId(ev.id);
                  setPostCaption(Lf('I’m going to {0}', nameText));
                  setSheet('post');
                })}
              >
                <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
                  {L('Who’s going? กริ๊ง!')}
                </span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
              </button>
              <span className="kp-lbl">{L('I’m going')}</span>
            </div>
          </div>
        );
      })}
      <div className="slide kp-first-slide">
        <div className="kp-ask-in">
          <div className="kp-ask-k" style={{ color: '#6EE7A8' }}>{L('YOUR PHOTO HERE')}</div>
          <div className="kp-ask-q" style={{ color: '#FFF7EC' }}>
            {Lf('Be the first in {0} today', selectedArea === 'All Bangkok' ? L('Bangkok') : L(selectedArea))}
          </div>
          <button
            type="button"
            className="kp-ask-btn"
            style={{ background: '#FF4FA3', color: '#fff' }}
            onClick={() => {
              setPostPhotoUrl('');
              setPostCaption('');
              // audit P2-2: a Reel takes its area from the pinned place (was always saved as "Ari" from All Bangkok)
              setPostArea(live ? null : selectedArea === 'All Bangkok' ? 'Ari' : selectedArea);
              setSheet('post');
            }}
          >
            {live ? L('Post a Reel') : L('Post a photo')}
          </button>
        </div>
      </div>
    </>
  );

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const renderQrCells = (seedMul = 7) =>
    Array.from({ length: 121 }, (_, idx) => {
      const x = idx % 11;
      const y = Math.floor(idx / 11);
      const isFinder = (x < 3 && y < 3) || (x > 7 && y < 3) || (x < 3 && y > 7);
      const isWhite = isFinder
        ? (x === 1 && y === 1) || (x === 9 && y === 1) || (x === 1 && y === 9)
        : (x * seedMul + y * 13 + x * y) % 3 === 0;
      return <i key={idx} className={isWhite ? 'w' : ''} />;
    });

  return (
    <div
      className={`v8-app-root ${calmMode ? 'calm' : ''}`}
      data-demo={isDemo ? '1' : undefined}
      data-testid="kring-v8-root"
    >
      {/* Official #kr dual-ring SVG symbol from kringapp.com */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <linearGradient id="lensG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6874FB" />
            <stop offset=".38" stopColor="#3946E3" />
            <stop offset=".52" stopColor="#FBE4A8" />
            <stop offset=".6" stopColor="#C47FB8" />
            <stop offset=".78" stopColor="#A14FBF" />
            <stop offset="1" stopColor="#CE4BB1" />
          </linearGradient>
          <linearGradient id="coreG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity=".15" />
            <stop offset=".32" stopColor="#F9F1D9" />
            <stop offset=".6" stopColor="#FBE4A8" />
            <stop offset="1" stopColor="#FBE4A8" stopOpacity="0" />
          </linearGradient>
          <clipPath id="cA">
            <circle cx="392" cy="512" r="226" />
          </clipPath>
          <clipPath id="cAi">
            <circle cx="392" cy="512" r="150" />
          </clipPath>
          <symbol id="kr" viewBox="0 0 1024 1024">
            <g className="gB">
              <circle className="ring-b" cx="392" cy="512" r="225" fill="none" stroke="#3440E0" strokeWidth="60" />
            </g>
            <g className="gP">
              <circle className="ring-p" cx="632" cy="512" r="225" fill="none" stroke="#FF4FA3" strokeWidth="60" />
            </g>
            <g className="lens">
              <g clipPath="url(#cA)">
                <circle cx="632" cy="512" r="226" fill="url(#lensG)" />
              </g>
              <g clipPath="url(#cAi)">
                <circle cx="632" cy="512" r="150" fill="url(#coreG)" />
              </g>
              <g clipPath="url(#cA)">
                <circle cx="632" cy="512" r="225" fill="none" stroke="#FF4FA3" strokeWidth="60" />
              </g>
            </g>
          </symbol>
        </defs>
      </svg>
      <div className="v8-shell" id="phone">
        {/* Offline Banner with Retry */}
        {!isOnline && (
          <div
            role="status"
            style={{
              position: 'absolute',
              top: 12,
              left: 14,
              right: 14,
              zIndex: 85,
              background: 'rgba(23,21,32,0.96)',
              border: '1px solid rgba(255,196,77,0.55)',
              borderRadius: 14,
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              fontSize: 11,
              color: '#FFF7EC',
            }}
          >
            <span>
              {t.offlineBanner}
              {offlineQueueCount > 0 ? ` (${offlineQueueCount})` : ''}
            </span>
            <button
              type="button"
              onClick={() => {
                fetchBangkokWeather().then(setWeather);
                loadLiveData();
              }}
              style={{
                padding: '5px 10px',
                borderRadius: 999,
                border: 0,
                background: '#FFC44D',
                color: '#0B0A12',
                fontWeight: 800,
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {t.retry}
            </button>
          </div>
        )}

        {/* Chat Bubble Top-Right on Feed & People ONLY (HIDDEN on Deals & Me, and on a profile so its ⋯ Report/Block stays tappable) */}
        {(tab === 'feed' || tab === 'people') && !(sheet && ['place', 'rewards', 'claim', 'claimed', 'ranking', 'result', 'savedreels', 'profile'].includes(sheet)) && (
          <button
            type="button"
            className={`chat-fab${tab === 'feed' && feedMode === 'ask' ? ' at-solid' : ''}`}
            id="chatFab"
            aria-label="Messages"
            onClick={() => setSheet('inbox')}
          >
            <svg viewBox="0 0 24 24">
              <path d="M21 12a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-2.9-.4-4.1-1.1L3 21l1.6-5.2A8.4 8.4 0 0 1 3.5 12 8.5 8.5 0 0 1 12 3.5 8.5 8.5 0 0 1 21 12Z" />
            </svg>
            {hasUnreadChat && <span className="badge" id="chatBadge" />}
          </button>
        )}

        {/* ==================== 1. FEED SCREEN ==================== */}
        <section
          className={`v8-screen ${tab === 'feed' ? 'active' : ''} at-has-sw${feedMode === 'ask' ? ' at-on' : ''}`}
          id="s-feed"
          aria-label="Feed"
        >
          {newPillVisible && newRowsCount > 0 && feedItems.length > 0 && (
            <button
              type="button"
              className="newpill on"
              id="newpill"
              onClick={() => {
                setNewPillVisible(false);
                setNewRowsCount(0);
                if (feedScrollRef.current) {
                  feedScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
            >
              <span className="dot" />
              {newRowsCount} new since you left · tap to jump
            </button>
          )}

          {/* Top Bar: Area Chips (never show · 0; mint live dot only when area has posts).
              15 Nov (founder): hidden from the feed for now, the video stays clean; posting lives on Me. One flag brings it back. */}
          {(FEED_TOP_BAR || !live) && <div className="feed-top">
            <button
              type="button"
              className="kp-plus glass"
              aria-label="Create post"
              onClick={openCreate}
            >
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            {(
              [
                'Ari',
                'Siam',
                'Thonglor',
                'Talad Noi',
                'Yaowarat',
              ] as const
            ).map((area) => {
              const areaCount =
                feedItems.filter((f) => f.area === area).length +
                ((stories[area] && stories[area].length) || 0);
              const hasAreaPosts = areaCount > 0;
              const isSelected = selectedArea === area;
              return (
                <button
                  type="button"
                  key={area}
                  className={`spill kp-area ${hasAreaPosts && !seenStoryAreas[area] ? 'new' : ''} ${isSelected ? 'on' : ''}`}
                  onClick={() => {
                    if (isSelected) { setSelectedArea('All Bangkok'); return; }
                    setSelectedArea(area);
                    if (
                      stories[area] &&
                      stories[area].length > 0
                    ) {
                      setActiveStoryArea(area);
                      setActiveStoryIndex(0);
                      setSeenStoryAreas((prev) => ({ ...prev, [area]: true }));
                      setSheet('story');
                    }
                  }}
                >
                  {L(area)}{hasAreaPosts ? ` · ${areaCount}` : ''}
                </button>
              );
            })}
          </div>}
          {Number.isFinite(weather.tempC) && (
            <button type="button" className="spill kp-wx glass" onClick={() => setSheet('weather')}>
              {weather.conditionIcon} {weather.tempC}°
            </button>
          )}
          <AskSwitch L={L} mode={feedMode} onMode={pickFeedMode} dot={!askSeen} />
          {feedMode === 'ask' && (
            <AskThaiView L={L} api={askApi} me={askMeRef.current} areas={V5_AREAS} areaLabel={(a) => kxArea(lang, a, L)}
              defaultArea={(live && v5Card?.area) || 'Bangkok'} need={requireSignInForAction} toast={showToast} />
          )}
          {PRIZE_TICKER_ON_FEED && feedMode !== 'ask' && live && signedIn && v5Card && v5Uid && kxWeek ? (
            <PrizeBanner variant="ticker" uid={v5Uid} week={kxWeek} hideTick={prizeHideTick} onHide={() => setPrizeHideTick((n) => n + 1)}
              onOpen={() => { setTab('me'); setSheet('ranking'); }} />
          ) : null}

          {/* Vertical Snap Feed or Redesigned V9 Feed Hub */}
          {feedItems.length === 0 ? (
            <div className="feed-scroll" id="feedScroll" ref={feedScrollRef}>
              {live && !feedSettled ? (
                // 16 Nov perf 2: while the feed is on its way, keep the first Reel's poster the loading screen already showed
                <div className="slide kr-slide-wait" aria-busy="true">
                  {boot0Poster && <div className="bg" style={{ backgroundImage: `url('${boot0Poster}')` }} />}
                </div>
              ) : renderFillerSlides()}
            </div>
          ) : (
            <div className="feed-scroll" id="feedScroll" ref={feedScrollRef}>
              {(selectedArea === 'All Bangkok'
                ? feedItems
                : feedItems.filter((item) => !item.area || item.area === selectedArea)
              ).filter((item) => item.type !== 'ask').map((p, idx) => {
                if (p.type === 'deal') {
                  return (
                    <div className="slide deal-slide" key={p.id || idx}>
                      <div className="deal-card-f">
                        <div
                          className="hero"
                          style={{ backgroundImage: `url('${p.img}')` }}
                        >
                          <span className="badge-t">{t.todaysTreat}</span>
                        </div>
                        <div className="body">
                          <div className="venue">{p.venue}</div>
                          <h3>{p.title}</h3>
                          <div className="row">
                            <div>
                              <div className="price">
                                <b>฿{p.now}</b>
                                <s>฿{p.was}</s>
                              </div>
                              <span className="sub">
                                {formatTravellerCurrency(p.now || 140, dispCur)} ·{' '}
                                {isDemo ? L('Example') : `${p.claimed} claimed today`}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const found =
                                  deals.find((d) => d.id === p.dealId) || deals[0];
                                if (found) handleClaimDeal(found);
                              }}
                            >
                              {p.dealId && claimedDeals[p.dealId]
                                ? t.showCode
                                : L('Claim · 2 taps')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                const isSaved = Boolean(p.id && savedIds[p.id]);
                return (
                  <div className={`slide${p.video ? ' has-reel' : ''}`} key={p.id || idx} data-post-id={p.id} onClick={p.video ? (e) => handleReelTap(e, p) : undefined}>
                    {p.video ? (
                      <V5ReelVideo src={p.video} poster={p.poster} first={idx === 0} label={`Reel · ${p.name || ''} · ${p.area || ''}`} soundHint={L('Tap for sound')}
                        pending={p.reelPending ? L('Waiting for a quick check · only you see this') : undefined}
                        onViewed={live && p.id && !p.reelPending && !(p as V5FeedItem).mine ? () => void v5LogView(p.id as string) : undefined} />
                    ) : (
                    <div
                      className="bg"
                      style={{ backgroundImage: `url('${p.img}')` }}
                    />
                    )}
                    <div className="scrim" />
                    {p.video && heartBurst?.id === p.id && (
                      <span key={heartBurst.n} className="reel-heart-burst" aria-hidden="true">♥</span>
                    )}
                    <div className="rails">
                      {p.video && !p.reelPending && (
                        <button
                          type="button"
                          className={`rail like${p.liked ? ' on' : ''}`}
                          data-act="like"
                          aria-label={L('Like')}
                          aria-pressed={!!p.liked}
                          onClick={() => handleLikeReel(p)}
                        >
                          <svg viewBox="0 0 24 24">
                            <path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.7 3.1 5 6.7 5c2.1 0 3.6 1.1 4.3 2.4h2C13.7 6.1 15.2 5 17.3 5c3.6 0 5.5 3.7 4.2 6.8C19.5 16.4 12 21 12 21z" />
                          </svg>
                          <span className="lbl">{p.likes ? p.likes : L('Like')}</span>
                        </button>
                      )}
                      {!(p.video && (p as V5FeedItem).mine) && (
                      <button
                        type="button"
                        className="rail hi"
                        aria-label={t.sayHi}
                        onClick={() =>
                          openSayHi(
                            p.name || 'Member',
                            p.av || initialAvatar(p.name),
                            `${Lf('Replying to {0} post', kxArea(lang, p.area || 'Bangkok', L))} · ${Lf('Speaks {0}', langWords(p.langs || 'TH · EN'))}`,
                (p as { authorId?: string }).authorId,
                Boolean(p.video)
              )
                        }
                      >
                        <svg viewBox="0 0 24 24">{/* S: waving hand (the bell read as notifications) */}
                          <path d="M7.5 12.5V6.8a1.4 1.4 0 0 1 2.8 0v4.7M10.3 11V4.9a1.4 1.4 0 0 1 2.8 0V11M13.1 11V5.8a1.4 1.4 0 0 1 2.8 0v6.4M15.9 10.6V8.6a1.4 1.4 0 0 1 2.8 0v5.2c0 4.1-2.7 7.2-6.5 7.2-2.6 0-4.1-1.1-5.6-3.3l-2.3-3.6a1.45 1.45 0 0 1 2.3-1.75l1 1.25M3.2 6.2c.4-1.4 1.3-2.6 2.6-3.3M19.6 3.3c1.2.7 2 1.8 2.3 3.1" />
                        </svg>
                        <span className="lbl">{t.sayHi}</span>
                      </button>
                      )}
                      <button
                        type="button"
                        className="rail"
                        data-act="save"
                        aria-label={t.save}
                        onClick={() => handleToggleSave(p.id)}
                        style={
                          isSaved
                            ? {
                                borderColor: 'rgba(110,231,168,0.75)',
                                color: '#6EE7A8',
                              }
                            : undefined
                        }
                      >
                        <svg viewBox="0 0 24 24">
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                        </svg>
                        <span className="lbl">{isSaved ? t.saved : t.save}</span>
                      </button>
                      {p.video && !p.reelPending && (
                        <button type="button" className="rail" data-act="share" aria-label={L('Share')} onClick={() => openReelSheet(p, 'reelshare')}>
                          <svg viewBox="0 0 24 24">
                            <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v14" />
                          </svg>
                          <span className="lbl">{L('Share')}</span>
                        </button>
                      )}
                      {p.video && !(p as V5FeedItem).mine && (
                        <button type="button" className="rail more" data-act="more" aria-label={L('More')} onClick={() => openReelSheet(p, 'reelmore')}>
                          <svg viewBox="0 0 24 24">
                            <circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className={`meta${p.video ? ' reel-meta' : ''}`}>
                      <div className="who">
                        {live && (p as V5FeedItem).authorId ? (
                          <button type="button" className="av-btn" data-act="author-av" aria-label={p.name || ''} onClick={() => void openProfile((p as V5FeedItem).authorId)}><img className="av" src={p.av} alt="" loading="lazy" decoding="async" /></button>
                        ) : <img className="av" src={p.av} alt={p.name || ''} loading="lazy" decoding="async" />}
                        <div>
                          <div className="nm">
                            {live && (p as V5FeedItem).authorId ? (
                              <button type="button" className="reel-author" data-act="author" onClick={() => void openProfile((p as V5FeedItem).authorId)}
                                style={{ background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}>{p.name}</button>
                            ) : p.name}{' '}
                            {(p as { verified?: boolean }).verified === true && (
                            <button
                              type="button"
                              className="v"
                              onClick={() => setSheet('verified')}
                              style={{
                                background: 'none',
                                border: 0,
                                padding: 0,
                                cursor: 'pointer',
                              }}
                            >
                              ✓{p.video ? '' : ` ${t.verifiedLabel}`}
                            </button>
                            )}
                          </div>
                          {/* S (15 Nov): handles + languages left the Reel overlay (they are on the profile, one tap on the name) */}
                          {!p.video ? <div className="langs">{p.langs}</div> : null}
                        </div>
                        {!p.video && p.area && <span className="atag">{p.area}</span>}
                        {p.here && <span className="here">{t.hereNow}</span>}
                        {p.bestOfWeek && (
                          <span className="atag">{L("★ Best of week")}</span>
                        )}
                      </div>
                      {p.video ? (() => {
                        // S: ONE small pin "📍 place · area"; no place → the area only
                        const kp = kxFeedX[p.id]?.places?.[0];
                        if (kp) return (
                          <button type="button" className="reel-pin" data-act="place" data-place-chip={kp.id} onClick={(e) => { e.stopPropagation(); kxOpenPlace(kp.id, { name_en: kp.name_en, name_th: kp.name_th, area: kp.area }, true); }}>
                            {/* polish #12: one language per pin (Thai UI: Thai name · Thai area; a place with no Thai name stays all English) */}
                            <span aria-hidden="true">📍</span><b>{lang === 'th' && kp.name_th ? kp.name_th : kp.name_en}</b>{kp.area ? <span> · {lang === 'th' && !kp.name_th ? kp.area : kxArea(lang, kp.area, L)}</span> : null}
                          </button>
                        );
                        if (p.place) return (
                          <button type="button" className="reel-pin" data-act="place" aria-label={`${p.place.name} · ${L('See place')}`} onClick={(e) => { e.stopPropagation(); openReelPlace(p.place!); }}>
                            <span aria-hidden="true">📍</span><b>{lang === 'th' && p.place.nameTh ? p.place.nameTh : p.place.name}</b>{p.area ? <span> · {lang === 'th' && !p.place.nameTh ? p.area : kxArea(lang, p.area, L)}</span> : null}
                          </button>
                        );
                        return p.area ? <span className="reel-pin area" data-act="area"><span aria-hidden="true">📍</span><b>{kxArea(lang, p.area, L)}</b></span> : null;
                      })() : null}
                      {p.video ? <ReelCaption text={p.cap || ''} L={L} /> : <div className="cap">{p.cap}</div>}
                      {p.video && goPeople[p.id]?.length ? (
                        <p className="go-with" data-act="with">{L('with')}{goPeople[p.id].map((x) => <button type="button" key={x.user_id} onClick={() => void openProfile(x.user_id)}>@{x.first_name}</button>)}</p>
                      ) : null}
                      {p.video && (p as V5FeedItem).mine && typeof p.views === 'number' && (
                        <div className="reel-views">👁 {Lf('{0} views · only you see this', String(p.views))}</div>
                      )}
                    </div>
                  </div>
                );
              })}
              {renderFillerSlides()}
            </div>
          )}

        </section>

        {/* ==================== 2. PEOPLE SCREEN ==================== */}
        <section
          className={`v8-screen ${tab === 'people' ? 'active' : ''}`}
          id="s-people"
          aria-label="People"
        >
          <div className="ppl-head">
            {live ? (
            <div className="go-tabh" style={{ padding: 0 }}>
              <h1 className="ppl-title" id="goPeopleTitle">{L('People')}</h1>
              <div className="go-fch" id="goPeopleChips">
                {([['', L('Everyone')], ['local', L('Kring Locals')], ['traveller', L('Travellers')]] as const).map(([k, label]) => (
                  <button type="button" key={k || 'all'} data-who={k || 'all'} className={filterWho === k ? 'on' : ''} aria-pressed={filterWho === k} onClick={() => setFilterWho(k)}>{label}</button>
                ))}
              </div>
            </div>
            ) : (
              <>
            <h2 className="ppl-title">{L('New friends in Bangkok')}</h2>
            <p className="ppl-sub">{L('People into the same things')}</p>
              </>
            )}
            <div className="search-row">
              <div className="sbox">
                <svg viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  id="pplSearch"
                  aria-label={t.searchPlaceholder}
                  placeholder={t.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{
                      background: 'none',
                      border: 0,
                      color: 'rgba(255,247,236,0.6)',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="button"
                className="fbtn"
                id="fbtn"
                onClick={() => setSheet('filter')}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M4 6h16M7 12h10M10 18h4" />
                </svg>
                {t.filter}
              </button>
            </div>

            {(filterLang || filterWho || filterOnline) && (
              <div className="active-chips" id="activeChips">
                {filterLang && (
                  <button
                    type="button"
                    className="achip"
                    onClick={() => setFilterLang('')}
                  >
                    {Lf('Speaks {0}', LANG_CHIP[filterLang] || filterLang)} <span>✕</span>
                  </button>
                )}
                {filterWho && (
                  <button
                    type="button"
                    className="achip"
                    onClick={() => setFilterWho('')}
                  >
                    {filterWho === 'local' ? L('Thai locals') : L('Travellers')}{' '}
                    <span>✕</span>
                  </button>
                )}
                {filterOnline && (
                  <button
                    type="button"
                    className="achip"
                    onClick={() => setFilterOnline(false)}
                  >
                    {L("Online now")} <span>✕</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {peopleLoading ? (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                color: 'rgba(255,247,236,0.72)',
                fontSize: 13,
              }}
            >
              {L("Loading people in Bangkok…")}
            </div>
          ) : filteredPeople.length === 0 && !isOnline && live ? (
            // audit P2-8: offline is not "you're the first one here"
            <div className="kp-empty" id="peopleOffline">
              <div className="kp-empty-t">{L('You’re offline')}</div>
              <div className="kp-empty-s">{L('People load again when you’re back online.')}</div>
            </div>
          ) : filteredPeople.length === 0 ? (
            <div className="kp-empty">
              <div className="kp-empty-t">
                {(filterLang || filterWho || filterOnline || searchQuery) ? t.emptyPeopleTitle : L('People appear here as they join')}
              </div>
              <div className="kp-empty-s">
                {(filterLang || filterWho || filterOnline || searchQuery) ? t.emptyPeopleSub : (signedIn ? (live ? L('You’re one of the first. Post a Reel so people can find you.') : L('You’re one of the first. Post a photo so people can find you.')) : L('Sign in and make your card to see people and say hi.'))}
              </div>
              {(filterLang || filterWho || filterOnline || searchQuery) ? (
                <button
                  type="button"
                  className="kp-empty-btn"
                  onClick={() => {
                    setFilterLang('');
                    setFilterWho('');
                    setFilterOnline(false);
                    setSearchQuery('');
                  }}
                >
                  {L("Clear filters")}
                </button>
              ) : (!signedIn && peopleStills.length) ? null : (
                <button
                  type="button"
                  className="kp-empty-btn pink"
                  onClick={() => {
                    if (signedIn) { setPostPhotoUrl(''); setPostCaption(''); setSheet('post'); }
                    else { pendingActionRef.current = null; setSignInNotice(''); setSheet('signin'); }
                  }}
                >
                  {signedIn ? (live ? L('Post a Reel') : L('Post a photo')) : L('Join the community now')}
                </button>
              )}
              {!(filterLang || filterWho || filterOnline || searchQuery) && (() => {
                // polish #1: real Reel stills, blurred, behind one Join button (no grey placeholder cards)
                const stills = peopleStills;
                if (!stills.length) return null;
                return (
                  <div className="kp-blurwall" id="pplBlurWall">
                    <div className="kp-blurgrid" aria-hidden="true">
                      {stills.map((u, i) => <i key={i} style={{ backgroundImage: `url('${u}')` }} />)}
                    </div>
                    {!signedIn ? (
                      <button type="button" className="kp-blurjoin" id="pplJoin" onClick={() => { pendingActionRef.current = null; setSignInNotice(''); setSheet('signin'); }}>
                        {L('Join')}
                      </button>
                    ) : null}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="ppl-grid" id="pplGrid">
              {filteredPeople.map((p) => (
                <div
                  className="pcard"
                  data-who={p.who}
                  key={p.id}
                  onClick={() => {
                    if (live && /^[0-9a-f-]{36}$/.test(p.id)) {
                      void openProfile(p.id);
                      return;
                    }
                    setSelectedPerson(p);
                    setSheet('persondetail');
                  }}
                >
                  <div
                    className="img"
                    style={{ backgroundImage: `url('${p.img}')` }}
                  />
                  <div className="scrim" />
                  <button
                    type="button"
                    className="hibtn"
                    aria-label={`Say hi to ${p.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openSayHi(
                        p.name,
                        p.img,
                        `${
                          p.who === 'traveller' ? L('Traveller') : L('Thai local')
                        } · ${Lf('Speaks {0}', p.langs)}`,
                p.id
              );
                    }}
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M7.5 12.5V6.8a1.4 1.4 0 0 1 2.8 0v4.7M10.3 11V4.9a1.4 1.4 0 0 1 2.8 0V11M13.1 11V5.8a1.4 1.4 0 0 1 2.8 0v6.4M15.9 10.6V8.6a1.4 1.4 0 0 1 2.8 0v5.2c0 4.1-2.7 7.2-6.5 7.2-2.6 0-4.1-1.1-5.6-3.3l-2.3-3.6a1.45 1.45 0 0 1 2.3-1.75l1 1.25M3.2 6.2c.4-1.4 1.3-2.6 2.6-3.3M19.6 3.3c1.2.7 2 1.8 2.3 3.1" />
                    </svg>
                  </button>
                  <div className="info">
                    <div className="top">
                      {p.online && <span className="odot" />}
                      <span className="nm">{p.name}</span>
                      {false && p.verified && (
                        <button
                          type="button"
                          className="v"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSheet('verified');
                          }}
                          style={{
                            background: 'none',
                            border: 0,
                            padding: 0,
                            cursor: 'pointer',
                          }}
                        >
                          ✓
                        </button>
                      )}
                    </div>
                    <div className="langs">{p.langs}</div>
                    <span
                      className={`hook ${p.who === 'traveller' ? 'trav' : ''}`}
                    >
                      {p.hook}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ==================== 3. DEALS SCREEN ==================== */}
        <section
          className={`v8-screen ${tab === 'deals' ? 'active' : ''}`}
          id="s-deals"
          aria-label="Deals"
        >
          {live ? (
            <div className="go-tabh" id="goDealsHead">
              <h1>{L('Deals')}</h1>
              {/* audit P3-5: café perks are live, so the header only says "on the way" while there are none */}
              <p>{L('Travel essentials from trusted partners for now. Café perks for members are on the way.')}</p>
              {/* founder 17 Nov: Deals shows only the trip partners for now; café treats stay hidden until real partners join */}
              {DEALS_TRIP_ONLY ? <div style={{ height: 14 }} /> : deals.length > 0 ? (
                <div className="go-fch" id="goDealChips">
                  {([['all', L('All')], ['perks', L('For Locals')], ['trip', L('For travellers')]] as const).map(([k, label]) => (
                    <button type="button" key={k} data-df={k} className={goDealF === k ? 'on' : ''} aria-pressed={goDealF === k} onClick={() => setGoDealF(k)}>{label}</button>
                  ))}
                </div>
              ) : <div style={{ height: 14 }} />}
            </div>
          ) : null}
          {DEALS_TRIP_ONLY ? null : live && deals.length > 0 && goDealF !== 'trip' ? <div className="go-sech"><b>{L('Place perks')}</b><span>{L('Show your Kring card')}</span></div> : null}
          {DEALS_TRIP_ONLY || (live && (deals.length === 0 || goDealF === 'trip')) ? null : deals.length === 0 ? (
            <div className="kp-empty">
              <div className="kp-hero2">
                <div className="kp-hero kp-hero-ghost">
                  <span className="kp-ribbon">{t.todaysTreat}</span>
                  <span className="kp-ghost-rings big"><i /><i /></span>
                  <div className="kp-hinfo">
                    <b>{L("Partner venue perks coming soon")}</b>
                    <span>{L("Partner cafés and food spots appear here as soon as they join Kring.")}</span>
                  </div>
                </div>
              </div>
              <div className="kp-ghostwall" aria-hidden="true">
                {[
                  [L('Cafés'), L('Coffee')],
                  [L('Street food'), L('Food')],
                  [L('Classes & fun'), L('Fun')],
                  [L('Beauty & spa'), L('Beauty')],
                ].map(([label, tag]) => (
                  <div className="kp-ghost deal" key={label}>
                    <span className="kp-dtag">{tag}</span>
                    <span className="kp-ghost-rings"><i /><i /></span>
                    <span className="kp-ghost-l">{label}</span>
                    <span className="kp-ghost-soon">{L('Coming soon')}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="kp-hero2">
                <img className="kp-glowimg" src={deals[0].img} alt="" aria-hidden="true" />
                <div className="kp-hero">
                  <img src={deals[0].img} alt="" />
                  <div className="kp-hshade" />
                  <span className="kp-ribbon">{t.todaysTreat}</span>
                  {deals[0].dealEn ? null : (
                    <span className="kp-tkt">
                      <b>฿{deals[0].now}</b>
                      <s>฿{deals[0].was}</s>
                    </span>
                  )}
                  <div className="kp-hinfo">
                    <b>{deals[0].dealEn ? dealMain(deals[0]) : deals[0].title}</b>
                    {deals[0].dealEn ? (
                      <>
                        {dealSub(deals[0]) ? <span>{dealSub(deals[0])}</span> : null}
                        <span>
                          {dealVenue(deals[0])} · {deals[0].area}
                          {dealHours(deals[0]) ? ` · ${dealHours(deals[0])}` : ''}
                        </span>
                        {deals[0].mapsUrl ? (
                          <a className="kp-dmap" href={deals[0].mapsUrl} target="_blank" rel="noopener noreferrer">
                            {L('Open in Maps')}
                          </a>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <span>
                          {deals[0].venue} · {deals[0].area} · {formatTravellerCurrency(deals[0].now, dispCur)}
                        </span>
                        <span>{isDemo ? L('Example') : Lf('{0} claimed today', String(deals[0].claimed))}</span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`kp-claim ${claimedDeals[deals[0].id] ? 'done' : ''}`}
                    id="heroClaim"
                    onClick={() => handleClaimDeal(deals[0])}
                  >
                    {claimedDeals[deals[0].id] ? t.claimedShowCounter : t.claimTwoTaps}
                  </button>
                </div>
              </div>

              <div className="kp-dcats" id="dealCats">
                {(
                  [
                    ['all', t.all, '#5B6CFF', 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'],
                    ['coffee', t.coffee, '#FF8A3D', 'M5 9h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3'],
                    ['food', t.food, '#FF4FA3', 'M4 12h16a8 8 0 0 1-16 0zM12 4v4M9 6l3 2 3-2'],
                    ['fun', t.fun, '#6EE7A8', 'M4 8h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4zM12 8v10'],
                  ] as const
                ).map(([catKey, label, col, d]) => (
                  <button
                    type="button"
                    key={catKey}
                    className={dealCat === catKey ? 'on' : ''}
                    onClick={() => setDealCat(catKey)}
                  >
                    <span style={{ ['--c' as string]: col } as React.CSSProperties}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
                    </span>
                    {label}
                  </button>
                ))}
              </div>

              <div className="kp-dwall" id="dealGrid">
                {filteredDeals.map((d) => live && d.dealEn ? (
                  // partner treat = treat ticket card (founder pick B, 10 Nov): photo · pink ticket band with the treat · name, hours · I'm here
                  <div className="kp-ttile" key={d.id} data-deal-id={d.id} role="button" tabIndex={0}
                    onClick={() => handleClaimDeal(d)} onKeyDown={(e) => { if (e.key === 'Enter') handleClaimDeal(d); }}>
                    <div className="kp-tphoto" style={{ backgroundImage: `url(${d.img})` }}>
                      {d.area ? <span className="kp-tarea">📍 {L(d.area)}</span> : null}
                    </div>
                    <div className="kp-tband"><b>{dealMain(d)}</b>{dealSub(d) ? <small>{dealSub(d)}</small> : null}<i /><i /></div>
                    <div className="kp-tfoot">
                      <div><b>{dealVenue(d)}</b>{dealHours(d) ? <small>{dealHours(d)}</small> : null}</div>
                      <span className="kp-there">{L('I’m here')}</span>
                    </div>
                  </div>
                ) : (
                  <div className="kp-dtile" key={d.id} data-deal-id={d.id}>
                    <img src={d.img} alt="" />
                    <span className="kp-dtag">{d.dealEn ? L(d.tag) : d.tag}</span>
                    <div className="kp-dinfo">
                      {d.dealEn ? (
                        <>
                          <span className="kp-tstub kp-tstub-deal">
                            <b>{dealMain(d)}</b>
                          </span>
                          {dealSub(d) ? <span className="kp-dv">{dealSub(d)}</span> : null}
                          <b className="kp-dt">{dealVenue(d)}</b>
                          <span className="kp-dv">
                            {d.area}
                            {dealHours(d) ? ` · ${dealHours(d)}` : ''}
                          </span>
                          {d.mapsUrl ? (
                            <a className="kp-dmap" href={d.mapsUrl} target="_blank" rel="noopener noreferrer">
                              {L('Open in Maps')}
                            </a>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <span className="kp-tstub">
                            <b>฿{d.now}</b>
                            <s>฿{d.was}</s>
                          </span>
                          <b className="kp-dt">{d.title}</b>
                          <span className="kp-dv">{d.venue} · {d.area}</span>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      className={`kp-claim small ${claimedDeals[d.id] ? 'done' : ''}`}
                      onClick={() => handleClaimDeal(d)}
                    >
                      {live && (d.dealEn || d.dealTh) ? L('How to use') : claimedDeals[d.id] ? t.showCode : L('Claim')}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          {!DEALS_TRIP_ONLY && live && goDealF !== 'perks' ? <StayDo L={L} Lf={Lf} thai={lang === 'th'} signedIn={signedIn} /> : null}
          {DEALS_TRIP_ONLY || !live || goDealF !== 'perks' || deals.length === 0 ? <TripPerks L={L} /> : null}
          {DEALS_TRIP_ONLY ? (
            <div className="kd-soon" id="dealsSoon">
              <span className="kd-soon-rings" aria-hidden="true"><i /><i /></span>
              <b>{L('More deals coming soon')}</b>
              <span>{L('Partner cafés, studios and food spots join Kring soon.')}</span>
            </div>
          ) : null}
        </section>

        {/* ==================== 4. ME SCREEN (Calm Luxe #0B0A12) ==================== */}
        <section
          className={`v8-screen ${tab === 'me' ? 'active' : ''}`}
          id="s-me"
          aria-label="Me"
        >
          {live && signedIn && v5Card && meProfile ? (
            <MeView
              L={L}
              Lf={Lf}
              ghost={v5Ghost}
              p={meProfile}
              rank={meRank}
              posters={mePosters}
              savedCount={savedFeedItems.length}
              savedImgs={savedFeedItems.map((f) => f.poster || f.img || '').filter(Boolean)}
              unread={activityUnread}
              verifyState={meProfile.verified ? 'verified' : verifyPending ? 'pending' : 'none'}
              onTop10={() => setSheet('ranking')}
              onList={(k) => openFollowList(meProfile, k)}
              onSettings={() => setSheet('settings')}
              onActivity={() => {
                try { setActivitySeenAt(localStorage.getItem('kr8_activity_seen') || ''); } catch { setActivitySeenAt(''); }   // H: rows newer than this get a dot
                setSheet('activity');
                setActivityUnread(false);
                try { localStorage.setItem('kr8_activity_seen', activityRows?.[0]?.at || new Date().toISOString()); } catch { /* ignore */ }
              }}
              onEdit={() => setSheet('v5card')}
              onShare={() => void shareProfile(meProfile)}
              onCode={() => setSheet('mycode')}
              onSaved={() => setSheet('saved')}
              onRewards={() => setSheet('activity')}
              onReel={openReelFromProfile}
              onPost={() => kxPostAt()}
              onVerify={() => setSheet('verify')}
              gender={shownGender(v5Card)}
              onReplay={() => { void coachReplay(coachRef.current, true).then(() => { setTab('feed'); showToast(L('Intro is on again')); }); }}
              reelsSlot={(
                <GoMeReels L={L} Lf={Lf} mine={goMine} saved={kxSaved} tab={goMeTab} onTab={(k) => { setGoMeTab(k); if (k === 'saved') void kxLoadSaved(); }}
                  onPost={() => kxPostAt()} onBrowse={() => setTab('feed')}
                  onOpenMine={(i) => goOpenPlayer((goMine || []).map((r) => gridToGo(r, { id: v5Uid, name: v5Card?.first_name || '', photo: v5Card?.photo || null, handle: kxMe?.ig_handle }, true)), i)}
                  onOpenSaved={(i) => goOpenPlayer((kxSaved || []).map(savedToGo), i, { title: L('Saved Reels') })} />
              )}
              firstReelChip={showFirstReelChip(v5Uid, meProfile.reels.length > 0) ? <FirstReelChip onPost={() => { setTab('feed'); openCreate(); }} /> : null}
              kx={kxMe}
              weekRank={kxWeekRank}
              onRings={() => { setKxReady(false); setSheet('rewards'); void kxLoadRewards(); }}
              ringsDot={kxReady}
              onRanking={() => setSheet('ranking')}
              prizeSlot={kxWeek ? (
                <PrizeBanner variant="card" uid={v5Uid} week={kxWeek} hideTick={prizeHideTick} onHide={() => setPrizeHideTick((n) => n + 1)}
                  onOpen={() => setSheet('ranking')} />
              ) : null}
              rankLine={kxRankLine}
              saved={kxSaved ? { count: kxSaved.length, thumbs: kxSaved.slice(0, 3).map((x) => mePosters[x.poster_path] || '').filter(Boolean) } : null}
              onSavedReels={() => { setSheet('savedreels'); void kxLoadSaved(); }}
            />
          ) : (<>
          <div className="kp-me-head">
            <InstallChip L={L} id="installChipGuest" />
            <button
              type="button"
              className="kp-gear"
              aria-label={t.settings}
              onClick={() => setSheet('settings')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>

          <div
            className={`kp-mcard ${signedIn && user.level === 'tea' ? 'tea' : ''}`}
            id={signedIn ? 'memberCard' : 'guestCard'}
            onClick={() => {
              setMemberRingsState('collide');
              setTimeout(() => setMemberRingsState('spin'), 900);
            }}
          >
            <span className="kp-shine" />
            <div className="kp-mtop">
              {signedIn ? (
                <img className="kp-av" src={user.avatar} alt="" />
              ) : null}
              <span className="kp-lvl">
                {!signedIn
                  ? ''
                  : user.level === 'pandan'
                  ? L('PANDAN MEMBER')
                  : user.level === 'tea'
                  ? L('THAI TEA MEMBER')
                  : L('ANCHAN MEMBER')}
              </span>
              <span className="kp-kmark" aria-hidden="true"><i /><i /></span>
            </div>
            <div className="kp-nm">{signedIn ? user.name : L('Your Kring card')}</div>
            <div className="kp-sub">
              {signedIn
                ? `KR ${String(1000 + (Array.from(String(user.id || user.name)).reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 9000, 7))).padStart(4, '0')} · ${L('since Nov 2026')}`
                : L('Sign in to say hi, claim treats and post')}
            </div>
          </div>

          {!signedIn && (
            <ul className="kp-gets" id="guestGets">
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.5-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></svg>{L('Post Reels of your Bangkok spots')}</li>
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 12.5V6.8a1.4 1.4 0 0 1 2.8 0v4.7M10.3 11V4.9a1.4 1.4 0 0 1 2.8 0V11M13.1 11V5.8a1.4 1.4 0 0 1 2.8 0v6.4M15.9 10.6V8.6a1.4 1.4 0 0 1 2.8 0v5.2c0 4.1-2.7 7.2-6.5 7.2-2.6 0-4.1-1.1-5.6-3.3l-2.3-3.6a1.45 1.45 0 0 1 2.3-1.75l1 1.25" /></svg>{L('Say hi to locals and travellers')}</li>
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6M10 17h4v3h-4z" /></svg>{L('Weekly rewards for the top 8 Reels')}</li>
            </ul>
          )}
          {!signedIn && (
              <button
              type="button"
              className="kp-signin"
              id="guestSignInBtn"
              onClick={() => {
                pendingActionRef.current = null;
                setSignInNotice('');
                setSheet('signin');
              }}
            >
              {L('Join the community now')}
            </button>
          )}
          {signedIn && <div className="kp-qa">
              <button
                type="button"
                onClick={() => {
                  if (!signedIn) { pendingActionRef.current = null; setSignInNotice(''); setSheet('signin'); return; }
                  setEditName(user.name);
                  setEditLangs(user.langs);
                  setEditHook(user.hook);
                  setSheet(live ? 'v5card' : 'editprofile');
                }}
              >
                <span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z" /></svg>
                </span>
                {t.editProfile}
              </button>
              <button type="button" onClick={() => { if (!signedIn) { pendingActionRef.current = null; setSignInNotice(''); setSheet('signin'); return; } handleShareLink(user.name, `person=${user.name}`); }}>
                <span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3M7 8l5-5 5 5M5 14v6h14v-6" /></svg>
                </span>
                {t.shareCard}
              </button>
              <button type="button" onClick={() => { if (!signedIn) { pendingActionRef.current = null; setSignInNotice(''); setSheet('signin'); return; } setSheet('mycode'); }}>
                <span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2M20 14v6h-6" /></svg>
                </span>
                {t.myCode}
              </button>
            </div>}

          {signedIn && (
            <div className="kp-level">
              <div className="kp-level-r">
                <span className="kp-cap">{L('Next level')}</span>
                <span className="kp-level-next">
                  {!signedIn ? L('Free member card') : user.level === 'tea' ? L('Pandan member') : L('Thai tea member')}
                </span>
              </div>
              <div className="kp-bar">
                <i style={{ width: `${Math.min(100, Math.round(((user.postsCount || 0) / 6) * 100))}%` }} />
                <b style={{ left: `${Math.min(100, Math.round(((user.postsCount || 0) / 6) * 100))}%` }} />
              </div>
              <div className="kp-level-s">
                {!signedIn ? L('Sign in to start your card · free') : Lf('{0} more posts or 1 partner-café visit to go', String(Math.max(0, 6 - (user.postsCount || 0))))}
              </div>
            </div>
          )}

          {signedIn && unusedClaimedDeal && (
            <div className="ready" id="readyCard">
              <img src={unusedClaimedDeal.img} alt="" />
              <div className="txt">
                <div className="k">{t.readyToUse}</div>
                <div className="t">{L(unusedClaimedDeal.title)}</div>
                <div className="s">
                  {L(unusedClaimedDeal.venue)} · ฿{unusedClaimedDeal.now}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveRedeemDealId(unusedClaimedDeal.id);
                  setSheet('redeem');
                }}
              >
                {t.showCode}
              </button>
            </div>
          )}

          <div className="kp-rows">
            <button type="button" className="kp-row" onClick={() => setSheet('saved')}>
              <span>{t.saved}</span>
              <span className="kp-row-v">{savedFeedItems.length} ›</span>
            </button>
            {!live && (
            <button type="button" className="kp-row" onClick={() => setSheet('passport')}>
              <span>{L('Rewards and passport')}</span>
              <span className="kp-row-v pink">
                {user.role === 'traveller' && user.tripTotalDays > 0
                  ? Lf('Day {0} of {1}', String(user.tripDay), String(user.tripTotalDays))
                  : Lf('{0} of 6 stamps', String(stampsFilledCount))}{' '}
                ›
              </span>
            </button>
            )}
          </div>
                  </>)}
        </section>

        {/* ==================== BOTTOM DOCK (4 Tabs) ==================== */}
        <KDock tab={tab} labels={{ feed: t.feed, people: t.people, deals: t.deals, me: t.me }} onTap={handleDockTap} />

        {/* ==================== CONDITIONAL SHEETS (mounted ONLY when open) ==================== */}
        {sheet && !['profile', 'rewards', 'claim', 'claimed', 'ranking', 'result', 'savedreels', 'place', 'v5card'].includes(sheet) && (
          <div
            className="sheet-backdrop"
            id="backdrop"
            onClick={() => setSheet(null)}
          />
        )}

        {sheet === 'weather' && (
          <div className="v8-sheet" id="sh-weather">
            <div className="grab" />
            <div className="sh-head">
              <h3>{L("Today in Bangkok")}</h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </div>
            <div className="wx-card">
              <div className="wx-top">
                <div>
                  <div className="wx-temp">
                    {weather.conditionIcon}{' '}
                    {Number.isFinite(weather.tempC) ? `${weather.tempC}°` : '—°'}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,247,236,0.72)' }}>
                    {Number.isFinite(weather.feelsLikeC)
                      ? `Feels like ${weather.feelsLikeC}° · `
                      : ''}
                    {weather.conditionLabel}
                  </div>
                </div>
                {signedIn && user.tripTotalDays > 0 && (
                  <span className="wx-day">
                    {user.role === 'traveller'
                      ? `Day ${user.tripDay} of ${user.tripTotalDays}`
                      : 'Thai local'}
                  </span>
                )}
              </div>
              <div className="wx-pick">
                <div className="k">{L("Local’s pick for this weather")}</div>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>
                  {weather.localPickTitle}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'rgba(255,247,236,0.76)',
                    lineHeight: 1.45,
                  }}
                >
                  {weather.localPickDesc}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSheet(null);
                    setTab('deals');
                  }}
                  style={{
                    marginTop: 10,
                    padding: '8px 14px',
                    borderRadius: 999,
                    border: 0,
                    background: 'var(--tea)',
                    color: '#0B0A12',
                    fontWeight: 800,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {isDemo ? 'See today’s coffee treat →' : 'See deals →'}
                </button>
              </div>
              <div className="wx-tip">☂ {weather.rainTip}</div>
            </div>
          </div>
        )}

        {sheet === 'story' && currentStorySlide && (
          <div className="v8-sheet full" id="sh-story">
            <div
              className="story-view"
              style={{ backgroundImage: `url('${currentStorySlide.img}')` }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg,rgba(11,10,18,0.65) 0%,transparent 30%,transparent 65%,rgba(11,10,18,0.92) 100%)',
                }}
              />
              <div className="story-bars">
                {currentStorySlides.map((_, idx) => (
                  <span key={idx}>
                    <i
                      style={{
                        width: idx <= activeStoryIndex ? '100%' : '0%',
                      }}
                    />
                  </span>
                ))}
              </div>
              <div
                style={{
                  position: 'relative',
                  zIndex: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img
                    src={currentStorySlide.av}
                    alt=""
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      objectFit: 'cover',
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>
                      {activeStoryArea} · {currentStorySlide.who}
                    </div>
                    <div
                      style={{ fontSize: 11, color: 'rgba(255,247,236,0.72)' }}
                    >
                      {currentStorySlide.time} · {L('Expires at midnight')}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="xbtn"
                  onClick={() => setSheet(null)}
                >
                  ✕
                </button>
              </div>

              <div className="story-foot" style={{ position: 'relative', zIndex: 2 }}>
                <div className="cap">{currentStorySlide.cap}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {currentStorySlides.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setActiveStoryIndex(
                          (activeStoryIndex + 1) % currentStorySlides.length
                        )
                      }
                      style={{
                        padding: '14px 16px',
                        borderRadius: 14,
                        background: 'rgba(255,247,236,0.14)',
                        color: '#FFF7EC',
                        border: 0,
                        fontWeight: 800,
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      {L("Next ›")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="story-hi"
                    style={{ flex: 1 }}
                    onClick={() => {
                      const speakerName =
                        currentStorySlide.who.split('·')[0].trim() || 'Member';
                      openSayHi(
                        speakerName,
                        currentStorySlide.av,
                        Lf('Replying to {0} story', activeStoryArea)
                      );
                    }}
                  >
                    {L("กริ๊ง! Say hi")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {sheet === 'hi' && (
          <div className="v8-sheet" id="sh-hi">
            <div className="grab" />
            <div className="sh-head">
              <h3>{L("Say hi · กริ๊ง!")}</h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </div>
            <div className="hi-target">
              <img src={hiTarget.img} alt={hiTarget.name} />
              <div>
                <div className="nm">
                  {hiTarget.name}{' '}
                  {people.find((x) => x.id === hiTarget.id)?.verified === true && (
                  <span style={{ color: '#6EE7A8', fontSize: 11 }}>
                    ✓ {t.verifiedLabel}
                  </span>
                  )}
                </div>
                <div className="sub">{hiTarget.context}</div>
              </div>
            </div>
            <div className="openers">
              {[
                hiTarget.fromReel ? Lf('Hi {0}! Love this Reel! Where is it?', hiTarget.name) : Lf('Hi {0}! 👋 Hi from Kring.', hiTarget.name),
                Lf('Hi {0}! Any favourite spot around here?', hiTarget.name),
                hiTarget.fromReel ? Lf('Hi {0}! 👋 Hi from Kring.', hiTarget.name) : Lf('Hey {0}! Which spot in this area is your favourite right now?', hiTarget.name),
              ].map((opener, i) => (
                <button
                  type="button"
                  className="opener"
                  key={i}
                  onClick={() => {
                    setHiMessage(opener);
                    setHiError('');
                  }}
                >
                  “{opener}”
                </button>
              ))}
            </div>
            <textarea
              className="hi-box"
              rows={3}
              value={hiMessage}
              onChange={(e) => {
                setHiMessage(e.target.value);
                setHiError('');
              }}
              placeholder={L("Write one friendly hello…")}
            />
            {hiError && (
              <div id="hiError"
                role="alert"
                style={{
                  marginTop: 8,
                  padding: '9px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,90,107,0.16)',
                  border: '1px solid rgba(255,90,107,0.45)',
                  color: '#FFF7EC',
                  fontSize: 12,
                }}
              >
                {hiError}
              </div>
            )}
            <button
              type="button"
              className="primary-cta"
              onClick={handleSendHello}
            >
              {t.sendHello}
            </button>
            {/* polish #11: the one-message rule as one grey line */}
            <p className="hi-rule" id="hiRule">{Lf('1 hello · when they reply, chat opens · {0} left today', String(Math.max(0, 15 - dailyHelloCount)))}</p>
          </div>
        )}

        {sheet === 'signin' && live && (
          <V5SignInSheet
            L={L}
            Lf={Lf}
            initialNotice={v5SignInNotice}
            invitedBy={kxInviter || v5StoredRef()}
            onClose={() => {
              setSheet(null);
              v5JoinRef.current = false;
              try { sessionStorage.removeItem('kr8_join'); } catch { /* ignore */ }
              setV5SignInNotice('');
            }}
          />
        )}
        {sheet === 'reelNudge' && (
          <ReelNudgeSheet
            poster={`${import.meta.env.BASE_URL}media/demo/bangpu.jpg`}
            video={`${import.meta.env.BASE_URL}media/demo/bangpu.mp4`}
            onPost={() => { setReelNudgeLater(v5Uid, false); setTab('feed'); openCreate(); }}
            onLater={() => { setReelNudgeLater(v5Uid, true); setSheet(null); }}
            lang={lang}
            L={L}
          />
        )}
        {sheet === 'v5card' && live && (
          <V5MintSheet
            L={L}
            Lf={Lf}
            card={v5Card as never}
            uiLang={lang}
            photoFix={photoFix}
            toast={showToast}
            onClose={() => setSheet(null)}
            onSaved={(me) => {
              v5JoinRef.current = false;
              try { sessionStorage.removeItem('kr8_join'); } catch { /* ignore */ }
              v5ApplyMe(me);
              kxCardExtras().then(setKxMe).catch(() => undefined);
            }}
            onAfter={(what, no) => {
              if (what === 'share') { void kxShareInvite(no); return; }
              const wasNew = !!no && !v5CardWasRef.current;
              if (wasNew) pushMoment('minted');   // 16 Nov dings: ask right after the card is minted
              setSheet(null);
              if (what === 'reel') { markReelNudgeSeen(v5LastUid.current || v5Uid); pendingActionRef.current = null; kxPostAt(); return; }
              const next = pendingActionRef.current;
              pendingActionRef.current = null;
              if (next) setTimeout(() => next(), 60);
              else if (standRef.current) setTimeout(() => { setStandOpen(standRef.current); setSheet('ticket'); }, 60);   // the stand ticket comes first
              else if (wasNew) { markReelNudgeSeen(v5LastUid.current || v5Uid); setTab('me'); }   // the minted screen already offered the first Reel
            }}
          />
        )}
        {sheet === 'signin' && !live && (
          <div className="v8-sheet" id="sh-signin">
            <div className="grab" />
            <div className="sh-head">
              <h3>{L("Sign-in opens on 1 Dec · join the waitlist")}</h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </div>
            <p
              style={{
                margin: '0 0 12px',
                fontSize: 12.5,
                color: 'rgba(255,247,236,0.78)',
                lineHeight: 1.5,
              }}
            >
              {L(
                "Leave your email and we’ll invite you the moment sign-in goes live on 1 Dec."
              )}
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginBottom: 14,
              }}
            >
              <input
                type="email"
                className="hi-box"
                id="waitlistEmailInput"
                style={{ marginBottom: 0 }}
                value={waitlistEmail}
                onChange={(e) => {
                  setWaitlistEmail(e.target.value);
                  setSignInNotice('');
                }}
                placeholder={L("Your email address")}
              />
              <button
                type="button"
                className="primary-cta"
                id="waitlistJoinBtn"
                onClick={async () => {
                  const clean = waitlistEmail.trim();
                  if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
                    setSignInNotice(L("Enter a valid email first"));
                    return;
                  }
                  await submitWaitlistEmail(clean);
                  setWaitlistSubmitted(true);
                  const msg = L("You’re on the 1 Dec launch list · กริ๊ง!");
                  setSignInNotice(msg);
                  showToast(msg);
                }}
              >
                {waitlistSubmitted
                  ? L("You’re on the 1 Dec launch list · กริ๊ง!")
                  : L("Join the waitlist · กริ๊ง!")}
              </button>
            </div>
            {signInNotice && (
              <p
                id="signinNotice"
                role="status"
                aria-live="polite"
                style={{
                  margin: '0 0 12px',
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: 'rgba(91,108,255,0.18)',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {signInNotice}
              </p>
            )}
            {isDemo && (
              <>
                <div className="trip-opts" style={{ marginBottom: 10 }}>
                  <button
                    type="button"
                    className={signInTripMode === 'trip' ? 'on' : ''}
                    onClick={() => setSignInTripMode('trip')}
                  >
                    {L("✈ Visiting Bangkok")}
                  </button>
                  <button
                    type="button"
                    className={signInTripMode === 'local' ? 'on' : ''}
                    onClick={() => setSignInTripMode('local')}
                  >
                    {L("🏠 I live here")}
                  </button>
                </div>
                <div className="auth-btns">
                  <button
                    type="button"
                    className="auth-btn apple"
                    onClick={() => completeSignIn('Apple')}
                  >
                     {L('Continue with Apple')}
                  </button>
                  <button
                    type="button"
                    className="auth-btn google"
                    onClick={() => completeSignIn('Google')}
                  >
                    {L("G Continue with Google")}
                  </button>
                  <button
                    type="button"
                    className="auth-btn line"
                    onClick={() => completeSignIn('LINE')}
                  >
                    {L("LINE Continue with LINE")}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {sheet === 'notifprompt' && (
          <div className="v8-sheet" id="sh-notifprompt">
            <div className="grab" />
            <div className="sh-head">
              <h3>{Lf('Want us to ring you when {0} replies?', lastHelloTargetName)}</h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </div>
            <p
              style={{
                margin: '0 0 14px',
                fontSize: 13,
                color: 'rgba(255,247,236,0.78)',
                lineHeight: 1.5,
              }}
            >
              {L("We only notify you when someone replies to your hello. Zero spam.")}
            </p>
            <button
              type="button"
              className="primary-cta"
              onClick={() => {
                setSheet(null);
                showToast(Lf('We’ll ring you as soon as {0} replies', lastHelloTargetName));
              }}
            >
              {L("Turn on reply ring · กริ๊ง!")}
            </button>
          </div>
        )}

        {sheet === 'locationprompt' && (
          <div className="v8-sheet" id="sh-locationprompt">
            <div className="grab" />
            <div className="sh-head">
              <h3>{L("Share neighbourhood area only?")}</h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet('post')}
              >
                ✕
              </button>
            </div>
            <p
              style={{
                margin: '0 0 14px',
                fontSize: 13,
                color: 'rgba(255,247,236,0.78)',
                lineHeight: 1.5,
              }}
            >
              {L("“I’m here now” shows only the neighbourhood name (like")} <b>Ari</b> or{' '}
              <b>Siam</b>{L(") — never your exact street or distance — and turns off automatically after 2 hours.")}
            </p>
            <button
              type="button"
              className="primary-cta"
              onClick={handleGrantLocationAreaOnly}
            >
              {L("Allow area-only for 2 hours")}
            </button>
          </div>
        )}

        {sheet === 'choose' && (
          <div className="v8-sheet" id="sh-choose">
            <div className="grab" />
            <div className="sh-head">
              <h3>{L("Share with Bangkok")}</h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </div>
            <div className="choice-grid">
              <button
                type="button"
                className="choice"
                style={{ width: '100%', textAlign: 'left', fontFamily: 'inherit', color: 'inherit' }}
                onClick={() => {
                  setPostPhotoUrl('');
                  setPostCaption('');
                  setSheet('post');
                }}
              >
                <div className="ic">📸</div>
                <div>
                  <div className="t">{live ? L('Post a Reel') : L("Post a photo or story")}</div>
                  <div className="s">
                    {live ? L('A 5–60 second vertical video of your Bangkok') : L("Share a café, street bite, or neighbourhood moment")}
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {sheet === 'post' && live && !postEventId && !placeSearchOpen && (
          <GoCompose L={L} Lf={Lf} lang={lang} reel={reelInfo} stage={reelStage} progress={reelProgress} problem={reelProblem}
            caption={postCaption} onCaption={setPostCaption} places={postPlaces} onAddPlace={() => setPlaceSearchOpen(true)}
            onRemovePlace={(id) => setPostPlaces((prev) => prev.filter((x) => x.id !== id))}
            people={postPeople} onPeople={setPostPeople} onPick={(f) => void pickReel(f)} onPost={handlePublishPost} onClose={() => setSheet(null)} />
        )}
        {sheet === 'post' && live && reelTrim && (
          <GoTrim L={L} lang={lang} reel={reelTrim} poster={reelPreviewPoster} onUse={chooseTrim} onBack={leaveTrim} />
        )}
        {sheet === 'post' && !(live && !postEventId) && (
          <div className="v8-sheet" id="sh-post">
            <div className="grab" />
            <div className="sh-head">
              <h3>{live ? L('Post a Reel') : L("Post a photo or story")}</h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </div>
            {live && (
              <div className={`post-preview reel-pick ${reelInfo ? '' : 'empty'}`} id="reelPreview"
                style={reelInfo ? undefined : { background: 'rgba(255,247,236,0.06)', border: '1.5px dashed rgba(255,247,236,0.28)' }}>
                {reelInfo ? <WindowVideo className="reel-preview-video" src={reelInfo.url} win={reelInfo.trim} poster={reelPreviewPoster || undefined} /> : null}
                <label id="addReelPicker" className={`reel-add ${reelInfo ? 'small' : ''}`}>
                  {reelInfo ? L('Change Reel') : L('＋ Add a Reel')}
                  <input
                    type="file"
                    accept="video/*"
                    aria-label="Add a Reel"
                    id="reelFile"
                    style={{ display: 'none' }}
                    disabled={reelStage === 'preparing' || reelStage === 'uploading' || reelStage === 'saving'}
                    onChange={(e) => { void pickReel(e.target.files?.[0]); e.target.value = ''; }}
                  />
                </label>
                {!reelInfo && <div className="reel-rule">{L('Vertical video · 5–60 seconds')}</div>}
                {reelInfo && <span className="reel-len">{(reelInfo.durationMs / 1000).toFixed(0)} s</span>}
              </div>
            )}
            {live && reelProblem ? <div className="reel-problem" id="reelProblem" role="alert">{reelProblem}</div> : null}
            {live && reelStage !== 'idle' && reelStage !== 'failed' ? (
              <div className="reel-progress" id="reelProgress">
                <span>{reelStage === 'preparing' ? L('Preparing your Reel') : reelStage === 'uploading' ? L('Uploading') : L('Saving')}</span>
                <i style={{ width: `${Math.round(reelProgress * 100)}%` }} />
              </div>
            ) : null}
            {!live && (
            <div
              className={`post-preview ${postPhotoUrl ? '' : 'empty'}`}
              id="postPreview"
              style={
                postPhotoUrl
                  ? { backgroundImage: `url('${postPhotoUrl}')` }
                  : {
                      background: 'rgba(255,247,236,0.06)',
                      border: '1.5px dashed rgba(255,247,236,0.28)',
                    }
              }
            >
              {/* V5 has no 24 h area stories yet, so live mode only offers a feed post */}
              {!live && (
              <div className="seg">
                <button
                  type="button"
                  className={postKind === 'post' ? 'on' : ''}
                  onClick={() => setPostKind('post')}
                >
                  {L("Feed Post")}
                </button>
                <button
                  type="button"
                  className={postKind === 'story' ? 'on' : ''}
                  onClick={() => setPostKind('story')}
                >
                  {L("Area Story (24h)")}
                </button>
              </div>
              )}
              <label
                id="addPhotoPicker"
                style={{
                  background: postPhotoUrl ? 'rgba(11,10,18,0.78)' : 'var(--anchan)',
                  padding: postPhotoUrl ? '6px 10px' : '10px 18px',
                  borderRadius: 999,
                  fontSize: postPhotoUrl ? 11 : 14,
                  fontWeight: 800,
                  cursor: 'pointer',
                  border: '1px solid rgba(255,247,236,0.2)',
                  alignSelf: 'center',
                }}
              >
                {postPhotoUrl ? L('Change photo') : L('＋ Add photo')}
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Add photo"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') {
                        setPostPhotoUrl(reader.result);
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>
            )}
            <textarea
              className="hi-box"
              rows={2}
              value={postCaption}
              onChange={(e) => setPostCaption(e.target.value)}
              placeholder={L("What is good here right now?")}
            />
            {live && (
              <PlacePickRow L={L} Lf={Lf} lang={lang} picked={postPlaces} onOpen={() => setPlaceSearchOpen(true)}
                onChange={(list) => { setPostPlaces(list); if (list[0] && !postArea) setPostArea(list[0].kr_area || 'Bangkok'); }} />
            )}
            {live && (
              // 0072 (17 Nov): places outside Bangkok are fine to tag, but only Bangkok Reels count on the weekly prize board.
              // Thai line with English under it on every language (founder rule).
              <p className={`kx-bkk-note${postPlaces.length > 0 && postPlaces.every((p) => p.area === 'Outside Bangkok') ? ' warn' : ''}`} id="postBkkNote">
                <span lang="th">เฉพาะ Reel ในกรุงเทพฯ ที่นับรางวัลประจำสัปดาห์</span>
                <small lang="en">Only Bangkok Reels count toward the weekly prize.</small>
              </p>
            )}
            {live && reelInfo && tagPlaces.length > 0 && (
              <select
                id="reelPlace"
                className="hi-box reel-place-pick"
                aria-label={L('Tag a partner place (optional)')}
                value={postPlace}
                onChange={(e) => {
                  const v = e.target.value;
                  setPostPlace(v);
                  const pl = tagPlaces.find((x) => x.venue_id === v);
                  if (pl) setPostArea(pl.area);
                }}
              >
                <option value="">📍 {L('Tag a partner place (optional)')}</option>
                {tagPlaces.map((pl) => (
                  <option key={pl.venue_id} value={pl.venue_id}>
                    {lang === 'th' && pl.name_th ? pl.name_th : pl.name} · {L(pl.area)}
                  </option>
                ))}
              </select>
            )}
            <div className="post-meta">
              {postArea ? (
                <span className="pill-rem">
                  📍 {postArea}
                  <button
                    type="button"
                    onClick={() => setPostArea(null)}
                    aria-label="Remove area"
                  >
                    ✕
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="pill-rem"
                  onClick={() => setPostArea(activeStoryArea || 'Ari')}
                  style={{ cursor: 'pointer' }}
                >
                  {L("+ Add area")}
                </button>
              )}
              <button
                type="button"
                className={`toggle-pill ${postHereNow ? 'on' : ''}`}
                onClick={handleToggleHereNow}
              >
                <span className="sw" /> {L("I’m here now (2h area only)")}
              </button>
            </div>
            <button
              type="button"
              className="primary-cta"
              id="shareNowBtn"
              disabled={live ? !(reelInfo || (postEventId && postCaption.trim())) || ['preparing', 'uploading', 'saving'].includes(reelStage) : !postPhotoUrl}
              style={(live ? reelInfo || (postEventId && postCaption.trim()) : postPhotoUrl) ? undefined : { opacity: 0.5, cursor: 'not-allowed' }}
              onClick={handlePublishPost}
            >
              {live && reelStage === 'failed' ? L('Retry') : L("Share now · กริ๊ง!")}
            </button>
          </div>
        )}


        {sheet === 'filter' && (
          <div className="v8-sheet" id="sh-filter">
            <div className="grab" />
            <div className="sh-head">
              <h3>{L("Filter people")}</h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </div>
            <div className="fgroup">
              <div className="lbl">{L("Speaks")}</div>
              <div className="fchips">
                {/* audit P2-1: cards store ZH / JA / KO (the filter looked for CN / JP / KR and found nobody) */}
                {(['', 'TH', 'EN', 'ZH', 'HI', 'JA', 'KO'] as const).map((code) => (
                  <button
                    type="button"
                    key={code || 'any'}
                    className={`fchip ${filterLang === code ? 'on' : ''}`}
                    onClick={() => setFilterLang(code)}
                  >
                    {code === '' ? L('Any language') : LANG_CHIP[code] || code}
                  </button>
                ))}
              </div>
            </div>
            <div className="fgroup">
              <div className="lbl">{L("Who")}</div>
              <div className="fchips">
                {(
                  [
                    ['', L('Anyone')],
                    ['local', L('Thai locals')],
                    ['traveller', L('Travellers')],
                  ] as [string, string][]
                ).map(([whoVal, label]) => (
                  <button
                    type="button"
                    key={whoVal || 'any'}
                    className={`fchip ${filterWho === whoVal ? 'on' : ''}`}
                    onClick={() => setFilterWho(whoVal)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="fgroup">
              <div className="lbl">{L("Availability")}</div>
              <div className="fchips">
                <button
                  type="button"
                  className={`fchip ${filterOnline ? 'on' : ''}`}
                  onClick={() => setFilterOnline((v) => !v)}
                >
                  {L("Online now")}
                </button>
              </div>
            </div>
            <button
              type="button"
              className="primary-cta"
              id="applyFilterBtn"
              onClick={() => { if (!signedIn && !filteredPeople.length) { pendingActionRef.current = null; setSignInNotice(''); setSheet('signin'); return; } setSheet(null); }}
            >
              {!signedIn && !filteredPeople.length ? L('Join') : Lf('Show {0} people', String(filteredPeople.length))}
            </button>
          </div>
        )}

        {sheet === 'persondetail' && selectedPerson && (
          <div className="v8-sheet" id="sh-persondetail">
            <div className="grab" />
            <div className="sh-head">
              <h3>
                {selectedPerson.name}{' '}
                {selectedPerson.verified === true && (
                <button
                  type="button"
                  onClick={() => setSheet('verified')}
                  style={{
                    background: 'none',
                    border: 0,
                    color: '#6EE7A8',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ✓ {t.verifiedLabel}
                </button>
                )}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
                <button
                  type="button"
                  className="xbtn"
                  aria-label="More options"
                  onClick={() => setPersonMenuOpen((v) => !v)}
                >
                  ⋯
                </button>
                <button
                  type="button"
                  className="xbtn"
                  onClick={() => setSheet(null)}
                >
                  ✕
                </button>
                {personMenuOpen && (
                  <div className="v9-more-menu" id="personMoreMenu">
                    <button
                      type="button"
                      onClick={() => {
                        setPersonMenuOpen(false);
                        if (live) {
                          const target = selectedPerson.id;
                          void v5Once('report', async () => {
                            try {
                              await v5Report({ user: target, reason: 'profile-menu' });
                            } catch (e) {
                              showToast(v5Msg(e));
                              return;
                            }
                            setSheet(null);
                            showToast(L('Reported · thank you. Our team reviews every report.'));
                          });
                          return;
                        }
                        setSheet(null);
                        showToast(
                          isDemo
                            ? `Reported ${selectedPerson.name} · our safety team reviews within 15 minutes`
                            : `Reported ${selectedPerson.name} · thank you`
                        );
                      }}
                    >
                      {L("Report profile")}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        setPersonMenuOpen(false);
                        handleBlockTarget(selectedPerson.id);
                      }}
                    >
                      Block {selectedPerson.name}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="hi-target">
              <img src={selectedPerson.img} alt={selectedPerson.name} />
              <div>
                <div className="nm">
                  {selectedPerson.who === 'traveller'
                    ? t.traveller
                    : t.thaiLocal}{' '}
                  · {Lf('Speaks {0}', selectedPerson.langs)}
                </div>
                <div className="sub">{selectedPerson.hook}</div>
              </div>
            </div>
            <button
              type="button"
              className="primary-cta"
              onClick={() =>
                openSayHi(
                  selectedPerson.name,
                  selectedPerson.img,
                  `${
                    selectedPerson.who === 'traveller'
                      ? L('Traveller')
                      : L('Thai local')
                  } · ${Lf('Speaks {0}', selectedPerson.langs)}`,
                selectedPerson.id
              )
              }
            >
              {t.sayHi} · กริ๊ง!
            </button>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 12,
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  if (live) {
                    const target = selectedPerson.id;
                    void v5Once('report', async () => {
                      try {
                        await v5Report({ user: target, reason: 'profile-sheet' });
                      } catch (e) {
                        showToast(v5Msg(e));
                        return;
                      }
                      setSheet(null);
                      showToast(L('Reported · thank you. Our team reviews every report.'));
                    });
                    return;
                  }
                  setSheet(null);
                  showToast(
                    isDemo
                      ? `Reported ${selectedPerson.name} · our safety team reviews within 15 minutes`
                      : `Reported ${selectedPerson.name} · thank you`
                  );
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 12,
                  background: 'rgba(255,247,236,0.06)',
                  border: '1px solid rgba(255,247,236,0.12)',
                  color: '#FFF7EC',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {L("Report profile")}
              </button>
              <button
                type="button"
                onClick={() => handleBlockTarget(selectedPerson.id)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 12,
                  background: 'rgba(255,90,107,0.14)',
                  border: '1px solid rgba(255,90,107,0.35)',
                  color: '#FF5A6B',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Block {selectedPerson.name}
              </button>
            </div>
          </div>
        )}

        {sheet === 'inbox' && (
          <div className="v8-sheet full" id="sh-inbox">
            <div className="grab" />
            <div className="sh-head">
              <h3>{t.messages}</h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </div>

            {threads[0]?.plan && (
              <div
                className="plan-pin"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveThreadId(threads[0].id);
                  setSheet('thread');
                }}
              >
                <div className="ic">📍</div>
                <div className="txt">
                  <div className="k">{t.todaysPlan}</div>
                  <div className="t">{threads[0].plan.title}</div>
                  <div className="s">
                    {threads[0].plan.venue} · {threads[0].plan.area}
                  </div>
                </div>
              </div>
            )}

            {requests.length > 0 && (
              <div
                className="req-banner"
                id="reqBanner"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setReviewIdx(0);
                  setSheet('review');
                }}
              >
                <div className="avs">
                  {requests.slice(0, 3).map((r) => (
                    <img key={r.id} src={r.img} alt={r.name} />
                  ))}
                </div>
                <div className="txt">
                  <div className="t" id="reqTitle">
                    {requests.length} {t.peopleSaidHi}
                  </div>
                  <div className="s">{t.oneAtATime}</div>
                </div>
                <span className="cta">{t.review}</span>
              </div>
            )}

            {threads.length === 0 ? (
              <div
                style={{
                  padding: '38px 20px',
                  textAlign: 'center',
                  background: 'rgba(23,21,32,0.55)',
                  borderRadius: 18,
                  border: '1px solid rgba(255,247,236,0.1)',
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>
                  {t.emptyChatTitle}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'rgba(255,247,236,0.68)',
                    lineHeight: 1.5,
                  }}
                >
                  {t.emptyChatSub}
                </div>
              </div>
            ) : (
              <div className="chat-list">
                {threads.map((th) => (
                  <div
                    className="crow"
                    key={th.id}
                    onClick={() => {
                      setActiveThreadId(th.id);
                      setThreads((prev) =>
                        prev.map((item) =>
                          item.id === th.id ? { ...item, unread: false } : item
                        )
                      );
                      setSheet('thread');
                    }}
                  >
                    <img src={th.avatar} alt={th.name} className={th.official ? 'kt-logo' : undefined} />
                    <div className="m">
                      <div className="nm">
                        {th.name}{' '}
                        {th.official && <span className="kt-official" data-official="1">Official · ทางการ</span>}
                        {th.verified && !th.official && (
                          <span style={{ color: '#6EE7A8', fontSize: 11 }}>✓</span>
                        )}
                      </div>
                      <div className="last">{th.lastPreview}</div>
                    </div>
                    <div className="r">
                      <div className="tm">{th.timeLabel}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {sheet === 'review' && requests[reviewIdx] && (
          <div className="v8-sheet full" id="sh-review">
            <div className="grab" />
            <div className="sh-head">
              <h3>
                Said hi ({Math.min(reviewIdx + 1, requests.length)} of{' '}
                {requests.length})
              </h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet('inbox')}
              >
                ✕
              </button>
            </div>
            <div className="rev-card">
              <div
                className="img"
                style={{
                  backgroundImage: `url('${requests[reviewIdx].img}')`,
                }}
              >
                <div className="who">
                  <span className="nm">{requests[reviewIdx].name}</span>
                  {requests[reviewIdx].verified === true && (
                  <button
                    type="button"
                    className="v"
                    onClick={() => setSheet('verified')}
                  >
                    ✓ {t.verifiedLabel}
                  </button>
                  )}
                  <div className="sub">{requests[reviewIdx].meta}</div>
                </div>
              </div>
              <div className="body">
                <div className="msg">“{requests[reviewIdx].msg}”</div>
                <div className="qchips">
                  {[
                    'Hi! Nice to hear from you 👋',
                    'Where are you from?',
                    'Thanks for the tip!',
                  ].map((chip, idx) => (
                    <button
                      type="button"
                      className="qchip"
                      key={idx}
                      onClick={() => {
                        // V5: a quick reply is prefilled for the person to send (never sent on their behalf)
                        if (live) setChatInput(L(chip));
                        handleReviewDecision(true);
                      }}
                    >
                      {L(chip)}
                    </button>
                  ))}
                </div>
                <div className="rev-actions">
                  <button
                    type="button"
                    className="pass"
                    onClick={() => handleReviewDecision(false)}
                  >
                    {t.notNow}
                  </button>
                  <button
                    type="button"
                    className="reply"
                    onClick={() => handleReviewDecision(true)}
                  >
                    {t.reply} · กริ๊ง!
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {sheet === 'thread' && activeThread && (
          <div className="v8-sheet full" id="sh-thread">
            <div className="grab" />
            <div className="th-head">
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet('inbox')}
                aria-label="Back to inbox"
              >
                ‹
              </button>
              <img src={activeThread.avatar} alt={activeThread.name} className={activeThread.official ? 'kt-logo' : undefined}
                onClick={activeThread.official ? () => setSheet('official') : undefined} />
              <div className="who">
                <div className="nm">
                  {activeThread.name}{' '}
                  {activeThread.official && <span className="kt-official" data-official="1">Official · ทางการ</span>}
                  {activeThread.verified === true && !activeThread.official && (
                  <button
                    type="button"
                    onClick={() => setSheet('verified')}
                    style={{
                      background: 'none',
                      border: 0,
                      color: '#6EE7A8',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    ✓ {t.verifiedLabel}
                  </button>
                  )}
                </div>
                <div className="sub">
                  {activeThread.official ? L('Messages from the Kring team') : Lf('Speaks {0}', activeThread.langs)}
                </div>
              </div>
              <button
                type="button"
                className="shield"
                aria-label="Safety & block"
                onClick={() => { setSafetyFromChat(true); setSheet('safety'); }}
              >
                🛡
              </button>
            </div>

            <div className="msgs" id="threadMsgs">
              {activeThread.messages.map((m) => {
                // clean look (founder, 15 Nov): the bubble shows only the reader's language plus one tiny icon; a tap shows the original
                const tr = live ? chatTr.map[m.id] : undefined;
                const trText = tr?.s === 'ok' ? tr.text : (!live && m.sender === 'them' && m.translation ? m.translation : null);
                const orig = !!trText && !!trOrig[m.id];
                const shown = trText && !orig ? trText : m.text;
                return (
                <div
                  key={m.id}
                  data-msg-id={m.id}
                  data-tr={trText ? (orig ? 'orig' : (tr?.s === 'ok' ? tr.via : 'demo')) : undefined}
                  className={`bub ${m.sender === 'me' ? 'me' : 'them'}${trText ? ' go-trb' : ''}`}
                  {...(trText ? { role: 'button', tabIndex: 0, 'aria-pressed': orig,
                    'aria-label': `${shown}. ${orig ? L('Original. Tap to see the translation.') : L('Translated. Tap to see the original.')}`,
                    onClick: () => setTrOrig((p) => ({ ...p, [m.id]: !p[m.id] })),
                    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTrOrig((p) => ({ ...p, [m.id]: !p[m.id] })); } } } : {})}
                >
                  <span className={hasThaiScript(shown) ? 'th' : ''} data-text="1">{shown}</span>
                  {trText ? (
                    <svg className={`go-tri${orig ? ' on' : ''}`} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 5h9M8.5 3v2M6 5c.6 3 2.6 5.6 5.5 7M11 5c-.7 3.4-3 6.3-6.5 8" /><path d="M13 21l4-9 4 9M14.5 18h5" />
                    </svg>
                  ) : null}
                </div>
                );
              })}

              {activeThread.dealInvite && (
                <div className="deal2-card">
                  <div className="k">{L("Deal for two · Split at counter")}</div>
                  <div className="t">{activeThread.dealInvite.title}</div>
                  <div className="row">
                    <span>
                      <b>฿{activeThread.dealInvite.price}</b>{' '}
                      <s style={{ color: 'rgba(255,247,236,0.45)' }}>
                        ฿{activeThread.dealInvite.wasPrice}
                      </s>{' '}
                      ({formatTravellerCurrency(activeThread.dealInvite.price, dispCur)})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setThreads((prev) =>
                          prev.map((th) =>
                            th.id === activeThread.id && th.dealInvite
                              ? {
                                  ...th,
                                  dealInvite: {
                                    ...th.dealInvite,
                                    joined: true,
                                  },
                                }
                              : th
                          )
                        );
                        const dealObj =
                          deals.find(
                            (d) => d.id === activeThread.dealInvite?.dealId
                          ) || deals[0];
                        if (dealObj) handleClaimDeal(dealObj);
                      }}
                    >
                      {activeThread.dealInvite.joined ? 'Joined ✓' : 'Join'}
                    </button>
                  </div>
                </div>
              )}

              {activeThread.plan && (
                <div className="plan-card">
                  <div className="k">✓ {t.publicPlaceJustYouTwo}</div>
                  <div className="t">{activeThread.plan.title}</div>
                  <div className="s">
                    {activeThread.plan.venue} · {activeThread.plan.area}
                  </div>
                </div>
              )}
            </div>

            {plusMenuOpen && (
              <div className="plus-menu">
                <button
                  type="button"
                  className="pm"
                  onClick={() => {
                    setPlusMenuOpen(false);
                    handleSendChatMessage(
                      'Café by BTS Ari Exit 3 at 15:00 · public spot. Want to join?'
                    );
                  }}
                >
                  <b>📅</b>{L("Plan")}
                </button>
                <button
                  type="button"
                  className="pm"
                  onClick={() => {
                    setPlusMenuOpen(false);
                    handleSendChatMessage(
                      'Want to split a 2-for-1 coffee deal this afternoon?'
                    );
                  }}
                >
                  <b>🎟</b>{L("Deal")}
                </button>
                <button
                  type="button"
                  className="pm"
                  onClick={() => {
                    setPlusMenuOpen(false);
                    handleSendChatMessage('📸 Shared a photo from Ari');
                  }}
                >
                  <b>📷</b>{L("Photo")}
                </button>
                <button
                  type="button"
                  className="pm"
                  onClick={() => {
                    setPlusMenuOpen(false);
                    handleSendChatMessage('🎙 Voice note (0:06) · “See you by the garden table!”');
                  }}
                >
                  <b>🎙</b>{L("Voice")}
                </button>
              </div>
            )}

            {live && activeThread && (activeThread as V5Thread).v5Status === 'pending' && (activeThread as V5Thread).v5OpenedByMe && !activeThread.messages.some((m) => m.sender === 'them') && (
              <p id="v5Waiting" role="status" style={{ margin: '6px 14px', fontSize: 12.5, fontWeight: 700, opacity: 0.85 }}>
                {Lf('Waiting for {0} to reply. Chat opens when they do.', activeThread.name)}
              </p>
            )}
            <div className="composer">
              {!live && (
                <button
                  type="button"
                  className="plus"
                  aria-label="More chat attachments"
                  onClick={() => setPlusMenuOpen((v) => !v)}
                >
                  +
                </button>
              )}
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendChatMessage();
                }}
                placeholder={live ? L('Write a message…') : L("Write a message (Thai auto-translates)…")}
              />
              <button
                type="button"
                className="send"
                aria-label="Send message"
                onClick={() => handleSendChatMessage()}
              >
                ➤
              </button>
            </div>
          </div>
        )}

        {sheet === 'redeem' && activeRedeemDeal && (
          <div className="v8-sheet" id="sh-redeem">
            <div className="grab" />
            <div className="sh-head">
              <h3>{L("Show at counter · works offline")}</h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </div>
            <div className="ticket-box">
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0B0A12' }}>
                {dealVenue(activeRedeemDeal)} · {activeRedeemDeal.area}
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: '#0B0A12',
                  marginTop: 2,
                }}
              >
                {activeRedeemDeal.dealEn ? dealMain(activeRedeemDeal) : activeRedeemDeal.title}
              </div>
              {dealSub(activeRedeemDeal) ? (
                <div style={{ fontSize: 12, color: '#3A3A66', marginTop: 2 }}>{dealSub(activeRedeemDeal)}</div>
              ) : null}
              {live ? (
                activeRedeemDeal.code ? (
                  <V5Qr value={activeRedeemDeal.dealEn ? v5StaffUrl(activeRedeemDeal.code) : activeRedeemDeal.code} size={190} />
                ) : null
              ) : (
                <div className="qr" aria-label="Redemption QR code">
                  {renderQrCells(7)}
                </div>
              )}
              <div className="code">{activeRedeemDeal.code}</div>
              {live && activeRedeemDeal.dealEn ? (
                <div className="timer">
                  {L('Show this QR to the staff · one use only')}
                  {activeRedeemDeal.expiresAt
                    ? ` · ${Lf('Valid until {0}', new Date(activeRedeemDeal.expiresAt).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}`
                    : ''}
                </div>
              ) : (
              <div className="timer">
                {live ? (
                  <>
                    {L('Scan this pass at the counter')}
                    {activeRedeemDeal.validWindow ? ` · ${activeRedeemDeal.validWindow}` : ''} ·{' '}
                  </>
                ) : (
                  <>
                    {L("Valid for")} <b>{formatTimer(redeemSecondsLeft)}</b> ·{' '}
                  </>
                )}
                {Lf('Pay ฿{0} ({1}) at counter', String(activeRedeemDeal.now), formatTravellerCurrency(activeRedeemDeal.now, dispCur))}
              </div>
              )}
            </div>
          </div>
        )}

        {sheet === 'safety' && (
          <div className="v8-sheet" id="sh-safety">
            <div className="grab" />
            <div className="sh-head">
              <h3>{t.safety}</h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </div>
            <div className="sos-grid">
              <a
                className="sos"
                href="tel:1155"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="num">1155</div>
                <div className="lbl">{qx('touristPolice')}</div>
              </a>
              <a
                className="sos"
                href="tel:191"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="num">191</div>
                <div className="lbl">{qx('police')}</div>
              </a>
              <a
                className="sos"
                href="tel:1669"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="num">1669</div>
                <div className="lbl">{qx('ambulance')}</div>
              </a>
              <div
                className="sos"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSheet(null);
                  showToast(qx('embassyToast'));
                }}
                style={{ cursor: 'pointer' }}
              >
                <div className="num" style={{ color: '#FFF7EC' }}>
                  🏛
                </div>
                <div className="lbl">{qx('embassy')}</div>
              </div>
            </div>
            <div className="safe-list">
              <div
                className="srow"
                role="button"
                tabIndex={0}
                onClick={() =>
                  handleShareLink('My Bangkok café plan', 'tab=feed')
                }
              >
                <span>{qx('sharePlan')}</span>
                <span>›</span>
              </div>
              <div
                className="srow"
                role="button"
                tabIndex={0}
                onClick={() => {
                  const target = safetyFromChat ? activeThread?.personId : undefined;
                  if (!target) {
                    showToast(qx('pickFirst'));
                    return;
                  }
                  if (live) {
                    const threadId = activeThread?.id;
                    void v5Once('report', async () => {
                      try {
                        await v5Report({ user: target, reason: 'safety-sheet', thread: threadId });
                      } catch (e) {
                        showToast(v5Msg(e));
                        return;
                      }
                      setSheet(null);
                      showToast(L('Reported · thank you. Our team reviews every report.'));
                    });
                    return;
                  }
                  try {
                    const prev = JSON.parse(localStorage.getItem('kr8_reports') || '[]');
                    prev.push({ target, at: new Date().toISOString() });
                    localStorage.setItem('kr8_reports', JSON.stringify(prev));
                  } catch {
                    // ignore
                  }
                  setSheet(null);
                  showToast(qx('reportedToast'));
                }}
              >
                <span>{qx('report')}</span>
                <span>›</span>
              </div>
              <div
                className="srow"
                role="button"
                tabIndex={0}
                onClick={() =>
                  handleBlockTarget((safetyFromChat && activeThread?.personId) || 'user')
                }
                style={{ color: '#FF5A6B' }}
              >
                <span>{qx('block')}{safetyFromChat && activeThread?.name ? ` · ${activeThread.name}` : ''}</span>
                <span>✕</span>
              </div>
            </div>
          </div>
        )}

        {sheet === 'verified' && (
          <div className="v8-sheet" id="sh-verified">
            <div className="grab" />
            <div className="sh-head">
              <h3>{L("What “✓ verified” means")}</h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </div>
            <p
              style={{
                margin: '0 0 12px',
                fontSize: 13,
                color: 'rgba(255,247,236,0.82)',
                lineHeight: 1.55,
              }}
            >
              {L('A green “✓ verified” badge means this member did a live face check on their phone (look at the camera, turn left, turn right, blink) and a Kring team member compared it with their profile photo. It is not an ID check. The selfie is deleted 30 days after the review.')}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: 'rgba(255,247,236,0.65)',
                lineHeight: 1.5,
              }}
            >
              {L("Public places · In groups · Chats translated. Pick public cafés, BTS skywalks or lively food spots, and use the green shield in any chat for 1-tap help.")}
            </p>
          </div>
        )}

        {sheet === 'settings' && live && signedIn && v5Card && (
          <div className="v8-sheet kme-sheet" id="sh-settings" data-v="me-locked">
            <div className="grab" />
            <div className="sh-head">
              <h3>{t.settings}</h3>
              <button type="button" className="xbtn" aria-label="Close" onClick={() => setSheet(null)}>✕</button>
            </div>
            <div className="kme-grp">
              <div className="srow" role="button" tabIndex={0} id="setEditCard" onClick={() => setSheet('v5card')}>
                <span>{L('Edit profile')}</span><em>{L('photo, name, bio')} ›</em>
              </div>
              <div className="srow" role="button" tabIndex={0} id="setLangs" onClick={() => setSheet('v5card')}>
                <span>{L('Languages I speak')}</span><em>{(v5Card.langs || []).join(' · ')} ›</em>
              </div>
              <div className="srow" role="button" tabIndex={0} id="setWho" onClick={() => setSheet('v5card')}>
                <span>{L('I live here / Visiting')}</span><em>{v5Card.who === 'local' ? L('🏠 I live here') : L('✈ Visiting Bangkok')} ›</em>
              </div>
              <div className="srow" role="button" tabIndex={0} id="setInterests" onClick={() => setSheet('interests')}>
                <span>{L('Interests')}</span><em>{(v5Card.interests || []).length} ›</em>
              </div>
            </div>
            <div className="kme-grp">
              {pushConfigured() ? (
                <div className="srow" role="button" tabIndex={0} id="setNotif" data-push={pushSt} aria-busy={pushBusy} onClick={() => void togglePush()}>
                  <span>{L('Notifications')}<small className="kpa-sub" id="setNotifSub">{L(pushSubLine(pushSt))}</small></span>
                  <span className={`sw-ctrl ${pushSt === 'on' ? 'on' : ''}`} />
                </div>
              ) : (
                <div className="srow" role="button" tabIndex={0} id="setNotif" onClick={() => {
                  const next = !morningNotif;
                  setMorningNotif(next);
                  try { localStorage.setItem('kr8_morning_notif', next ? '1' : '0'); } catch { /* ignore */ }
                }}>
                  <span>{L('Notifications')}<small style={{ display: 'block', fontSize: 11.5, color: '#8E8AC0' }}>{t.morningNotif}</small></span>
                  <span className={`sw-ctrl ${morningNotif ? 'on' : ''}`} />
                </div>
              )}
              <div className="srow" role="button" tabIndex={0} id="setAppLang" onClick={() => setLangOpen((v) => !v)}>
                <span>{L('App language')}</span><em>{({ en: 'English', th: 'ไทย', zh: '中文', hi: 'हिन्दी', ja: '日本語', ko: '한국어' } as Record<string, string>)[lang]} ›</em>
              </div>
              {langOpen && (
                <div className="sub fchips lang-grid">
                  {([['en', 'English'], ['th', 'ไทย'], ['zh', '中文'], ['hi', 'हिन्दी'], ['ja', '日本語'], ['ko', '한국어']] as const).map(([code, label]) => (
                    <button type="button" key={code} data-app-lang={code} className={`fchip ${lang === code ? 'on' : ''}`} onClick={() => setLang(code)}>{label}</button>
                  ))}
                </div>
              )}
              <div className="srow" role="button" tabIndex={0} id="setCalm" onClick={() => setCalmMode((v) => !v)}>
                <span>{t.calmColours}</span><span className={`sw-ctrl ${calmMode ? 'on' : ''}`} />
              </div>
            </div>
            <div className="kme-grp">
              <div className="srow" role="button" tabIndex={0} id="setPdpa" onClick={() => setSheet('pdpa')}>
                <span>{L('Privacy and your data')}</span><em>›</em>
              </div>
              <div className="srow" role="button" tabIndex={0} id="setBlocked" onClick={() => setSheet('blocked')}>
                <span>{L('Blocked people')}</span><em>›</em>
              </div>
              <div className="srow" role="button" tabIndex={0} id="setSafety" onClick={() => { setSafetyFromChat(false); setSheet('safety'); }}>
                <span>{L('Safety and emergency')}</span><em>1155 ›</em>
              </div>
            </div>
            <div className="kme-grp">
              <a className="srow" id="setContact" href="mailto:ops@kringapp.com">
                <span>{L('Help and contact')}</span><em>ops@kringapp.com ›</em>
              </a>
              <div className="srow" role="button" tabIndex={0} id="setLegal" onClick={() => setLegalOpen((v) => !v)}>
                <span>{L('Legal & privacy')}</span><em>{legalOpen ? '⌄' : '›'}</em>
              </div>
              {legalOpen && (
                <>
                  <a className="srow" id="setTerms" href="/terms.html" target="_blank" rel="noopener"><span>{L('Terms')}</span><em>↗</em></a>
                  <a className="srow" id="setPrivacy" href="/privacy.html" target="_blank" rel="noopener"><span>{L('Privacy notice')}</span><em>↗</em></a>
                  <a className="srow" id="setPartnerTerms" href="/partner-terms.html" target="_blank" rel="noopener"><span>{L('Partner terms')}</span><em>↗</em></a>
                </>
              )}
              <div className="srow bad" role="button" tabIndex={0} id="setSignOut" onClick={() => {
                void pushDisable().catch(() => undefined).finally(() => v5SignOut());   // this phone stops dinging for the member signing out
                setSignedIn(false);
                try { localStorage.removeItem('kr8_signed_in'); } catch { /* ignore */ }
                setSheet(null);
                showToast(L('Signed out'));
              }}>
                <span>{t.signOut}</span>
              </div>
              <div className="srow bad" role="button" tabIndex={0} id="setDelete" onClick={() => { setSheet('pdpa'); setConfirmDelete(true); }}>
                <span>{L('Delete account')}</span>
              </div>
            </div>
          </div>
        )}
        {sheet === 'settings' && !(live && signedIn && v5Card) && (
          <div className="v8-sheet" id="sh-settings">
            <div className="grab" />
            <div className="sh-head">
              <h3>{t.settings}</h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </div>
            <div className="safe-list">
              <div className="srow" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontWeight: 700 }}>{t.language}</span>
                <div className="fchips lang-grid">
                  {(
                    [
                      ['en', 'English'],
                      ['th', 'ไทย'],
                      ['zh', '中文'],
                      ['hi', 'हिन्दी'],
                      ['ja', '日本語'],
                      ['ko', '한국어'],
                    ] as const
                  ).map(([code, label]) => (
                    <button
                      type="button"
                      key={code}
                      className={`fchip ${lang === code ? 'on' : ''}`}
                      onClick={() => setLang(code)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="srow"
                role="button"
                tabIndex={0}
                onClick={() => {
                  const next = !morningNotif;
                  setMorningNotif(next);
                  try {
                    localStorage.setItem('kr8_morning_notif', next ? '1' : '0');
                  } catch {
                    // ignore
                  }
                }}
              >
                <span>{t.morningNotif}</span>
                <span className={`sw-ctrl ${morningNotif ? 'on' : ''}`} />
              </div>

              <div
                className="srow"
                role="button"
                tabIndex={0}
                onClick={() => setCalmMode((v) => !v)}
              >
                <span>{t.calmColours}</span>
                <span className={`sw-ctrl ${calmMode ? 'on' : ''}`} />
              </div>

              <div
                className="srow"
                role="button"
                tabIndex={0}
                onClick={() => { setSafetyFromChat(false); setSheet('safety'); }}
              >
                <span>{t.safety}</span>
                <span>›</span>
              </div>

              <div
                className="srow"
                role="button"
                tabIndex={0}
                onClick={() => setSheet('pdpa')}
              >
                <span>{t.privacyPdpa}</span>
                <span>›</span>
              </div>

              {live && signedIn && v5Card && (
                <div className="srow" role="button" tabIndex={0} id="setEditCard" onClick={() => setSheet('v5card')}>
                  <span>{L('Edit my card')}</span>
                  <span>›</span>
                </div>
              )}
              {live && signedIn && (
                <div className="srow" role="button" tabIndex={0} id="setBlocked" onClick={() => setSheet('blocked')}>
                  <span>{L('Blocked people')}</span>
                  <span>›</span>
                </div>
              )}
              {/* polish #14: Terms / Privacy / Partner terms in one "Legal & privacy" row */}
              <div className="srow" role="button" tabIndex={0} id="setLegal" onClick={() => setLegalOpen((v) => !v)}>
                <span>{L('Legal & privacy')}</span>
                <span>{legalOpen ? '⌄' : '›'}</span>
              </div>
              {legalOpen && (
                <>
                  <a className="srow sub-row" id="setTerms" href="/terms.html" target="_blank" rel="noopener" style={{ color: 'inherit', textDecoration: 'none' }}><span>{L('Terms')}</span><span>↗</span></a>
                  <a className="srow sub-row" id="setPrivacy" href="/privacy.html" target="_blank" rel="noopener" style={{ color: 'inherit', textDecoration: 'none' }}><span>{L('Privacy notice')}</span><span>↗</span></a>
                  <a className="srow sub-row" id="setPartnerTerms" href="/partner-terms.html" target="_blank" rel="noopener" style={{ color: 'inherit', textDecoration: 'none' }}><span>{L('Partner terms')}</span><span>↗</span></a>
                </>
              )}
              <a className="srow" id="setContact" href="mailto:ops@kringapp.com" style={{ color: 'inherit', textDecoration: 'none' }}>
                <span>{L('Contact us')} · ops@kringapp.com</span>
                <span>✉</span>
              </a>

{signedIn && (
              <div
                className="srow"
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (live) void v5SignOut();
                  setSignedIn(false);
                  try {
                    localStorage.removeItem('kr8_signed_in');
                  } catch {
                    // ignore
                  }
                  setSheet(null);
                  showToast(L("Signed out"));
                }}
                style={{ color: '#FF5A6B' }}
              >
                <span>{t.signOut}</span>
                <span>›</span>
              </div>
              )}
            </div>
          </div>
        )}

        {sheet === 'pdpa' && (
          <div className="v8-sheet" id="sh-pdpa">
            <div className="grab" />
            <div className="sh-head">
              <h3>{t.privacyPdpa}</h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet('settings')}
              >
                ✕
              </button>
            </div>
            <p
              style={{
                margin: '0 0 12px',
                fontSize: 12,
                color: 'rgba(255,247,236,0.75)',
                lineHeight: 1.5,
              }}
            >
              {qx('pdpaIntro')}
            </p>
            <div className="safe-list">
              <div
                className="srow"
                role="button"
                tabIndex={0}
                onClick={handleDownloadPdpaJson}
              >
                <span>{qx('download')}</span>
                <span>⬇</span>
              </div>
              <div
                className="srow"
                role="button"
                tabIndex={0}
                onClick={() => setConfirmDelete(true)}
                style={{ color: '#FF5A6B' }}
              >
                <span>{qx('deleteRow')}</span>
                <span>✕</span>
              </div>
            </div>
            {confirmDelete && (
              <div className="del-confirm" role="alertdialog" aria-label={qx('deleteRow')}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>{qx('deleteQ')}</div>
                <div>{live ? L('This permanently deletes your Kring account, card, posts, chats and claimed treats from our servers. It can’t be undone.') : qx('deleteBody')}</div>
                <div className="row">
                  <button type="button" className="no" onClick={() => setConfirmDelete(false)}>
                    {qx('cancel')}
                  </button>
                  <button type="button" className="yes" onClick={handleDeleteAccount}>
                    {qx('deleteYes')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {sheet === 'mycode' && (
          <div className="v8-sheet" id="sh-mycode">
            <div className="grab" />
            <div className="sh-head">
              <h3>{live ? L('Share card') : `${t.myCode} · Connect in person`}</h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </div>
            {live && v5Uid ? (
              /* 17 Nov: a clean member pass: name + member no. + white QR, then Save image / Share */
              <V5ShareCard L={L}
                p={{ name: meProfile?.first_name || user.name, no: kxMe?.member_no ?? (v5Card as { member_no?: number | null } | null)?.member_no ?? null,   /* same number as the card on Me */ photo: meProfile?.photo || null, who: meProfile?.who === 'local' ? 'local' : 'traveller', link: v5ProfileLink(v5Uid) }}
                onShare={() => { if (meProfile) void shareProfile(meProfile); }}
                onSaved={(ok) => showToast(ok ? L('Card saved') : L('Could not save the image. Take a screenshot instead.'))} />
            ) : (
              <div className="ticket-box">
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0B0A12' }}>
                  {user.name} · {user.langs}
                </div>
                <div className="qr" aria-label="Personal Kring QR code">
                  {renderQrCells(5)}
                </div>
                <div className="timer">
                  {L("Scan at a café to connect &amp; log your Bangkok passport stamp")}
                </div>
              </div>
            )}
          </div>
        )}

        {sheet === 'reelshare' && activeReel && (
          <div className="v8-sheet" id="sh-reelshare">
            <div className="grab" />
            <div className="sh-head">
              <h3>{L('Share this Reel')}</h3>
              <button type="button" className="xbtn" aria-label="Close" onClick={() => setSheet(null)}>✕</button>
            </div>
            <div className="reel-share-list">
              <button type="button" className="reel-share line" id="shareLine" onClick={() => void shareReel(activeReel, 'line')}>
                <span className="ic">LINE</span>{L('Share to LINE')}
              </button>
              <button type="button" className="reel-share" id="shareCopy" onClick={() => void shareReel(activeReel, 'copy')}>
                <span className="ic">🔗</span>{L('Copy link')}
              </button>
              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                <button type="button" className="reel-share" id="shareNative" onClick={() => void shareReel(activeReel, 'native')}>
                  <span className="ic">↗</span>{L('More apps')}
                </button>
              )}
            </div>
          </div>
        )}
        {sheet === 'reelmore' && activeReel && (
          <div className="v8-sheet" id="sh-reelmore">
            <div className="grab" />
            <div className="sh-head">
              <h3>{reportStep ? L('Report this Reel') : L('More')}</h3>
              <button type="button" className="xbtn" aria-label="Close" onClick={() => setSheet(null)}>✕</button>
            </div>
            {!reportStep ? (
              /* polish extra: "…" opens a short menu first; the report reasons are a second step */
              <div className="reel-share-list" id="reelMoreMenu">
                <button type="button" className="reel-share" id="reelMoreShare" onClick={() => openReelSheet(activeReel, 'reelshare')}><span className="ic">↗</span>{L('Share')}</button>
                <button type="button" className="reel-share" id="reelMoreSave" onClick={() => { handleToggleSave(activeReel.id); setSheet(null); }}><span className="ic">🔖</span>{activeReel.id && savedIds[activeReel.id] ? t.saved : t.save}</button>
                <button type="button" className="reel-share" id="reelNotInterested" onClick={() => handleNotInterested(activeReel)}><span className="ic">🙈</span>{L('Not interested')}</button>
                <button type="button" className="reel-share danger" id="reelMoreReport" onClick={() => setReportStep(true)}><span className="ic">⚑</span>{L('Report')}</button>
              </div>
            ) : (
              <>
                <p className="reel-report-q">{L('Why are you reporting it?')}</p>
                <div className="reel-share-list">
                  {([
                    ['spam', 'Spam or scam'],
                    ['unsafe', 'Unsafe, adult or harassment'],
                    ['stolen', 'Stolen clip or pretending to be someone'],
                    ['wrong_place', 'Wrong place or the place is closed'],
                    ['block', 'Block this Local'],
                  ] as [V5ReportReason, string][]).map(([reason, label]) => (
                    <button type="button" key={reason} className={`reel-share${reason === 'block' ? ' danger' : ''}`} data-reason={reason}
                      onClick={() => handleReportReel(activeReel, reason)}>
                      {L(label)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {live && (!sheet || installAsking) && <A2HSBanner L={L} blocked={['preparing', 'uploading', 'saving'].includes(reelStage)} onClose={installAskDone} />}
        {live && <EscapeScreen L={L} lang={lang} liff={isLiffOpen(typeof location === 'undefined' ? '' : location.search, typeof navigator === 'undefined' ? '' : navigator.userAgent)} signedIn={signedIn} authReady={v5AuthReady} />}
        {live && signedIn && !!v5Card && !sheet && !goPlayer && !installAsking && (
          <PushAskCard L={L} lang={lang} toast={showToast} onInstallHelp={openInstallSheet} blocked={['preparing', 'uploading', 'saving'].includes(reelStage)} />
        )}
        {updateReady ? <button type="button" className="kr-upd" id="appUpdate" onClick={() => location.reload()}>{L('New update · tap to refresh')}</button> : null}
        {sheet === 'standhow' && standHowDeal && (
          <StandHowSheet L={L} venue={dealVenue(standHowDeal)} area={standHowDeal.area} treat={dealMain(standHowDeal)} mapsUrl={standHowDeal.mapsUrl}
            busy={hereBusy} onHere={() => openHerePass(standHowDeal)} onClose={() => setSheet(null)} />
        )}
        {sheet === 'ticket' && live && standOpen && (
          <V5TicketSheet L={L} lang={lang} slug={standOpen.slug} src={standOpen.src} lat={standOpen.lat} lng={standOpen.lng} signedIn={signedIn && !!v5Card} authReady={v5AuthReady}
            onSignIn={() => { pendingActionRef.current = () => { setSheet('ticket'); }; setSignInNotice(''); setSheet(v5Uid && !v5Card ? 'v5card' : 'signin'); }}
            onClose={closeTicket}
            onSettled={() => { standRef.current = null; try { sessionStorage.removeItem('kr8_stand'); } catch { /* ignore */ } }}
            onDeals={() => { closeTicket(); setTab('deals'); }} />
        )}
        {sheet === 'verify' && live && v5Card && (
          <V5VerifySheet L={L} photo={v5Card.photo} errText={(e) => v5Msg(e)}
            onClose={() => { setSheet(null); void loadMe(); }}
            onSent={() => setVerifyPending(true)}
            onAddPhoto={() => setSheet('v5card')} />
        )}
        {sheet === 'follow' && followFor && (
          <FollowSheet L={L} Lf={Lf} who={followFor.name} counts={followFor.counts} initial={followFor.initial}
            load={(k) => v5FollowList(followFor.user, k)}
            onToggle={(r: V5FollowRow) => toggleFollow(r.user_id, r.i_follow)}
            onPerson={(id) => void openProfile(id)}
            onClose={() => { setSheet(null); void loadMe(); }} />
        )}
        {sheet === 'activity' && (
          <ActivitySheet L={L} Lf={Lf} rows={activityRows} posters={mePosters} onClose={() => setSheet(null)} seenAt={activitySeenAt}
            onMarkRead={() => { setActivityUnread(false); try { localStorage.setItem('kr8_activity_seen', activityRows?.[0]?.at || new Date().toISOString()); } catch { /* ignore */ } }}
            onFollowBack={async (id) => { await toggleFollow(id, false); void loadMe(); }}
            onPerson={(id) => void openProfile(id)} onReel={openReelFromProfile} />
        )}
        {sheet === 'interests' && (
          <InterestsSheet L={L} Lf={Lf} value={v5Card?.interests || []} all={V5_INTERESTS} onClose={() => setSheet('settings')}
            onSave={async (v) => {
              try {
                const saved = await v5SetInterests(v);
                setV5Card((c) => (c ? { ...c, interests: saved } : c));
                showToast(L('Saved'));
                setSheet('settings');
              } catch (e) {
                showToast(v5Msg(e));
              }
            }} />
        )}
        {sheet === 'profile' && otherProfile && (
          <GoProfilePage L={L} Lf={Lf} lang={lang} p={otherProfile} reels={goOtherReels} busy={followBusy} gender={goOtherGender}
            onBack={() => setSheet(null)}
            onList={(k) => openFollowList(otherProfile, k)}
            onFollow={() => void handleProfileFollow()}
            onHi={() => openSayHi(otherProfile.first_name, otherProfile.photo || initialAvatar(otherProfile.first_name), Lf('Speaks {0}', (otherProfile.langs || []).join(' · ')), otherProfile.user_id)}
            onReport={() => requireSignInForAction(() => void v5Once('report-p', async () => {
              try { await v5Report({ user: otherProfile.user_id, reason: 'profile-sheet' }); showToast(qx('reportedToast')); } catch (e) { showToast(v5Msg(e)); }
            }))}
            onBlock={() => requireSignInForAction(() => void v5Once('block-p', async () => {
              try {
                await v5Block(otherProfile.user_id);
                setBlockedIds((prev) => Array.from(new Set([...prev, otherProfile.user_id])));
                setSheet(null);
                showToast(qx('blockedToast'));
                v5Feed().then(setFeedItems).catch(() => undefined);
              } catch (e) { showToast(v5Msg(e)); }
            }))}
            onShare={() => void shareProfile(otherProfile)}
            onMath={() => setKxMathFor(otherProfile.user_id)}
            onOpen={(i) => goOpenPlayer((goOtherReels?.reels || []).map((r) => gridToGo(r, { id: otherProfile.user_id, name: otherProfile.first_name, photo: otherProfile.photo, handle: kxOther?.ig_handle || otherProfile.ig_handle }, false)), i)}
            kx={kxOther} />
        )}
        {sheet === 'post' && live && placeSearchOpen && (
          <PlaceSearchPage L={L} Lf={Lf} lang={lang} picked={postPlaces} toast={showToast} onBack={() => setPlaceSearchOpen(false)}
            onDone={(list) => { setPostPlaces(list); if (list[0] && !postArea) setPostArea(list[0].kr_area || 'Bangkok'); setPlaceSearchOpen(false); }} />
        )}
        {sheet === 'rewards' && live && (
          <RewardsPage L={L} Lf={Lf} lang={lang} data={kxRewards} fallbackWeek={kxMe?.week ?? 0}
            onBack={() => setSheet(null)} onClaim={(p) => { setKxPrizeSel(p); setSheet('claim'); }}
            onCode={(id) => { setKxClaimFocus({ id, fresh: false }); setSheet('claimed'); }}
            onHistory={() => { setKxClaimFocus({ id: null, fresh: false }); setSheet('claimed'); }}
            onRanking={() => setSheet('ranking')} onMath={() => setKxMathFor(v5Uid || null)} />
        )}
        {sheet === 'claim' && live && (
          <ClaimPage L={L} Lf={Lf} lang={lang} data={kxRewards} prize={kxPrizeSel} toast={showToast} onBack={() => setSheet('rewards')}
            onDone={(r: KxClaimResult) => {
              a2hsMoment('claim');   // J: install nudge after a claim (shows once the claim screen is closed)
              void kxLoadRewards();
              setKxReady(false);
              setKxClaimFocus({ id: r.claim_id, fresh: r.status === 'assigned' });
              if (r.status === 'assigned') triggerRingBurst();
              else showToast(L('Your code is on the way'));
              setSheet('claimed');
            }} />
        )}
        {sheet === 'claimed' && live && (
          <ClaimedPage key={kxClaimFocus.id || 'h'} L={L} Lf={Lf} lang={lang} data={kxRewards} focus={kxClaimFocus.id} fresh={kxClaimFocus.fresh} toast={showToast}
            onClose={() => setSheet('rewards')} onChanged={() => void kxLoadRewards()} />
        )}
        {goPlayer && live && (
          <GoReelPlayer L={L} Lf={Lf} lang={lang} reels={goPlayer.reels} start={goPlayer.start} title={goPlayer.title} viewProfile={goPlayer.viewProfile}
            onClose={() => setGoPlayer(null)}
            onProfile={(id) => { setGoPlayer(null); void openProfile(id); }}
            onPlace={(id) => kxOpenPlace(id, null, true)}
            onMath={(id) => setKxMathFor(id)}
            onLike={goLike} onSave={goSave} onShare={(id) => void kxShareReelId(id)}
            onStats={live && v5Uid ? async (id) => {
              // 17 Nov "My Reel stats": likes/saves from the Reel; opens + Rings from this week's ranking math (same numbers as "See the math")
              const r = goPlayer.reels.find((x) => x.id === id);
              const b = await kxBreakdown(v5Uid).catch(() => null);
              const m = b?.reels.find((x) => x.post_id === id) || null;
              const f = feedItems.find((x) => x.id === id) as { views?: number } | undefined;
              return { views: typeof f?.views === 'number' ? f.views : null, likes: r?.likes || 0, saves: r?.saves || 0, opens: m ? m.opens : null, rings: r?.rings ?? (m ? m.score : null), travellers: m ? m.l_trav + m.s_trav : 0 };
            } : undefined}
            onActive={(r, el) => {
              if (!r.mine || r.status !== 'approved') return;
              setTimeout(() => coachTry((r.rings || 0) > 0 ? ['score', 'share'] : ['share'], (k) => (k === 'score'
                ? { el: el.querySelector('[data-go="score"]'), text: L('Tap to see where your Rings came from') }
                : { el: el.querySelector('[data-go="share"] .go-rbi'), text: L('Share to IG or TikTok. Each person who opens the link = +5 Rings.') })), 700);
            }} />
        )}
        {coachSpot && live && <GoCoach L={L} spot={coachSpot} onDone={() => { coachMark(coachRef.current, coachSpot.key as CoachKey, !!v5Uid && !!v5Card); setCoachSpot(null); }} />}
        {sheet === 'ranking' && live && (
          <RankingPage L={L} Lf={Lf} lang={lang} myArea={v5Card?.area || null} myPhoto={v5Card?.photo || null} myName={v5Card?.first_name || ''} myId={v5Card ? v5Uid || null : null}
            onBack={() => setSheet(null)} onPerson={(id) => void goOpenBest(id)} onPost={() => requireSignInForAction(() => kxPostAt())}
            onShare={(reel) => void kxShareReelId(reel)}
            needsVerify={!!meProfile && !meProfile.verified && !verifyPending} onVerify={() => setSheet('verify')} />
        )}
        {sheet === 'result' && live && kxResult && (
          <ResultPage L={L} Lf={Lf} lang={lang} r={kxResult} photo={v5Card?.photo || null} name={v5Card?.first_name || ''} level={kxMe?.level ?? 1} no={kxMe?.member_no ?? (v5Card as { member_no?: number } | null)?.member_no ?? null}
            onClose={() => setSheet(null)} onPost={() => kxPostAt()} onShare={(reel) => void kxShareReelId(reel)}
            onClaim={(id) => {
              const amount = kxResult.prize?.amount ?? 0;
              setKxPrizeSel({ id, kind: 'weekly', week: kxResult.week, rank: kxResult.rank, founding_no: null, amount, rings: kxResult.rings, status: 'won', claim_id: null, created_at: '' });
              void kxLoadRewards();
              setSheet('claim');
            }} />
        )}
        {sheet === 'savedreels' && live && (
          <SavedReelsPage L={L} Lf={Lf} rows={kxSaved} onBack={() => setSheet(null)} onBrowse={() => { setSheet(null); setTab('feed'); }} />
        )}
        {kxMathFor && live && (sheet === 'rewards' || sheet === 'profile' || !!goPlayer) && (
          <MathSheet L={L} Lf={Lf} lang={lang} user={kxMathFor} onClose={() => setKxMathFor(null)} onHow={() => { setKxMathFor(null); setKxHow(true); }}
            onShare={(reel) => { setKxMathFor(null); if (reel) void kxShareReelId(reel); else kxPostAt(); }} />
        )}
        {kxHow && live && (sheet === 'rewards' || sheet === 'profile' || !!goPlayer) && <HowSheet L={L} onClose={() => setKxHow(false)} />}
        {sheet === 'place' && live && kxPlaceId && (
          <PlacePage key={kxPlaceId} L={L} Lf={Lf} lang={lang} id={kxPlaceId} toast={showToast} onBack={() => setSheet(null)} half={kxPlaceHalf.half} preview={kxPlaceHalf.preview}
            shareUrl={(id) => `${location.origin}${import.meta.env.BASE_URL}?place=${encodeURIComponent(id)}`}
            onPost={(p) => requireSignInForAction(() => kxPostAt(p))} />
        )}
        {sheet === 'official' && (
          // 0073: minimal official card for the Kring Team account (no Say hi, no Follow, no Report-a-member flow)
          <div className="v8-sheet" id="sh-official">
            <div className="grab" />
            <div className="sh-head">
              <h3>Kring Team</h3>
              <button type="button" className="xbtn" aria-label="Close" onClick={() => setSheet(activeThreadId ? 'thread' : null)}>✕</button>
            </div>
            <div className="kt-card">
              <img src={kringTeamLogo()} alt="" className="kt-logo big" />
              <div>
                <b>Kring Team</b> <span className="kt-official" data-official="1">Official · ทางการ</span>
                <p lang="th">บัญชีทางการของ กริ๊ง! สำหรับส่งข่าวและตอบแชท</p>
                <p lang="en" className="en">Kring’s official account for news and chat replies.</p>
              </div>
            </div>
          </div>
        )}
        {sheet === 'blocked' && (
          <div className="v8-sheet" id="sh-blocked">
            <div className="grab" />
            <div className="sh-head">
              <h3>{L('Blocked people')}</h3>
              <button type="button" className="xbtn" aria-label="Close" onClick={() => setSheet('settings')}>✕</button>
            </div>
            {blockList === null ? (
              <p className="reel-report-q">…</p>
            ) : blockList.length === 0 ? (
              <p className="reel-report-q" id="blockedEmpty">{L('No one blocked')}</p>
            ) : (
              <div className="safe-list">
                {blockList.map((b) => (
                  <div className="srow" key={b.user_id} data-blocked={b.user_id}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img src={b.photo || NEUTRAL_IMG} alt="" style={{ width: 32, height: 32, borderRadius: 10, objectFit: 'cover' }} />
                      {b.first_name}
                    </span>
                    <button type="button" className="fchip" data-unblock={b.user_id} onClick={() => handleUnblock(b)}>{L('Unblock')}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {sheet === 'saved' && (
          <div className="v8-sheet" id="sh-saved">
            <div className="grab" />
            <div className="sh-head">
              <h3>{t.savedPlacesPosts}</h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </div>
            {savedFeedItems.length === 0 ? (
              <div
                style={{
                  padding: '28px 18px',
                  textAlign: 'center',
                  background: 'rgba(23,21,32,0.55)',
                  borderRadius: 16,
                  border: '1px solid rgba(255,247,236,0.1)',
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>
                  {t.emptySavedTitle}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,247,236,0.68)' }}>
                  {t.emptySavedSub}
                </div>
              </div>
            ) : (
              <div className="safe-list">
                {savedFeedItems.map((item) => (
                  <div className="srow" key={item.id}>
                    <div>
                      <div style={{ fontWeight: 800 }}>
                        {item.name} · {item.area || 'Bangkok'}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'rgba(255,247,236,0.68)',
                          marginTop: 2,
                        }}
                      >
                        {item.cap}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleSave(item.id)}
                      style={{
                        background: 'none',
                        border: 0,
                        color: '#FF4FA3',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {L("Remove")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {sheet === 'passport' && (
          <div className="v8-sheet" id="sh-passport">
            <div className="grab" />
            <div className="sh-head">
              <h3>{t.rewardsPassport}</h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </div>
            <div className="trip-opts" style={{ marginBottom: 12 }}>
              <button
                type="button"
                className={user.role === 'traveller' ? 'on' : ''}
                onClick={() => setUser((u) => ({ ...u, role: 'traveller' }))}
              >
                {L("Traveller Passport")}
              </button>
              <button
                type="button"
                className={user.role === 'local' ? 'on' : ''}
                onClick={() => setUser((u) => ({ ...u, role: 'local' }))}
              >
                {L("Thai Local Streak")}
              </button>
            </div>
            {user.role === 'traveller' ? (
              <div className="wx-card">
                <div className="wx-top">
                  <div style={{ fontSize: 18, fontWeight: 800 }}>
                    {user.tripTotalDays > 0 ? `Day ${user.tripDay} of ${user.tripTotalDays} in Bangkok` : L('Your Bangkok trip')}
                  </div>
                  <span className="wx-day">{L("Trip Collection")}</span>
                </div>
                <div className="safe-list">
                  <div className="srow">
                    <span>{L("🎟 Venue deals claimed")}</span>
                    <b>{Object.keys(claimedDeals).length}</b>
                  </div>
                  <div className="srow">
                    <span>{L("👋 New friends over coffee")}</span>
                    <b>{isDemo ? 2 : 0}</b>
                  </div>
                </div>
              </div>
            ) : (
              <div className="wx-card">
                <div className="wx-top">
                  <div style={{ fontSize: 18, fontWeight: 800 }}>
                    🔥 {user.streakDays}-day Bangkok Streak
                  </div>
                  <span className="wx-day">
                    {user.freeSkipsLeft} free skips left
                  </span>
                </div>
                <div className="wx-pick">
                  <div className="k">{L("Daily helper reward")}</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    Answer 3 traveller questions a day ({user.questionsAnsweredToday}
                    /3 today)
                    {isDemo ? ' to unlock a coffee treat at partner cafés.' : '.'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {sheet === 'editprofile' && (
          <div className="v8-sheet" id="sh-editprofile">
            <div className="grab" />
            <div className="sh-head">
              <h3>{t.editProfile}</h3>
              <button
                type="button"
                className="xbtn"
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                className="hi-box"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={L("Your name")}
              />
              <input
                className="hi-box"
                value={editLangs}
                onChange={(e) => setEditLangs(e.target.value)}
                placeholder={L("Languages (e.g. EN · HI)")}
              />
              <input
                className="hi-box"
                value={editHook}
                onChange={(e) => setEditHook(e.target.value)}
                placeholder={L("One-line interest hook")}
              />
              <button
                type="button"
                className="primary-cta"
                onClick={() => {
                  const updated = {
                    ...user,
                    name: editName.trim() || user.name,
                    langs: editLangs.trim() || user.langs,
                    hook: editHook.trim() || user.hook,
                  };
                  setUser(updated);
                  try {
                    localStorage.setItem('kr8_user', JSON.stringify(updated));
                  } catch {
                    // ignore
                  }
                  setSheet(null);
                  showToast(L("Profile updated"));
                }}
              >
                {L("Save profile")}
              </button>
            </div>
          </div>
        )}

        {/* Inline <1s Kring Colliding Rings Burst (only mounted during burst) */}
        {burstActive && (
          <div className="ring-burst" id="ringBurst">
            <div className="pair">
              <span className="a" />
              <span className="b" />
            </div>
          </div>
        )}

        {/* Toast Notification (only mounted when active) */}
        {toastMsg && (
          <div className="v8-toast" id="toast">
            {toastMsg}
          </div>
        )}
      </div>
    </div>
  );
};

export const KringAppV8: React.FC<{ initialTab?: V8Tab }> = (props) => (
  <V8ErrorBoundary>
    <KringAppV8Inner {...props} />
  </V8ErrorBoundary>
);

export default KringAppV8;
