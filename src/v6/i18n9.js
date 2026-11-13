/* v6.5 Settle-at-Check-In ("Meet & Settle", A-09 + D-054), Host Stripe Payment Link (A-20),
   3-Tier Booking Tickets & Volunteer Hosts (D-053 + D-055), and Public Meeting-Place Picker (A-13). */
(function(){
const T=(typeof window!=='undefined'&&window.KR_T)?window.KR_T:{};
const K=[
  'ckTitle','ckSub','ckGpsOk','ckBleStub','ckTapBump','ckBumping','ckHostConf','ckFeeCharged',
  'ckPayTitle','ckPayRule','ckQrPersonal','ckQrMerchant','ckNoMerchantNote','ckOpenBank','ckSaveQr','ckShowQr',
  'ckUploadSlip','ckCapturing','ckPaidCash','ckHostConfCash','ckVerifiedTitle','ckVerifiedSub','ckContinueRate',
  'ckRefLabel','ckCodeFallback',
  'suggestPlace','acceptPlace','placeNotAllowed','placeAccepted','searchPublicPlacePh',
  'ckSettleTitle','ckTicketUsed','ckHostReceivedBtn','ckHostNotReceivedBtn','ckHostCancelUnsettledBtn',
  'ckShowMyTransfer','ckStripePayBtn','ckStripeSub','ckWisePlanB','ckVoucherUnlocked','ckVolunteerImmediate',
  'ckForfeitedTitle','ckForfeitedSub','ckNoGuidingNote'
];
const V={
en:[
  "Meet & settle","Settle with your host at check-in","Within 100 m of meeting point · GPS ready","Two-tap check-in ready (host + guest)","We’ve met · confirm check-in","Confirming check-in · waiting for {host}…","Check-in confirmed within 100 m!","Booking Ticket marked used at check-in",
  "Settle with {host}: {amt}","Settle directly with your host at check-in before the activity timer starts.","Thai or Singapore bank app (Personal PromptPay)","Asian wallet (Alipay+, Touch 'n Go, QRIS, Wise, TAGTHAi…)","Exact cash at check-in · pay {host} directly and {host} will tap Received ✓.","Open bank app","Save QR","Show QR",
  "Show my transfer (upload slip)","Reading slip QR & verifying transfer…","Paid exact cash at check-in","{host} tapped Received ✓","Settled ✓ · {amt} paid to {host}","Activity timer started · venue voucher unlocked on both phones","Continue to rate & next",
  "Kring ref","Use 6-digit code instead",
  "Suggest a place","Accept meeting place","Kring meetings happen in public places. Try a café, park, market or landmark nearby.","Meeting place agreed","Search café, park, MRT, market or landmark…",
  "Settle with {host}: {amt}","Booking Ticket marked used · settle to start timer & unlock voucher","Received ✓","Not received yet (2-min slip check)","Guest did not settle — cancel meetup",
  "Show my transfer (2-min window)","Pay by card (Host’s Stripe Thailand link)","International Visa / Mastercard / Google Pay in THB","No Stripe link? Use Wise / Revolut THB transfer or exact cash","Treat the Table voucher unlocked","Volunteer host (฿0) · activity timer started & voucher unlocked!",
  "Meetup cancelled — guest did not settle","Booking Ticket forfeited & 1 guest strike recorded (2 strikes = booking suspended). Host loses 0 hours and keeps a clean record.","Meeting point only — no historical/temple guiding on Kring"
],
th:[
  "พบกันและชำระค่ากิจกรรม","ชำระค่ากิจกรรมให้โฮสต์เมื่อเช็กอิน","อยู่ในระยะ 100 ม. จากจุดนัด · GPS พร้อม","เช็กอิน 2 แตะพร้อมใช้งาน (โฮสต์ + ผู้ร่วมทริป)","เจอกันแล้ว · ยืนยันเช็กอิน","กำลังยืนยันเช็กอิน · รอ {host}…","เช็กอินสำเร็จในระยะ 100 ม.!","บันทึกการใช้ตั๋วจองนัดพบแล้ว",
  "ชำระค่ากิจกรรมกับ {host}: {amt}","ชำระค่ากิจกรรมกับโฮสต์โดยตรงเมื่อเช็กอิน ก่อนเริ่มนับเวลากิจกรรมและเปิดคูปองร้านค้า","แอปธนาคารไทยหรือสิงคโปร์ (พร้อมเพย์ส่วนตัว)","วอลเล็ทเอเชีย (Alipay+, Touch 'n Go, QRIS, Wise, TAGTHAi…)","เงินสดพอดีเมื่อเช็กอิน · ชำระให้ {host} โดยตรงแล้วให้โฮสต์กด ได้รับแล้ว ✓","เปิดแอปธนาคาร","บันทึก QR","แสดง QR",
  "แสดงสลิปการโอนของฉัน","กำลังอ่าน QR บนสลิปและตรวจสอบยอด…","จ่ายเงินสดพอดีเมื่อเช็กอิน","{host} กดยืนยัน ได้รับแล้ว ✓","ชำระเรียบร้อย ✓ · จ่าย {amt} ให้ {host} แล้ว","เริ่มนับเวลากิจกรรม · เปิดรหัสคูปองร้านค้าทั้งสองเครื่องแล้ว","ไปหน้าให้คะแนนและกิจกรรมถัดไป",
  "รหัสอ้างอิงกริ๊ง!","ใช้รหัส 6 หลักแทน",
  "เสนอสถานที่นัดพบ","ตกลงใช้จุดนัดพบนี้","การนัดพบของกริ๊ง! ต้องเป็นที่สาธารณะ ลองเลือกคาเฟ่ สวนสาธารณะ ตลาด หรือจุดนัดพบใกล้เคียงนะคะ","ตกลงจุดนัดพบแล้ว","ค้นหาคาเฟ่ สวนสาธารณะ MRT ตลาด…",
  "ชำระค่ากิจกรรมกับ {host}: {amt}","ใช้ตั๋วจองแล้ว · ชำระกับโฮสต์เพื่อเริ่มเวลาและรับคูปองร้าน","ได้รับแล้ว ✓","ยังไม่ได้รับยอด (อัปโหลดสลิปใน 2 นาที)","ผู้จองไม่ชำระเงิน — ยกเลิกนัดพบ",
  "แสดงสลิปโอนเงิน (ภายใน 2 นาที)","ชำระด้วยบัตร (ลิงก์ Stripe Thailand ของโฮสต์)","รับบัตร Visa / Mastercard ต่างประเทศเป็นเงินบาท","โฮสต์ยังไม่มีลิงก์ Stripe? โอนผ่าน Wise / Revolut หรือจ่ายเงินสดพอดี","เปิดรหัสคูปองร้านค้า Treat the Table แล้ว","โฮสต์อาสา (฿0) · เริ่มเวลากิจกรรมและเปิดคูปองร้านค้าทันที!",
  "ยกเลิกนัดพบ — ผู้จองไม่ชำระค่ากิจกรรม","ริบตั๋วจองนัดพบและบันทึกสไตรก์ผู้จอง 1 ครั้ง (ครบ 2 ครั้งระงับสิทธิ์จอง) โฮสต์ไม่เสียชั่วโมงและประวัติสะอาด 100%","ใช้เป็นจุดนัดพบเท่านั้น — กริ๊งไม่อนุญาตให้นำเที่ยวหรือบรรยายประวัติศาสตร์ในวัด/วัง"
],
zh:[
  "见面并结算","签到时直接与达人结算","距离集合点 100 米内 · GPS 已就绪","双人轻触签到已就绪","已见面 · 确认签到","正在确认签到 · 等待 {host}…","100 米内签到已确认！","预订票已标记为已使用",
  "与 {host} 结算：{amt}","签到后在活动计时开始前直接与达人结算。","泰国或新加坡银行应用 (个人 PromptPay)","亚洲电子钱包 (Alipay+, Touch 'n Go, QRIS, Wise, TAGTHAi…)","签到时付正好的现金 · 直接付给 {host} 并由达人点击 已收到 ✓。","打开银行应用","保存二维码","显示二维码",
  "出示我的转账水单","正在读取水单二维码并核对转账…","已付现金","{host} 已点击 已收到 ✓","已结算 ✓ · 已向 {host} 支付 {amt}","活动计时已开始 · 双方手机已解锁餐厅礼券","继续评价",
  "Kring 编号","改用 6 位数字码",
  "提议集合地点","确认该集合地点","Kring 见面仅限公共场所。请选择附近的咖啡馆、公园或市场。","已确认集合地点","搜索咖啡馆、公园、地铁站或市场…",
  "与 {host} 结算：{amt}","预订票已使用 · 结算后开始计时并解锁礼券","已收到 ✓","尚未收到 (2分钟水单核验)","客人未结算 — 取消见面",
  "出示转账水单 (2分钟内)","刷卡支付 (达人的 Stripe Thailand 链接)","支持国际 Visa / Mastercard 泰铢支付","若无 Stripe 链接，可使用 Wise / Revolut 或现金","Treat the Table 餐厅礼券已解锁","志愿达人 (฿0) · 计时已开始并已解锁礼券！",
  "见面已取消 — 客人未结算","预订票已作废并记 1 次违约（2 次将暂停预订权限），达人不损失任何记录。","仅作集合地标 — Kring 不提供寺庙/古迹导游讲解"
],
ko:[
  "만나서 정산","체크인 시 호스트와 직접 정산하세요","만남 장소 100m 이내 · GPS 준비 완료","투탭 체크인 준비 완료","만났어요 · 체크인 확인","체크인 확인 중 · {host} 대기 중…","100m 이내 체크인 완료!","예약 티켓 사용 완료 처리됨",
  "{host}님과 정산: {amt}","활동 타이머 시작 전에 체크인 현장에서 호스트와 직접 정산하세요.","태국/싱가포르 은행 앱 (개인 PromptPay)","아시아 월렛 (Alipay+, Touch 'n Go, QRIS, Wise, TAGTHAi…)","체크인 시 정확한 현금 결제 · {host}님이 수령 완료 ✓ 탭.","은행 앱 열기","QR 저장","QR 보기",
  "이체 내역서(슬립) 보여주기","슬립 QR 확인 및 이체 검증 중…","현금 결제 완료","{host}님이 수령 완료 ✓ 확인함","정산 완료 ✓ · {host}님에게 {amt} 지급됨","활동 타이머 시작 · 양쪽 휴대폰에서 매장 바우처 잠금 해제됨","평가로 이동",
  "Kring 참조번호","6자리 코드로 대신하기",
  "만날 장소 제안","이 장소로 수락","Kring 만남은 공공장소에서만 진행돼요. 근처 카페, 공원, 시장을 선택해 주세요.","만날 장소가 확정됐어요","카페, 공원, MRT, 시장 검색…",
  "{host}님과 정산: {amt}","티켓 사용 처리됨 · 정산 후 타이머 및 바우처 오픈","수령 완료 ✓","아직 미수령 (2분 슬립 확인)","게스트 미정산 — 만남 취소",
  "이체 슬립 업로드 (2분 이내)","카드 결제 (호스트의 Stripe Thailand 링크)","해외 Visa / Mastercard THB 결제","Stripe 링크가 없으면 Wise / Revolut 또는 현금 이용","Treat the Table 매장 바우처 잠금 해제됨","자원봉사 호스트 (฿0) · 즉시 타이머 시작 및 바우처 오픈!",
  "만남 취소됨 — 게스트 미정산","예약 티켓 몰수 및 스트라이크 1회 부여 (2회 시 예약 정지). 호스트 기록은 보호됩니다.","만남 지점 전용 — 사원/역사 가이드 활동 불가"
],
hi:[
  "मिलें और सेटल करें","चेक-इन पर अपने होस्ट के साथ सेटल करें","मीटिंग पॉइंट के 100 मीटर के अंदर · GPS तैयार","टू-टैप चेक-इन तैयार","हम मिल गए · चेक-इन कन्फ़र्म करें","चेक-इन हो रहा है · {host} का इंतज़ार…","100 मीटर के अंदर चेक-इन कन्फ़र्म!","बुकिंग टिकट उपयोग किया गया",
  "{host} के साथ सेटल करें: {amt}","एक्टिविटी टाइमर शुरू होने से पहले चेक-इन पर सीधे होस्ट को पेमेंट करें।","थाईलैंड या सिंगापुर बैंक ऐप (PromptPay)","एशियन वॉलेट (Alipay+, Touch 'n Go, QRIS, Wise, TAGTHAi…)","चेक-इन पर सटीक नकद · {host} Received ✓ टैप करेंगे।","बैंक ऐप खोलें","QR सेव करें","QR दिखाएँ",
  "मेरा ट्रांसफ़र दिखाएँ (स्लिप अपलोड)","स्लिप QR पढ़कर ट्रांसफ़र वेरिफ़ाई हो रहा है…","चेक-इन पर नकद दिया","{host} ने Received ✓ टैप किया","सेटल हो गया ✓ · {host} को {amt} का भुगतान","टाइमर शुरू · दोनों फ़ोन पर वेन्यू वाउचर अनलॉक हो गया","रेटिंग पर जाएँ",
  "Kring रेफ़रेंस","इसके बजाय 6-अंकों का कोड इस्तेमाल करें",
  "जगह सुझाएँ","मीटिंग की जगह स्वीकार करें","Kring मीटिंग सिर्फ़ सार्वजनिक जगहों पर होती हैं। पास का कोई कैफ़े, पार्क या बाज़ार चुनें।","मीटिंग की जगह तय हो गई","कैफ़े, पार्क, MRT या बाज़ार खोजें…",
  "{host} के साथ सेटल करें: {amt}","टिकट उपयोग हुआ · टाइमर और वाउचर के लिए सेटल करें","Received ✓","अभी नहीं मिला (2-मिनट स्लिप चेक)","गेस्ट ने सेटल नहीं किया — मीटअप रद्द करें",
  "ट्रांसफ़र स्लिप दिखाएँ (2 मिनट)","कार्ड से पे करें (होस्ट का Stripe Thailand लिंक)","इंटरनेशनल Visa / Mastercard (THB)","Stripe नहीं है? Wise / Revolut या नकद उपयोग करें","Treat the Table वाउचर अनलॉक हो गया","वॉलंटियर होस्ट (฿0) · टाइमर और वाउचर तुरंत चालू!",
  "मीटअप रद्द — गेस्ट ने सेटल नहीं किया","बुकिंग टिकट ज़ब्त और 1 स्ट्राइक दर्ज (2 स्ट्राइक = बुकिंग निलंबित)। होस्ट का रिकॉर्ड सुरक्षित।","केवल मीटिंग पॉइंट — मंदिर/ऐतिहासिक गाइडिंग की अनुमति नहीं है"
],
ru:[
  "Встреча и расчёт","Рассчитайтесь с ведущим при чек-ине","В пределах 100 м от места встречи · GPS готов","Чек-ин в два касания готов","Мы встретились · подтвердить","Подтверждение чек-ина · ждём {host}…","Чек-ин в пределах 100 м подтверждён!","Билет бронирования отмечен использованным",
  "Рассчитаться с {host}: {amt}","Оплатите ведущему напрямую при чек-ине до запуска таймера.","Банк Таиланда или Сингапура (PromptPay)","Азиатский кошелёк (Alipay+, Touch 'n Go, QRIS, Wise, TAGTHAi…)","Точная сумма наличными при чек-ине · {host} нажмёт Получено ✓.","Открыть банк","Сохранить QR","Показать QR",
  "Показать перевод (загрузить чек)","Сканируем QR чека и проверяем перевод…","Оплачено наличными","{host} нажал(а) Получено ✓","Рассчитано ✓ · {amt} оплачено {host}","Таймер запущен · ваучер заведения открыт на обоих телефонах","Перейти к оценке",
  "Код Kring","Использовать 6-значный код",
  "Предложить место","Принять место встречи","Встречи Kring проходят только в общественных местах. Выберите кафе, парк или рынок.","Место встречи согласовано","Поиск кафе, парка, метро या рынка…",
  "Рассчитаться с {host}: {amt}","Билет использован · рассчитайтесь для старта таймера и ваучера","Получено ✓","Ещё не получено (проверка чека 2 мин)","Гость не рассчитался — отменить встречу",
  "Показать чек перевода (2 мин)","Оплата картой (ссылка Stripe Thailand ведущего)","Международные карты Visa / Mastercard в THB","Нет ссылки Stripe? Используйте Wise / Revolut или наличные","Ваучер Treat the Table открыт","Волонтёр (฿0) · таймер запущен и ваучер открыт!",
  "Встреча отменена — гость не рассчитался","Билет аннулирован, гостю вынесено 1 предупреждение (2 = блокировка бронирований). Ведущий ничего не теряет.","Только место встречи — без экскурсий внутри храмов"
],
ms:[
  "Jumpa & selesai bayaran","Selesaikan bayaran dengan hos semasa daftar masuk","Dalam 100 m dari tempat pertemuan · GPS sedia","Daftar masuk 2 ketikan sedia","Kami dah jumpa · sahkan daftar masuk","Mengesahkan daftar masuk · menunggu {host}…","Daftar masuk disahkan dalam 100 m!","Tiket Tempahan ditanda telah digunakan",
  "Selesaikan dengan {host}: {amt}","Bayar terus kepada hos anda semasa daftar masuk sebelum pemasa aktiviti bermula.","Aplikasi bank Thailand atau Singapura (PromptPay)","Dompet Asia (Alipay+, Touch 'n Go, QRIS, Wise, TAGTHAi…)","Tunai tepat semasa daftar masuk · {host} akan ketik Diterima ✓.","Buka aplikasi bank","Simpan QR","Tunjuk QR",
  "Tunjuk pindahan saya (muat naik slip)","Membaca QR slip & mengesahkan pindahan…","Dibayar tunai tepat","{host} ketik Diterima ✓","Selesai ✓ · {amt} dibayar kepada {host}","Pemasa aktiviti bermula · baucar dibuka pada kedua-dua telefon","Teruskan ke penilaian",
  "Rujukan Kring","Guna kod 6 digit",
  "Cadangkan tempat","Terima tempat pertemuan","Pertemuan Kring diadakan di tempat awam sahaja. Cuba kafe, taman atau pasar berdekatan.","Tempat pertemuan dipersetujui","Cari kafe, taman, MRT atau pasar…",
  "Selesaikan dengan {host}: {amt}","Tiket digunakan · selesaikan untuk mula pemasa & buka baucar","Diterima ✓","Belum diterima (semakan slip 2 min)","Tetamu tidak menjelaskan bayaran — batalkan pertemuan",
  "Tunjuk slip pindahan (2 min)","Bayar dengan kad (pautan Stripe Thailand hos)","Visa / Mastercard antarabangsa dalam THB","Tiada pautan Stripe? Guna Wise / Revolut atau tunai tepat","Baucar Treat the Table dibuka","Hos sukarela (฿0) · pemasa bermula & baucar dibuka!",
  "Pertemuan dibatalkan — tetamu tidak menjelaskan bayaran","Tiket Tempahan dilucuthakkan & 1 amaran direkodkan (2 amaran = tempahan digantung). Rekod hos kekal bersih.","Titik pertemuan sahaja — tiada pemanduan sejarah/kuil di Kring"
]};
for(const l of Object.keys(V)){const t=T[l]||(T[l]={});K.forEach((k,i)=>{t[k]=V[l][i];});}
if(typeof module!=='undefined'&&module.exports){module.exports={K,V};}
})();
