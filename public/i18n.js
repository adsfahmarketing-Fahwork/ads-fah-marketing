/* ADS FAH MARKETING — Thai / English language switch
   Thai is written directly in index.html (default, best for SEO in Thailand).
   English comes from the dictionary below: exact Thai text → English text.
   To translate new content: add one line "ข้อความไทย": "English text". */
(() => {
  'use strict';

  // Rich blocks (contain <br>, <strong>, <em>): normalized Thai innerHTML → English HTML
  const EN_HTML = {
    'เปลี่ยนการยิงแอด<br><em>ให้เป็นการเติบโต</em><br>ของธุรกิจ': 'Turn your ads<br><em>into real growth</em><br>for your business',
    'สวัสดีค่ะ <strong>ครูฟ้า</strong> ผู้เชี่ยวชาญด้าน Facebook &amp; Instagram Ads สอนตั้งแต่พื้นฐานจนถึงการ Scale ยอดขาย ด้วยระบบโฆษณาที่อัปเดตล่าสุดในยุค AI ทั้งแบบตัวต่อตัว แบบกลุ่ม และอบรมองค์กร พร้อมรับบริหารโฆษณาให้ธุรกิจของคุณ':
      'Hi, I’m <strong>Kru Fah</strong>, a Facebook &amp; Instagram Ads specialist. I teach everything from the basics to scaling your sales with the latest AI-era ad system — one-on-one, in groups and as corporate training — and my team can also run your ads for you.',
    'สอนจากประสบการณ์จริง<br>ไม่ใช่แค่ทฤษฎี': 'Taught from real experience,<br>not just theory',
    'ครูฟ้ามีประสบการณ์ยิงโฆษณามากว่า <strong>10 ปี</strong> และผ่านการรับรอง <strong>Meta Certified Media Buying Professional</strong> ผู้ก่อตั้ง <strong>บริษัท แอดส์ฟ้ามาเก็ตติ้ง จำกัด</strong> เพื่อถ่ายทอดวิธีคิดและระบบการทำโฆษณาที่ใช้ได้จริงให้กับเจ้าของธุรกิจและทีมการตลาด':
      'Kru Fah has more than <strong>10 years</strong> of advertising experience and is a <strong>Meta Certified Media Buying Professional</strong>. She founded <strong>ADS FAH MARKETING Co., Ltd.</strong> to pass on a practical way of thinking about — and running — ads to business owners and marketing teams.',
    'ไม่มีเวลายิงแอดเอง?<br>ให้ทีม ADS FAH ดูแลแทน': 'No time to run ads yourself?<br>Let the ADS FAH team handle it',
    '<b>เหมาะกับเจ้าของธุรกิจที่ต้องการ</b> เพิ่มยอดขาย · หาลูกค้าใหม่ · สร้างการรับรู้แบรนด์ · เพิ่มยอดผู้ติดตาม · กระตุ้นการทักแชท':
      '<b>Ideal for business owners who want to</b> increase sales · find new customers · build brand awareness · grow followers · get more chat inquiries',
    'เริ่มต้นเติบโต<br>ไปกับครูฟ้า': 'Start growing<br>with Kru Fah'
  };

  // Plain text and attributes (alt, aria-label, placeholder, title)
  const EN = {
    // Navigation & common
    'เกี่ยวกับครูฟ้า': 'About', 'วิดีโอ': 'Videos', 'คอร์สเรียน': 'Courses', 'บริการ': 'Services', 'ผลงาน': 'Portfolio', 'รีวิว': 'Reviews', 'ติดต่อ': 'Contact',
    'สมัครเรียน': 'Enroll', 'ปรึกษาการตลาด': 'Marketing consultation', 'บาท': 'THB', 'ปี': 'yrs', 'โทร': 'Phone', 'อีเมล': 'Email', 'เมนู': 'Menu',
    'ADS FAH MARKETING หน้าแรก': 'ADS FAH MARKETING home', 'เมนูหลัก': 'Main menu', 'เปิดเมนู': 'Open menu',
    'ช่องทางติดต่อด่วน': 'Quick contact', 'แชท LINE': 'Chat on LINE', 'โทรหาเรา': 'Call us',
    'ภาพขยาย': 'Enlarged image', 'ปิด': 'Close', 'ภาพก่อนหน้า': 'Previous image', 'ภาพถัดไป': 'Next image',

    // Hero
    'ประสบการณ์ยิงโฆษณา 10 ปี': '10 years of ad experience',
    'ไม่ต้องมีพื้นฐานก็เรียนได้': 'No experience needed',
    'แนะนำ 100% จาก 13 รีวิวบน Facebook': '100% recommended in 13 Facebook reviews',
    'ครูฟ้า · Founder & Meta Ads Trainer': 'Kru Fah · Founder & Meta Ads Trainer',
    'ครูฟ้า ผู้ก่อตั้ง ADS FAH MARKETING': 'Kru Fah, founder of ADS FAH MARKETING',
    'สอนตัวต่อตัวตามธุรกิจของคุณ': 'One-on-one, tailored to your business',
    'ลงมือทำจริงพร้อมเพื่อนร่วมรุ่น': 'Hands-on practice with a cohort',
    'อบรมทีมการตลาดในองค์กร': 'Training for in-house marketing teams',
    'รับบริหารแอดและดูแลเพจ': 'Ad management and page care',

    // About
    'หลักสูตรออกแบบให้เข้าใจง่าย ไม่ต้องมีพื้นฐาน เน้นให้ผู้เรียนอ่านตัวเลขเป็น ตัดสินใจเองได้ และรู้นโยบายโฆษณาของ Meta เพื่อป้องกันบัญชีโดนจำกัด':
      'The courses are easy to follow with no experience needed. You learn to read the numbers, make your own decisions and understand Meta’s ad policies so your account stays safe from restrictions.',
    'ประสบการณ์ยิงโฆษณา': 'of advertising experience',
    'แนะนำ จาก 13 รีวิวบน Facebook': 'recommended in 13 Facebook reviews',
    'เข้าใจระบบ ไม่ใช่จำปุ่ม': 'Understand the system, not just the buttons',
    'รู้ว่าอัลกอริทึมของ Meta ทำงานอย่างไรในยุค AI': 'Learn how Meta’s algorithm works in the AI era',
    'ตัวเลขนำทาง': 'Let the numbers guide you',
    'อ่านผลโฆษณาเป็น รู้ว่าแอดไหนควรไปต่อ ตัวไหนควรปิด': 'Read your results and know which ads to keep and which to turn off',
    'ปลอดภัยตามนโยบาย': 'Stay within policy',
    'เขียนแอดให้ผ่านนโยบาย ลดความเสี่ยงบัญชีโดนแบน': 'Write ads that pass review and lower the risk of account bans',
    'ดูคอร์สเรียน': 'View courses', 'ทัก LINE คุยกับครูฟ้า': 'Chat with Kru Fah on LINE',

    // Videos
    'ทำความรู้จักครูฟ้าผ่านวิดีโอ': 'Get to know Kru Fah on video',
    'ฟังแนวคิด ประสบการณ์ และวิธีสอนของครูฟ้าก่อนตัดสินใจเรียน ติดตามคลิปใหม่ ๆ และเทคนิคยิงแอดได้ที่เพจ Ads Fah Marketing':
      'Hear Kru Fah’s ideas, experience and teaching style before you sign up. Follow the Ads Fah Marketing page for new clips and ad tips.',
    'สมัครเรียนกับครูฟ้า': 'Enroll with Kru Fah', 'ติดตามเพจ Facebook': 'Follow on Facebook',
    'รู้จักครูฟ้าใน 1 นาที': 'Meet Kru Fah in 1 minute', 'แนะนำตัวและแนวทางการสอน': 'Introduction and teaching approach',
    'ดูบน Facebook ↗': 'Watch on Facebook ↗', 'Story Telling ครูฟ้า': 'Kru Fah’s story', 'เส้นทางจากวันแรกจนถึงวันนี้': 'The journey from day one to today',
    'รีวิวจากนักเรียน': 'Student reviews', 'เสียงจริงจากผู้เรียนของครูฟ้า': 'Real words from Kru Fah’s students',
    'รู้จักครูฟ้าใน 1 นาที — วิดีโอจาก Facebook': 'Meet Kru Fah in 1 minute — Facebook video',
    'Story Telling ครูฟ้า — วิดีโอจาก Facebook': 'Kru Fah’s story — Facebook video',
    'รีวิวจากนักเรียน — วิดีโอจาก Facebook': 'Student reviews — Facebook video',

    // Courses
    'เลือกรูปแบบการเรียนที่เหมาะกับคุณ': 'Choose the format that suits you',
    'ทุกหลักสูตรอัปเดตตามระบบ Facebook Ads ล่าสุด ใช้ได้ทั้ง Facebook และ Instagram': 'Every course follows the latest Facebook Ads system and works for both Facebook and Instagram',
    'ยอดนิยม': 'Most popular', 'สมัครคอร์สนี้': 'Enroll in this course', 'สอบถาม / จองรอบ': 'Ask / book a session',
    'รอบอบรมที่เปิดรับ': 'Open sessions', 'บาท / คอร์ส': 'THB / course', 'สอบถามราคารอบถัดไป': 'Ask for next-round pricing', 'ขอใบเสนอราคา': 'Request a quote',
    'ยิงแอด Facebook & Instagram แบบตัวต่อตัว': 'Facebook & Instagram Ads, one-on-one',
    'ยิงแอดยังไงให้รอดในยุค AI (อัปเดตล่าสุด)': 'How to win with ads in the AI era (latest update)',
    'เข้าใจระบบ Facebook Ads 2026 — GEN, Meta Lattice, AI Learning': 'Understand Facebook Ads 2026 — GEN, Meta Lattice, AI Learning',
    'ปรับแคมเปญให้ตรงกลุ่ม ลดค่าแอดด้วยโครงสร้างที่ถูกต้อง': 'Target the right audience and lower ad costs with the right structure',
    'อ่านผลโฆษณาแบบมือโปร รู้ว่าแอดไหนดี ควรปิดตัวไหน': 'Read results like a pro — know which ads work and which to turn off',
    'ใช้ AI ช่วยวิเคราะห์กลุ่มเป้าหมายและวางโครงสร้างแคมเปญ': 'Use AI to analyze audiences and plan campaign structure',
    'เทคนิค Scaling เพิ่มยอดขาย ขยายงบอย่างไรไม่ให้พัง': 'Scaling techniques — grow the budget without breaking results',
    'เวิร์กช็อปยิงแอดแบบกลุ่ม ลงมือทำจริง': 'Hands-on group ads workshop',
    'เรียนพร้อมเพื่อนร่วมรุ่น ลงมือกับบัญชีโฆษณาของตัวเอง': 'Learn with a cohort, working in your own ad account',
    'ปูพื้นฐาน Business Manager, Pixel และโครงสร้างแคมเปญ': 'Foundations: Business Manager, Pixel and campaign structure',
    'Workshop ตั้งค่าแคมเปญจริงบนโน้ตบุ๊กของผู้เรียน': 'Set up real campaigns on your own laptop',
    'นโยบายโฆษณาที่ต้องรู้ ป้องกันบัญชีโดนจำกัด': 'Key ad policies to keep your account from being restricted',
    'ถาม-ตอบเคสธุรกิจของผู้เรียนแต่ละคน': 'Q&A on each participant’s business',
    'อบรมทีมการตลาดภายในองค์กร': 'In-house marketing team training',
    'หลักสูตรออกแบบเฉพาะสำหรับทีมและพาร์ทเนอร์ของบริษัท': 'A program designed for your company’s team and partners',
    'ออกแบบเนื้อหาตามอุตสาหกรรมและเป้าหมายของบริษัท': 'Content built around your industry and goals',
    'อบรมนอกสถานที่ / โรงแรม / ออนไลน์': 'On-site / hotel venue / online',
    'ครอบคลุม Meta Ads Policy สำหรับธุรกิจที่มีข้อจำกัด': 'Covers Meta Ads policy for restricted industries',
    'เอกสารประกอบและสไลด์สำหรับทีม': 'Handouts and slides for your team',
    'สิ่งที่จะได้เรียนในหลักสูตร Private Class': 'What you’ll learn in the Private Class',
    'ยิงแอดยังไงให้รอดในยุค AI — สอนตั้งแต่เริ่มต้นจนถึงการปิดการขาย': 'Winning with ads in the AI era — from the very start to closing the sale',
    'เข้าใจระบบ Facebook Ads 2026': 'Understand Facebook Ads 2026', 'ปรับแคมเปญให้ตรงกลุ่ม ลดค่าแอด': 'Reach the right audience, lower ad costs',
    'อ่านผลโฆษณาแบบมือโปร': 'Read results like a pro', 'รู้ว่าแอดไหนดี / ควรปิดตัวไหน': 'Know which ads work and which to stop',
    'ดูตัวเลขเป็นในเวลาไม่กี่นาที': 'Understand your numbers in minutes',
    'ใช้ AI ช่วยยิงแอดให้แม่นขึ้น': 'Use AI for sharper targeting', 'วิเคราะห์กลุ่มเป้าหมายอัตโนมัติ': 'Automatic audience analysis',
    'วางโครงสร้างแคมเปญด้วย AI': 'Plan campaign structure with AI', 'เทคนิค Scaling เพิ่มยอดขาย': 'Scaling techniques to grow sales',
    'ขยายงบยังไงไม่ให้พัง': 'Grow the budget without breaking results', 'ยิงยังไงให้กำไรต่อเนื่อง': 'Keep campaigns profitable',

    // Services & package
    'บริการเอเจนซี': 'Agency services',
    'วางกลยุทธ์ ตั้งค่า ปรับแคมเปญ และรายงานผลอย่างโปร่งใส เพื่อให้คุณโฟกัสกับการขายและการบริการลูกค้า':
      'We plan the strategy, set up and optimize campaigns, and report transparently — so you can focus on selling and serving customers.',
    'รับยิงแอด Facebook & Instagram': 'Facebook & Instagram ad management',
    'วางโครงสร้าง Campaign → Ad Set → Ad ตามเป้าหมายธุรกิจ ทั้ง Messages, Leads และ Conversions': 'Campaign → Ad Set → Ad structure built around your goal: Messages, Leads or Conversions',
    'ปรับแคมเปญและรายงานผล': 'Optimization and reporting',
    'ติดตามตัวเลขสำคัญ เช่น CPM, CTR, Cost per Result และ ROAS พร้อมสรุปผลให้เข้าใจง่าย': 'We track the key numbers — CPM, CTR, cost per result and ROAS — with easy-to-read summaries',
    'ดูแลเพจแบบครบวงจร': 'Full page management',
    'วางแผนคอนเทนต์ ออกแบบ Creative เขียนแคปชันขายของ และดูแลภาพลักษณ์ของเพจ': 'Content planning, creative design, sales captions and page branding',
    'ตรวจสุขภาพบัญชีโฆษณา': 'Ad account health check',
    'ตรวจ Business Manager, Pixel และนโยบายโฆษณา ป้องกันปัญหาบัญชีโดนจำกัดก่อนเกิดขึ้น': 'We review Business Manager, Pixel and ad policies to prevent restrictions before they happen',
    'ดูแลโฆษณาครบวงจร 30 วัน': 'Full ad management for 30 days', 'บาท / เดือน': 'THB / month',
    'ค่าบริการ · ไม่รวมงบโฆษณาที่ชำระให้ Facebook · ราคายังไม่รวม VAT 7%': 'Service fee · excludes the ad budget paid to Facebook · excludes 7% VAT',
    'วางแผนกลยุทธ์และตั้งค่าโฆษณา': 'Strategy and ad setup', 'ยิงแอด 30 วัน ไม่จำกัดโพสต์': '30 days of ads, unlimited posts',
    'บริหารและปรับแคมเปญตลอด 30 วัน': 'Campaign management and optimization for 30 days', 'รายงานผลทุกสัปดาห์': 'Weekly reports',
    'แนะนำคอนเทนต์ประจำเดือน': 'Monthly content recommendations', 'รายละเอียดบริการทั้งหมด': 'Full service details',
    'สร้างแคมเปญและกำหนดกลุ่มเป้าหมายที่เหมาะสม': 'Build campaigns and define the right audiences',
    'Optimize Ads / ดูแลโฆษณาให้ตลอด 1 เดือน': 'Ad optimization and care for a full month',
    'ตรวจสอบ Facebook Fanpage เตรียมพร้อมก่อนขึ้นโฆษณา': 'Review your Facebook page to get it ready for ads',
    'วิเคราะห์และวางโครงสร้างโฆษณา Target และรูปแบบโฆษณาที่เหมาะกับธุรกิจ': 'Analyze and plan ad structure, targeting and formats for your business',
    'วางแผนงบประมาณที่เหมาะสม': 'Plan the right budget',
    'สร้างแคมเปญโฆษณาและบริหารจัดการโฆษณา': 'Create and manage ad campaigns',
    'รายงานผลการดำเนินงาน ส่ง Report ทุกสัปดาห์': 'Performance report sent every week',
    'Optimize แคมเปญให้ได้ผลลัพธ์ที่ดีและคุ้มค่าที่สุด': 'Optimize campaigns for the best results and value',
    'ที่ปรึกษาด้านการตลาดออนไลน์': 'Online marketing advisor',
    'สนใจแพ็กเกจนี้': 'I’m interested', 'สอบถามทาง LINE': 'Ask on LINE',
    'ดูโปสเตอร์แพ็กเกจขนาดใหญ่': 'View the package poster larger',
    'โปสเตอร์ Package Facebook & Instagram 30 Days ค่าบริการ 10,000 บาทต่อเดือน': 'Poster: Facebook & Instagram 30 Days package, 10,000 THB per month',
    'ขั้นตอนการทำงาน': 'How we work',
    'ปรึกษาฟรี': 'Free consultation', 'คุยเป้าหมาย สินค้า และงบประมาณ': 'Talk through your goals, products and budget',
    'วางกลยุทธ์': 'Strategy', 'กลุ่มเป้าหมาย โครงสร้างแคมเปญ Creative': 'Audiences, campaign structure, creative',
    'ยิงแอดและปรับจูน': 'Launch and fine-tune', 'ทดสอบ วัดผล ปิดตัวที่ไม่เวิร์ก': 'Test, measure, switch off what doesn’t work',
    'Scale และรายงาน': 'Scale and report', 'ขยายงบแคมเปญที่ได้ผล พร้อมรายงานผล': 'Grow the budget on what works, with reports',
    'นัดปรึกษาการตลาด': 'Book a consultation',

    // Gallery
    'ผลงานและบรรยากาศการอบรม': 'Portfolio and training moments', 'ห้องเรียนจริง ผู้เรียนจริง': 'Real classes, real students',
    'ภาพจากงานอบรมและเวิร์กช็อปที่ครูฟ้าเป็นวิทยากร ผู้เรียนลงมือทำบนบัญชีโฆษณาของตัวเอง': 'Photos from trainings and workshops led by Kru Fah, where students work in their own ad accounts',
    'Workshop · นโยบายโฆษณา Facebook สำหรับธุรกิจที่มีข้อจำกัด': 'Workshop · Facebook ad policy for restricted industries',
    'ร่วมงาน Digital Dialogue IRL ร่วมกับ Meta': 'At Digital Dialogue IRL, together with Meta',
    'อบรมทีม Porsche Centre Pattaya by Sime Darby Auto': 'Training the Porsche Centre Pattaya team by Sime Darby Auto',
    'Private Class 1:1 · สอนตัวต่อตัว': 'Private Class 1:1 · one-on-one', 'เรียนที่ออฟฟิศ ADS FAH': 'Class at the ADS FAH office',
    'ดูแลผู้เรียนรายคนระหว่างเวิร์กช็อป': 'Personal coaching during a workshop', 'Meta Certified · ประสบการณ์ 10 ปี': 'Meta Certified · 10 years of experience',
    'อบรมทีมที่ออฟฟิศ ADS FAH': 'Team training at the ADS FAH office', 'ทีม ADS FAH ในงาน Facebook Ads Workshop': 'The ADS FAH team at a Facebook Ads Workshop',
    'วิทยากรงานอบรมพาร์ทเนอร์ธุรกิจ': 'Speaker at a business partner training', 'Private Class 1:1 · 9,900 บาท': 'Private Class 1:1 · 9,900 THB',
    'ครูฟ้า · ผู้ก่อตั้ง ADS FAH MARKETING': 'Kru Fah · founder of ADS FAH MARKETING',
    'ดูภาพขยาย: Workshop · นโยบายโฆษณา Facebook สำหรับธุรกิจที่มีข้อจำกัด': 'Enlarge: Workshop · Facebook ad policy for restricted industries',
    'ครูฟ้าบรรยายเรื่องข้อห้ามในการยิงโฆษณา Facebook ในห้องอบรม': 'Kru Fah teaching Facebook ad restrictions in a training room',
    'ดูภาพขยาย: ร่วมงาน Digital Dialogue IRL ร่วมกับ Meta': 'Enlarge: At Digital Dialogue IRL, together with Meta',
    'ครูฟ้าร่วมงาน EYEYAH! Digital Dialogue IRL ร่วมกับ Meta': 'Kru Fah at EYEYAH! Digital Dialogue IRL, together with Meta',
    'ดูภาพขยาย: Corporate Training · Porsche Centre Pattaya': 'Enlarge: Corporate Training · Porsche Centre Pattaya',
    'สไลด์คอร์สสอนยิงแอด Facebook & Instagram สำหรับ Porsche Centre Pattaya by Sime Darby Auto': 'Facebook & Instagram ads course slide for Porsche Centre Pattaya by Sime Darby Auto',
    'ดูภาพขยาย: อบรมทีม Porsche Centre Pattaya by Sime Darby Auto': 'Enlarge: Training the Porsche Centre Pattaya team by Sime Darby Auto',
    'ครูฟ้ากับทีม Porsche Centre Pattaya หลังการอบรมยิงแอด': 'Kru Fah with the Porsche Centre Pattaya team after the ads training',
    'ดูภาพขยาย: Private Class 1:1 · สอนตัวต่อตัว': 'Enlarge: Private Class 1:1 · one-on-one',
    'ครูฟ้าสอน Private Class ตัวต่อตัวกับผู้เรียน': 'Kru Fah teaching a one-on-one Private Class',
    'ดูภาพขยาย: เรียนที่ออฟฟิศ ADS FAH': 'Enlarge: Class at the ADS FAH office',
    'ครูฟ้ากับผู้เรียนในห้องประชุมออฟฟิศ ADS FAH': 'Kru Fah with students in the ADS FAH meeting room',
    'ดูภาพขยาย: ดูแลผู้เรียนรายคนระหว่างเวิร์กช็อป': 'Enlarge: Personal coaching during a workshop',
    'ครูฟ้าดูแลผู้เรียนระหว่างเวิร์กช็อป': 'Kru Fah coaching a student during a workshop',
    'ดูภาพขยาย: Meta Certified · ประสบการณ์ 10 ปี': 'Enlarge: Meta Certified · 10 years of experience',
    'โปสเตอร์ Private Class โดยผู้เชี่ยวชาญ Meta Certified Media Buying Professional ประสบการณ์ 10 ปี': 'Private Class poster by a Meta Certified Media Buying Professional with 10 years of experience',
    'ดูภาพขยาย: อบรมทีมที่ออฟฟิศ ADS FAH': 'Enlarge: Team training at the ADS FAH office',
    'ทีมและผู้เรียนที่ออฟฟิศ ADS FAH MARKETING': 'Team and students at the ADS FAH MARKETING office',
    'ดูภาพขยาย: ทีม ADS FAH ในงาน Facebook Ads Workshop': 'Enlarge: The ADS FAH team at a Facebook Ads Workshop',
    'ครูฟ้าและทีม ADS FAH ในงาน Facebook Ads Workshop': 'Kru Fah and the ADS FAH team at a Facebook Ads Workshop',
    'ดูภาพขยาย: วิทยากรงานอบรมพาร์ทเนอร์ธุรกิจ': 'Enlarge: Speaker at a business partner training',
    'ครูฟ้าในงานอบรมพาร์ทเนอร์': 'Kru Fah at a partner training event',
    'ดูภาพขยาย: Private Class 1:1 · 9,900 บาท': 'Enlarge: Private Class 1:1 · 9,900 THB',
    'โปสเตอร์คอร์ส Private Class 1:1 ยิงแอด Facebook & Instagram ราคา 9,900 บาท': 'Poster: Private Class 1:1 Facebook & Instagram Ads, 9,900 THB',
    'ดูภาพขยาย: ครูฟ้า · ผู้ก่อตั้ง ADS FAH MARKETING': 'Enlarge: Kru Fah · founder of ADS FAH MARKETING',
    'ครูฟ้า ผู้ก่อตั้ง ADS FAH MARKETING ในเสื้อโปโลโลโก้บริษัท': 'Kru Fah, founder of ADS FAH MARKETING, in the company polo shirt',

    // Reviews
    'รีวิวจากลูกค้า': 'Client reviews', 'เสียงจากผู้เรียนและลูกค้า': 'What students and clients say',
    'แนะนำ Ads Fah Marketing': 'recommend Ads Fah Marketing', 'จาก 13 รีวิวบน Facebook · ดูรีวิวทั้งหมด ↗': 'of 13 Facebook reviews · see all ↗',
    'รีวิวบน Facebook': 'Facebook review', 'ตัวอย่าง': 'Sample',
    'ผู้เรียน': 'Student', 'เจ้าของร้าน · ผู้เรียน': 'Shop owner · student', 'คลินิกศัลยกรรม': 'Cosmetic surgery clinic', 'ธุรกิจออนไลน์': 'Online business',
    'ลดค่าแอดได้เดือนละเกือบแสน': 'Cut ad costs by almost 100,000 THB a month', 'เข้าใจและทำเองได้ภายใน 4 ชม.': 'Running ads alone within 4 hours',
    'จากไม่มีพื้นฐาน สู่การต่อยอดธุรกิจ': 'From zero experience to growing the business', 'วิเคราะห์และปรับผลโฆษณาได้ชัดเจน': 'Clearer analysis and ad results',
    'ประหยัดค่าใช้จ่าย ตรงกลุ่มขึ้น': 'Lower costs, better targeting', 'เข้าใจการวางแผนและวิเคราะห์': 'Understands planning and analysis', 'ประหยัดงบยิงแอด': 'Saved on ad spend',

    // Booking & form
    'สมัครเรียน · จองวันอบรม': 'Enroll · book a date',
    'กรอกข้อมูลไว้ ทีมงานจะติดต่อกลับเพื่อยืนยันวันเรียนและรายละเอียดการชำระเงิน หรือทัก LINE เพื่อคุยได้ทันที':
      'Leave your details and our team will contact you to confirm the date and payment, or message us on LINE to talk right away.',
    'ชื่อ-นามสกุล *': 'Full name *', 'เบอร์โทร *': 'Phone *', 'คอร์สที่สนใจ *': 'Course *', '— เลือกคอร์ส —': '— Choose a course —',
    'รูปแบบการเรียน': 'Format', 'ออนไซต์ (เจอตัว)': 'In person', 'ออนไลน์ (Zoom / Google Meet)': 'Online (Zoom / Google Meet)', 'ยังไม่แน่ใจ': 'Not sure yet',
    'วันที่สะดวกเรียน': 'Preferred date', 'ชื่อธุรกิจ / เพจ': 'Business / page name', 'งบโฆษณาต่อเดือน': 'Monthly ad budget', 'เลือกช่วงงบ': 'Choose a range',
    'ต่ำกว่า 10,000 บาท': 'Under 10,000 THB', '10,000 – 30,000 บาท': '10,000 – 30,000 THB', '30,000 – 100,000 บาท': '30,000 – 100,000 THB', 'มากกว่า 100,000 บาท': 'Over 100,000 THB',
    'รายละเอียดเพิ่มเติม': 'Details', 'ชื่อของคุณ': 'Your name', 'ชื่อแบรนด์หรือเพจ': 'Brand or page name',
    'เล่าเกี่ยวกับธุรกิจ เป้าหมาย หรือคำถามที่อยากถาม': 'Tell us about your business, your goals or your questions',
    'ยินยอมให้ ADS FAH MARKETING ใช้ข้อมูลนี้เพื่อติดต่อกลับเรื่องคอร์สเรียนและบริการ': 'I agree that ADS FAH MARKETING may use this information to contact me about courses and services',
    'ส่งใบสมัคร': 'Send enrollment', 'ส่งคำขอปรึกษา': 'Send request', 'กำลังส่ง...': 'Sending…', 'รอบที่เปิดรับ': 'Open sessions',
    'กรุณากรอกชื่อ': 'Please enter your name', 'กรุณากรอกเบอร์โทรให้ถูกต้อง': 'Please enter a valid phone number',
    'กรุณาเลือกคอร์สที่สนใจ': 'Please choose a course', 'กรุณายินยอมให้ติดต่อกลับ': 'Please agree to be contacted',
    'รูปแบบอีเมลไม่ถูกต้อง': 'Please enter a valid email', 'ส่งข้อมูลถี่เกินไป กรุณาลองใหม่ภายหลัง': 'Too many requests, please try again later',
    'เชื่อมต่อระบบไม่ได้': 'Could not connect', 'ส่งไม่สำเร็จ': 'Could not send', 'หรือทัก': 'or message', 'ได้ทันที': 'right away',
    'กำลังอัปเดตคอร์สเรียน — สอบถามรอบเรียนล่าสุดได้ทาง': 'Courses are being updated — ask about the next session on',

    // FAQ
    'คำถามที่พบบ่อย': 'FAQ', 'ก่อนเริ่มเรียน': 'Before you start',
    'ไม่มีพื้นฐานการยิงแอดเลย เรียนได้ไหม?': 'I’ve never run ads. Can I still join?',
    'ได้ค่ะ หลักสูตรสอนตั้งแต่เริ่มต้น ตั้งแต่การสร้าง Business Manager ไปจนถึงการอ่านผลและ Scale แคมเปญ': 'Yes. The course starts from zero — from creating Business Manager to reading results and scaling campaigns.',
    'ต้องเตรียมอะไรมาบ้าง?': 'What should I bring?',
    'โน้ตบุ๊ก บัญชี Facebook ส่วนตัว และเพจธุรกิจ (ถ้ามี) เพื่อลงมือทำจริงระหว่างเรียน': 'A laptop, your personal Facebook account and your business page (if you have one) so you can practice during class.',
    'เรียนออนไลน์ได้หรือไม่?': 'Can I learn online?',
    'คอร์ส Private 1:1 เรียนได้ทั้งแบบเจอตัวและออนไลน์ เลือกรูปแบบได้ในใบสมัคร': 'The Private 1:1 course is available in person or online — choose the format on the form.',
    'ใช้กับ Instagram ได้ด้วยหรือเปล่า?': 'Does it work for Instagram too?',
    'ได้ค่ะ Facebook และ Instagram ใช้ระบบ Meta Ads เดียวกัน สอนการตั้งค่าตำแหน่งโฆษณาทั้งสองแพลตฟอร์ม': 'Yes. Facebook and Instagram share the same Meta Ads system, and we cover placements on both platforms.',
    'องค์กรต้องการจัดอบรมให้ทีม ทำอย่างไร?': 'How can my company book training for our team?',
    'เลือก “ปรึกษาการตลาด” หรือคอร์ส Corporate Training ในใบสมัคร ทีมงานจะติดต่อกลับเพื่อออกแบบหลักสูตรและส่งใบเสนอราคา': 'Choose “Marketing consultation” or the Corporate Training course on the form. Our team will contact you to design the program and send a quote.',

    // Footer
    'คอร์สสอนยิงแอดและดูแลเพจแบบครบวงจร โดยครูฟ้า ผู้เชี่ยวชาญ Meta Ads': 'Complete ads training and page management by Kru Fah, Meta Ads specialist',
    'โทร 061-826-6465': 'Phone 061-826-6465',
    'บริษัท แอดส์ฟ้ามาเก็ตติ้ง จำกัด (ADS FAH MARKETING Co.,Ltd)': 'ADS FAH MARKETING Co., Ltd.',
    'Facebook และ Instagram เป็นเครื่องหมายการค้าของ Meta Platforms, Inc.': 'Facebook and Instagram are trademarks of Meta Platforms, Inc.',
    'ADS FAH MARKETING Co.,Ltd — บริษัท แอดส์ฟ้ามาเก็ตติ้ง จำกัด': 'ADS FAH MARKETING Co., Ltd.'
  };

  const META = {
    th: { title: document.title, desc: document.querySelector('meta[name="description"]')?.content || '' },
    en: {
      title: 'ADS FAH MARKETING — Facebook & Instagram Ads training by Kru Fah',
      desc: 'ADS FAH MARKETING by Kru Fah, Meta Certified Media Buying Professional: Facebook & Instagram Ads training (private, group, corporate) and ad management services.'
    }
  };

  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const ATTRS = ['alt', 'aria-label', 'placeholder', 'title'];
  const textOrig = new WeakMap();   // Text node → original Thai
  const htmlOrig = new WeakMap();   // Element → original Thai innerHTML
  const attrOrig = new WeakMap();   // Element → { attr: original Thai }
  const SKIP = 'script, style, iframe, textarea, .review__text, [data-no-i18n]';

  const params = new URLSearchParams(location.search);
  let lang = params.get('lang');
  if (lang !== 'en' && lang !== 'th') { try { lang = localStorage.getItem('afm_lang'); } catch { lang = null; } }
  if (lang !== 'en') lang = 'th';

  function translateRich(root) {
    const els = root.nodeType === 1 ? [root, ...root.querySelectorAll('*')] : [];
    for (const el of els) {
      if (el.closest(SKIP)) continue;
      if (lang === 'en') {
        if (htmlOrig.has(el)) continue;
        const key = norm(el.innerHTML);
        if (EN_HTML[key]) { htmlOrig.set(el, el.innerHTML); el.innerHTML = EN_HTML[key]; el.dataset.i18nRich = ''; }
      } else if (htmlOrig.has(el)) {
        el.innerHTML = htmlOrig.get(el); htmlOrig.delete(el); delete el.dataset.i18nRich;
      }
    }
  }

  function translateText(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    if (root.nodeType === 3) nodes.push(root);
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const parent = n.parentElement;
      if (!parent || parent.closest(SKIP) || parent.closest('[data-i18n-rich]')) continue;
      const original = textOrig.has(n) ? textOrig.get(n) : n.nodeValue;
      if (lang === 'en') {
        const en = EN[norm(original)];
        if (en) {
          textOrig.set(n, original);
          const lead = original.match(/^\s*/)[0], trail = original.match(/\s*$/)[0];
          if (n.nodeValue !== lead + en + trail) n.nodeValue = lead + en + trail;
        }
      } else if (textOrig.has(n)) {
        n.nodeValue = original; textOrig.delete(n);
      }
    }
  }

  function translateAttrs(root) {
    const els = root.nodeType === 1 ? [root, ...root.querySelectorAll('[alt],[aria-label],[placeholder],[title]')] : [];
    for (const el of els) {
      if (el.closest('script, style')) continue;
      const saved = attrOrig.get(el) || {};
      for (const a of ATTRS) {
        if (!el.hasAttribute(a)) continue;
        const original = saved[a] ?? el.getAttribute(a);
        if (lang === 'en') {
          const en = EN[norm(original)];
          if (en) { saved[a] = original; if (el.getAttribute(a) !== en) el.setAttribute(a, en); }
        } else if (saved[a] !== undefined) {
          el.setAttribute(a, saved[a]); delete saved[a];
        }
      }
      attrOrig.set(el, saved);
    }
  }

  function translate(root) { translateRich(root); translateText(root); translateAttrs(root); }

  // Re-translate anything the page adds later (courses, form messages, lightbox…)
  let observer;
  function observe() {
    observer = new MutationObserver((muts) => {
      if (lang !== 'en') return;
      observer.disconnect();
      for (const m of muts) {
        if (m.type === 'characterData') { textOrig.delete(m.target); translate(m.target); }
        m.addedNodes.forEach((n) => translate(n));
      }
      observe();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function syncButtons() {
    document.querySelectorAll('[data-set-lang]').forEach((b) => {
      const on = b.dataset.setLang === lang;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on);
    });
  }

  function setLang(next, persist = true) {
    lang = next === 'en' ? 'en' : 'th';
    if (persist) { try { localStorage.setItem('afm_lang', lang); } catch { /* private mode */ } }
    if (observer) observer.disconnect();
    document.documentElement.lang = lang;
    document.title = META[lang].title;
    const d = document.querySelector('meta[name="description"]'); if (d) d.content = META[lang].desc;
    translate(document.body);
    syncButtons();
    observe();
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
  }

  // Public helpers for app.js
  window.I18N = {
    get lang() { return lang; },
    t: (th) => (lang === 'en' && EN[norm(th)]) || th,
    L: (th, en) => (lang === 'en' ? en : th),
    set: setLang
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-set-lang]');
    if (b) { e.preventDefault(); setLang(b.dataset.setLang); }
  });

  const start = () => setLang(lang, false);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
