const puppeteer = require('puppeteer');
const fs = require('fs');

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

  // 뷰포트 (필요하면 조절)
  await page.setViewport({
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
  });

  // 페이지 로드
  await page.goto(url, {
    waitUntil: 'networkidle0',
  });

  // 🔥 웹폰트 로딩 완료 대기
  await page.evaluateHandle('document.fonts.ready');

  // 🔥 이미지 디코딩 안정화 대기
  await page.waitForTimeout(500);

  // 🔥 문제되는 인터랙션 영역 안전하게 숨김 (레이아웃 유지)
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

  // 한 프레임 더 안정화
  await page.waitForTimeout(300);

  // 스크린샷
  await page.screenshot({
    path: 'screenshot.png',
    fullPage: true,
  });

  await browser.close();

  console.log('✅ Screenshot saved: screenshot.png');
})();
