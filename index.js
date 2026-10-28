const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const fs = require('fs');
const path = require('path');

const WARNINGS_FILE = path.join(__dirname, 'link-warnings.json');

const AD_REPLY =
  'ممنوع الاعلانات ف القروب ❌\nسوف يتم طردك 😊';

const LINK_FIRST_REPLY =
  '⚠️ ممنوع الروابط ف القروب ❌\nهذا إنذار أول، الرجاء الالتزام بالقوانين.';

const LINK_SECOND_REPLY =
  '❌ كررت إرسال الروابط بعد الإنذار الأول، سيتم طردك من القروب.';

const AD_PHRASES = [
  // الخدمات الطلابية
  'اسوي سكليف',
  'اسوي سكاليف',
  'نسوي سكاليف',
  'سكاليف معتمد',
  'حل اختبارات',
  'حل واجبات',
  'واجبات جامعية',
  'حل تكاليف',
  'حل التكليفات',
  'حل مشاريع',
  'بحوث جامعية',
  'بحوث ومشاريع التخرج',
  'مشاريع التخرج',
  'تقارير وعروض بوربوينت',
  'عروض بوربوينت',
  'برزنتيشن',
  'تلخيص كتب',
  'تلخيص مقالات',
  'تلخيص محاضرات',
  'حضور محاضرات',
  'متابعة البلاك',
  'البلاك بورد',
  'ضمان الفل مارك',
  'نضمن درجاتك',
  'يضمن درجاته',
  'الخدمات الطلابية',
  'كل الخدمات الطلابية',
  'بحوث ومشاريع وعروض',
  'واجبات وملخصات',
  'ملخصات وواجبات',
  'تعديل على اشغالهم',
  'بسعر مناسب',
  'مساعدة في حل',
  'اللي يبي مساعدة',
  'الي يبي مساعدة',
  'اللي يبي احد يحل',
  'الي يبي احد يحل',

  // بيع الحسابات والخدمات الإلكترونية
  'بيع حسابات',
  'شراء حسابات',
  'حسابات انستقرام',
  'حسابات انستا',
  'حسابات فيسبوك',
  'حسابات تيك توك',
  'بيع حساب انستا',
  'بيع حساب فيسبوك',
  'بيع حساب تيك توك',
  'زيادة متابعين',
  'زيادة لايكات',
  'زيادة مشاهدات',
  'متابعين حقيقيين',
  'متابعين مجانا',
  'خدمات ترويج',
  'ترويج حسابات',
  'شحن العاب',
  'شحن شدات',
  'شحن جواهر',
  'بطاقات الكترونية',
  'فيزا افتراضية',
  'بطاقات فيزا',
  'خدمات رقمية',
  'بيع حسابات جاهزة',
  'استرجاع حسابات',

  // الربح والتسويق
  'ربح من الانترنت',
  'الربح من الانترنت',
  'اكسب فلوس',
  'دخل يومي',
  'دخل اضافي',
  'استثمار مضمون',
  'تسويق بالعمولة',
  'سجل من هنا',
  'فرصة عمل',
  'فرص عمل',
  'مطلوب مسوقين',
  'ارباح يومية',
  'مشروع مربح',
  'اشتغل من جوالك',
  'العمل من المنزل',
  'اربح من هاتفك',
  'اربح المال',
  'اربح مجانا',
  'وظائف عن بعد',
  'توظيف فوري',
  'استثمار يومي',
  'ضاعف رصيدك',
  'ارباح مضمونة',
  'سحب الارباح',
  'للتسجيل اضغط',
  'راسلني للتفاصيل',
  'انضم لفريقنا',
  'فرصة استثمار',
  'تداول العملات',
  'تعدين العملات'
];

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NORMALIZED_AD_PHRASES = AD_PHRASES.map(normalizeText);

function getText(msg) {
  const m = msg.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.documentWithCaptionMessage?.message?.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    ''
  ).trim();
}

function hasLink(text) {
  return /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/)\S*/i.test(text) ||
    /\b[a-z0-9-]+\.(com|net|org|io|me|co|info|app|dev|ly|ye|sa|uk|xyz|site|online)(?:\/\S*)?/i.test(text);
}

