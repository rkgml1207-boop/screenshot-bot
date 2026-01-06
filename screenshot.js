const puppeteer = require('puppeteer');

// sleep 함수 (waitForTimeout 대체)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const url = process.env.TARGET_URL;

  if (!url) {
    throw new Error('TARGET_URL 환경변수가 필요합니다');
  }

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

  await page.goto(url, {
    waitUntil: 'networkidle0',
  });

  // ✅ 웹폰트 로딩 완료 대기
  await page.evaluateHandle('document.fonts.ready');

  // ✅ 이미지/레이아웃 안정화
  await sleep(500);

  // ✅ 불필요한 UI/광고 제거 (레이아웃 영향 최소)
  await page.evaluate(() => {
    const selectorsToRemove = [
      '.interact_section__y00DX',
      '.comment_area__nxrQe',
      '.splugin_area__Ajs0X',
      '#ad-bottom-portal',
      '[id^="ad-content"]',
    ];

    selectorsToRemove.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => el.remove());
    });

    // 애니메이션/트랜지션 완전 제거
    document.querySelectorAll('*').forEach(el => {
      el.style.animation = 'none';
      el.style.transition = 'none';
    });
  });

  await sleep(300);

  // ✅ 본문 컨테이너만 선택
  const content = await page.$('.se-main-container');
  if (!content) {
    throw new Error('❌ se-main-container를 찾을 수 없습니다');
  }

  // ✅ 컨테이너 기준 캡처
  await content.screenshot({
    path: 'screenshot.png',
  });

  await browser.close();

  console.log('✅ Screenshot saved: screenshot.png');
})();
