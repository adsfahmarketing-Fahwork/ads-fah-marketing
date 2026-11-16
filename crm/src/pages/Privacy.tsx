import { Link } from 'react-router-dom'

const env = import.meta.env as Record<string, string | undefined>
const CONTACT = { email: env.VITE_PRIVACY_CONTACT_EMAIL, phone: env.VITE_COMPANY_PHONE, address: env.VITE_COMPANY_ADDRESS }

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-6"><h2 className="mb-2 text-lg font-bold">{title}</h2><div className="space-y-2 text-sm leading-relaxed text-slate-700">{children}</div></section>
)

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-brand-soft px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex justify-center"><img src={`${import.meta.env.BASE_URL}logo-full.png`} alt="ADS FAH MARKETING" className="h-28 w-auto" /></div>
        <article className="card !p-6 sm:!p-8">
          <h1 className="mb-1 text-2xl font-bold">ประกาศความเป็นส่วนตัว (Privacy Notice)</h1>
          <p className="mb-6 text-sm text-slate-500">บริษัท แอดส์ฟ้ามาเก็ตติ้ง จำกัด (ADS FAH MARKETING Co., Ltd.) · ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)</p>
          <Section title="1. ข้อมูลที่เราเก็บรวบรวม">
            <p><b>จากลูกค้า (ผ่านแบบฟอร์ม Brief):</b> ชื่อธุรกิจ ชื่อผู้ติดต่อ เบอร์โทรศัพท์ LINE ID ลิงก์ Facebook/Instagram ประเภทสินค้าและบริการ งบประมาณโฆษณา กลุ่มเป้าหมาย พื้นที่ วัตถุประสงค์ โปรโมชั่น รูปภาพ/วิดีโอ/ไฟล์ที่ท่านแนบ และเวลาที่ท่านรับทราบประกาศนี้</p>
            <p><b>จากพนักงาน:</b> ชื่อ-นามสกุล อีเมล เบอร์โทร ตำแหน่ง วันที่เริ่มงาน และประวัติการใช้งานระบบ</p>
            <p><b>เราไม่ขอและไม่เก็บ</b> รหัสผ่านบัญชี Facebook/Instagram หรือ Access Token ผ่านแบบฟอร์มนี้ — กรุณาอย่าส่งข้อมูลดังกล่าวให้ผู้ใดผ่านช่องทางนี้</p>
          </Section>
          <Section title="2. วัตถุประสงค์ในการใช้ข้อมูล">
            <p>เพื่อวิเคราะห์ วางแผน และให้บริการบริหารเพจและโฆษณา Facebook/Instagram ติดต่อประสานงาน จัดทำสัญญาและการเรียกเก็บค่าบริการ ติดตามผลการดำเนินงาน และปฏิบัติตามกฎหมายที่เกี่ยวข้อง</p>
            <p>ฐานทางกฎหมาย: การปฏิบัติตามสัญญาหรือการดำเนินการตามคำขอก่อนเข้าทำสัญญา ความยินยอมของท่าน และประโยชน์โดยชอบด้วยกฎหมายของบริษัท</p>
          </Section>
          <Section title="3. การเปิดเผยข้อมูล">
            <p>ข้อมูลถูกเข้าถึงได้เฉพาะพนักงานของบริษัทที่เกี่ยวข้องกับงานของท่านตามสิทธิ์ที่กำหนด เราไม่ขายข้อมูลของท่าน ข้อมูลอาจถูกประมวลผลโดยผู้ให้บริการโครงสร้างพื้นฐานระบบคลาวด์ (Supabase) และแพลตฟอร์มโฆษณา (Meta) เท่าที่จำเป็นต่อการให้บริการ ซึ่งอาจเกี่ยวข้องกับการส่งข้อมูลไปยังต่างประเทศ โดยบริษัทใช้มาตรการคุ้มครองที่เหมาะสม</p>
          </Section>
          <Section title="4. ระยะเวลาการเก็บรักษา">
            <p>ตลอดระยะเวลาที่ท่านเป็นลูกค้า และต่อไปตามระยะเวลาที่จำเป็นเพื่อปฏิบัติตามกฎหมายหรือเพื่อก่อตั้ง ใช้ หรือป้องกันสิทธิเรียกร้องทางกฎหมาย หลังจากนั้นจะลบหรือทำให้ไม่สามารถระบุตัวตนได้</p>
          </Section>
          <Section title="5. มาตรการรักษาความปลอดภัย">
            <p>การเข้ารหัสระหว่างการส่งข้อมูล (HTTPS) การควบคุมสิทธิ์การเข้าถึงตามบทบาทที่ระดับฐานข้อมูล ลิงก์แบบฟอร์มที่คาดเดาไม่ได้ มีวันหมดอายุและยกเลิกได้ การจำกัดอัตราการส่งข้อมูล การบันทึกประวัติการแก้ไข และการสำรองข้อมูล</p>
          </Section>
          <Section title="6. สิทธิของเจ้าของข้อมูล">
            <p>ท่านมีสิทธิขอเข้าถึง ขอสำเนา แก้ไข ลบ ระงับการใช้ คัดค้านการประมวลผล ขอให้โอนย้ายข้อมูล และถอนความยินยอมได้ตลอดเวลา (การถอนความยินยอมไม่กระทบการประมวลผลที่ได้ทำไปแล้ว) รวมถึงมีสิทธิร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส.)</p>
          </Section>
          <Section title="7. ช่องทางติดต่อ">
            <p>บริษัท แอดส์ฟ้ามาเก็ตติ้ง จำกัด{CONTACT.address && <> · {CONTACT.address}</>}</p>
            {CONTACT.email && <p>อีเมล: <a className="text-brand-dark hover:underline" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></p>}
            {CONTACT.phone && <p>โทรศัพท์: {CONTACT.phone}</p>}
            {!CONTACT.email && !CONTACT.phone && <p>กรุณาติดต่อทีมงาน ADS FAH MARKETING ผ่านช่องทางที่ท่านใช้ติดต่อกับเราอยู่</p>}
          </Section>
          <p className="mt-6 text-center"><Link to="/login" className="text-sm text-brand-dark hover:underline">← กลับ</Link></p>
        </article>
      </div>
    </div>
  )
}