function isAdvertisement(text) {
  const normalized = normalizeText(text);

  // العبارات المحددة تكفي لاكتشاف الإعلان
  if (NORMALIZED_AD_PHRASES.some(phrase => normalized.includes(phrase))) {
    return true;
  }

  // "للتواصل خاص" وحدها لا تعتبر إعلانًا
  const hasContact =
    normalized.includes('للتواصل خاص') ||
    normalized.includes('للتواصل على الخاص') ||
    normalized.includes('راسلني خاص');

  const hasService =
    /حل|واجب|اختبار|بحوث|مشروع|سكليف|سكاليف|تقارير|طلاب|خدمات|درجات|تلخيص|متابعين|حسابات|ترويج|ارباح|ربح|تسويق|استثمار/.test(normalized);

  return hasContact && hasService;
}

function normalizeJid(jid) {
  if (!jid) return '';
  const [user, server] = jid.split('@');
  return (user || '').split(':')[0] + '@' + (server || '');
}

function isAdmin(member) {
  return member?.admin === 'admin' ||
    member?.admin === 'superadmin';
}

async function loadWarnings() {
  try {
    return JSON.parse(
      await fs.promises.readFile(WARNINGS_FILE, 'utf8')
    );
  } catch {
    return {};
  }
}

async function saveWarnings(warnings) {
  await fs.promises.writeFile(
    WARNINGS_FILE,
    JSON.stringify(warnings, null, 2),
    'utf8'
  );
}

async function startBot() {
  const { state, saveCreds } =
    await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      require('qrcode-terminal').generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('✅ البوت متصل بواتساب');
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log('انقطع الاتصال:', code || 'غير معروف');

      if (code !== DisconnectReason.loggedOut) {
        setTimeout(() => startBot(), 5000);
      } else {
        console.log('تم تسجيل الخروج. أعد ربط الحساب.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        const jid = msg.key.remoteJid;

        if (!jid?.endsWith('@g.us')) continue;
        if (msg.key.fromMe || !msg.message) continue;

        const sender = msg.key.participant;
        if (!sender) continue;

        const group = await sock.groupMetadata(jid);
        const members = group.participants || [];

        // لا يعمل إلا إذا كان البوت مشرفًا
        const botJid = normalizeJid(sock.user?.id);
        const botInfo = members.find(member =>
          normalizeJid(member.id || member.jid) === botJid
        );

        if (!isAdmin(botInfo)) continue;

        // السماح لمشرفي القروب
        const senderInfo = members.find(member =>
          normalizeJid(member.id || member.jid) === normalizeJid(sender)
        );

        if (isAdmin(senderInfo)) continue;

        const text = getText(msg);
        if (!text) continue;

        // الإعلان: حذف وطرد بدون إنذار
        if (isAdvertisement(text)) {
          try {
            await sock.sendMessage(jid, { delete: msg.key });
          } catch (err) {
            console.log('تعذر حذف الإعلان:', err.message);
          }

          await sock.sendMessage(jid, {
            text: AD_REPLY,
            mentions: [sender]
          });

          try {
            await sock.groupParticipantsUpdate(jid, [sender], 'remove');
            console.log('تم طرد المعلن:', sender);
          } catch (err) {
            console.log('تعذر طرد المعلن:', err.message);
          }

          continue;
        }

        // الرابط: إنذار أول، ثم طرد عند التكرار
        if (hasLink(text)) {
          const warnings = await loadWarnings();
          const warningKey = jid + '|' + normalizeJid(sender);

          try {
            await sock.sendMessage(jid, { delete: msg.key });
          } catch (err) {
            console.log('تعذر حذف الرابط:', err.message);
          }

          if (!warnings[warningKey]) {
            warnings[warningKey] = true;
            await saveWarnings(warnings);

            await sock.sendMessage(jid, {
              text: LINK_FIRST_REPLY,
              mentions: [sender]
            });

            console.log('تم تسجيل الإنذار الأول:', sender);
          } else {
            await sock.sendMessage(jid, {
              text: LINK_SECOND_REPLY,
              mentions: [sender]
            });

            try {
              await sock.groupParticipantsUpdate(jid, [sender], 'remove');
              console.log('تم طرد مكرر إرسال الروابط:', sender);
            } catch (err) {
              console.log('تعذر طرد مرسل الرابط:', err.message);
            }
          }
        }
      } catch (err) {
        console.log('خطأ في معالجة الرسالة:', err.message);
      }
    }
  });
}

startBot().catch(console.error);
