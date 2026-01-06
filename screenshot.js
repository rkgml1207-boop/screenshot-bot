const puppeteer = require('puppeteer');

// sleep 함수
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const url = process.env.TARGET_URL;
  const requestId = process.env.REQUEST_ID;

  if (!url) {
    throw new Error('TARGET_URL 환경변수가 필요합니다');
  }

  if (!requestId) {
    throw new Error('REQUEST_ID 환경변수가 필요합니다 (n8n에서 request_id를 넘겨야 합니다)');
  }

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

  await page.setViewport({
    width: 400,
    height: 800,
    deviceScaleFactor: 3,
  });

  await page.goto(url, { waitUntil: 'networkidle0' });

  // 웹폰트 로딩 대기
  await page.evaluateHandle('document.fonts.ready');
  await sleep(500);

  // 불필요한 UI 제거
  await page.evaluate(() => {
    const selectorsToRemove = [
      '.Ngnb',                    // 상단 헤더
      '.interact_section__y00DX', // 공감
      '.comment_area__nxrQe',     // 댓글
      '.splugin_area__Ajs0X',     // 스크랩/공유
      '#ad-bottom-portal',        // 하단 광고
      '[id^="ad-content"]',       // 중간 광고
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

  // 본문 컨테이너 캡처
  const content = await page.$('.se-main-container');
  if (!content) {
    throw new Error('❌ se-main-container를 찾을 수 없습니다');
  }

  await content.screenshot({
    path: 'screenshot.png',
  });

  await browser.close();

  console.log('✅ Screenshot saved: screenshot.png');
})();
