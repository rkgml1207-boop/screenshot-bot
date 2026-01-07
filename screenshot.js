const puppeteer = require('puppeteer');

// sleep 함수
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const rawUrl = process.env.TARGET_URL;
  const requestId = process.env.REQUEST_ID;

  if (!rawUrl) {
    throw new Error('❌ TARGET_URL 환경변수가 필요합니다');
  }
  if (!requestId) {
    throw new Error('❌ REQUEST_ID 환경변수가 필요합니다');
  }

  // n8n/GitHub에서 앞에 붙는 "=" 제거
  const url = rawUrl.replace(/^=/, '');

  console.log('▶ REQUEST_ID:', requestId);
  console.log('▶ URL:', url);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
    ],
  });

  const page = await browser.newPage();

  // 가로폭 400px 고정
  await page.setViewport({
    width: 400,
    height: 800,
    deviceScaleFactor: 3,
  });

  // 1️⃣ 페이지 진입
  await page.goto(url, { waitUntil: 'networkidle0' });

  // 2️⃣ 웹폰트 대기
  await page.evaluateHandle('document.fonts.ready');

  // 3️⃣ lazy-load 트리거 (스크롤)
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });

  // 4️⃣ 이미지 로딩 완료 대기 (핵심)
  await page.evaluate(async () => {
    const imgs = Array.from(document.images);

    await Promise.all(
      imgs.map(img => {
        if (img.complete && img.naturalWidth !== 0) {
          return;
        }

        return new Promise(resolve => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
      })
    );
  });

  // 5️⃣ 안정화 딜레이
  await sleep(800);

  // 6️⃣ 불필요 UI 제거
  await page.evaluate(() => {
    const selectorsToRemove = [
      '.interact_section__y00DX',
      '.comment_area__nxrQe',
      '.splugin_area__Ajs0X',
      '.Ngnb',
      '#ad-bottom-portal',
      '[id^="ad-content"]',
    ];

    selectorsToRemove.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => el.remove());
    });

    document.querySelectorAll('*').forEach(el => {
      el.style.animation = 'none';
      el.style.transition = 'none';
    });
  });

  await sleep(300);

  // 7️⃣ 본문 캡처
  const content = await page.$('.se-main-container');
  if (!content) {
    throw new Error('❌ se-main-container를 찾을 수 없습니다');
  }

  const fileName = `screenshot_${requestId}.png`;
  await content.screenshot({ path: fileName });

  await browser.close();
  console.log(`✅ Screenshot saved: ${fileName}`);
})();
