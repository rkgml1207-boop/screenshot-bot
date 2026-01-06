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
  deviceScaleFactor: 3, // 글자/이미지 선명도 ↑
});


  await page.goto(url, {
    waitUntil: 'networkidle0',
  });

  // ✅ 웹폰트 로딩 완료 대기
  await page.evaluateHandle('document.fonts.ready');

  // ✅ 이미지/레이아웃 안정화 대기
  await sleep(500);

  // ✅ 문제되는 UI 숨김 (레이아웃 유지)
  await page.addStyleTag({
    content: `
      .interact_section__y00DX {
        visibility: hidden !important;
      }
      * {
        animation: none !important;
        transition: none !important;
      }
    `,
  });

  await sleep(300);

  await page.screenshot({
    path: 'screenshot.png',
    fullPage: true,
  });

  await browser.close();

  console.log('✅ Screenshot saved: screenshot.png');
})();
