import { APP_VERSION } from '../../../config/version'

export function SettingsAbout() {
  return (
    <section className="settings-about" aria-labelledby="settings-about-heading">
      <h2 id="settings-about-heading" className="settings-about__heading">
        Tentang aplikasi
      </h2>

      <article className="settings-about__block" lang="id">
        <h3 className="settings-about__lang-label">Bahasa Indonesia</h3>
        <p className="settings-about__lead">
          <strong>Nailul Murod</strong> adalah aplikasi pembaca digital kitab{' '}
          <em>Nailul Murod fi al-Adzkar wa al-Awrad</em> (نيل المراد في الأذكار والأوراد)—kumpulan
          dzikir, doa, dan wirid harian beserta amaliyah sehari-hari.
        </p>
        <dl className="settings-about__meta">
          <div>
            <dt>Penyusun</dt>
            <dd>KH. Muhammad Ghazali bin Uthman al-Badiyani</dd>
          </div>
          <div>
            <dt>Penerbit</dt>
            <dd>Badia Media (بديان ميديا)</dd>
          </div>
        </dl>
        <p>
          Aplikasi menampilkan teks Arab, terjemahan, dan nadhom dengan pengaturan font, ukuran teks,
          serta jarak baris. Konten dapat dibaca offline setelah pernah disinkronkan.
        </p>
        <p className="settings-about__legal muted">
          Versi digital ini berdasarkan sumber resmi penerbit. Penggunaan, penyalinan, atau
          pendistribusian ulang di luar aplikasi mengikuti izin dan ketentuan penerbit.
        </p>
        <p className="settings-about__version muted">Versi aplikasi {APP_VERSION}</p>
      </article>

      <article className="settings-about__block settings-about__block--ar" lang="ar" dir="rtl">
        <h3 className="settings-about__lang-label">العربية</h3>
        <p className="settings-about__lead">
          <strong>تطبيق نيل المراد</strong> تطبيق قراءة رقمي لكتاب «نيل المراد في الأذكار والأوراد»،
          وهو مجموعة من الأذكار والأدعية والأوراد اليومية مع الأعمال الروحية اليومية.
        </p>
        <dl className="settings-about__meta">
          <div>
            <dt>الجامع</dt>
            <dd>محمد غزالي ابن عثمان البديوني</dd>
          </div>
          <div>
            <dt>الناشر</dt>
            <dd>بديان ميديا</dd>
          </div>
        </dl>
        <p>
          يعرض التطبيق النص العربي والترجمة والنظم مع إعدادات الخط وحجم النص ومسافة السطر. يمكن قراءة
          المحتوى دون اتصال بعد المزامنة مرة واحدة.
        </p>
        <p className="settings-about__legal muted">
          النسخة الرقمية المعروضة مستندة إلى مصدر الناشر الرسمي. الاستخدام أو النسخ أو إعادة النشر
          خارج التطبيق يخضع لإذن الناشر وشروطه.
        </p>
        <p className="settings-about__version muted">إصدار التطبيق {APP_VERSION}</p>
      </article>
    </section>
  )
}
