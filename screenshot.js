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

  // ✅ n8n/GitHub에서 앞에 붙는 "=" 제거
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

  // ✅ 가로폭 400px 고정
  await page.setViewport({
    width: 400,
    height: 800,
    deviceScaleFactor: 3,
  });

  await page.goto(url, { waitUntil: 'networkidle0' });

  // 웹폰트 대기
  await page.evaluateHandle('document.fonts.ready');
  await sleep(500);

  // ✅ 공감 / 댓글 / 스크랩 / 광고 / 헤더 제거
  await page.evaluate(() => {
    const selectorsToRemove = [
      '.interact_section__y00DX', // 공감
      '.comment_area__nxrQe',     // 댓글
      '.splugin_area__Ajs0X',     // 공유/스크랩
      '.Ngnb',                   // 상단 헤더
      '#ad-bottom-portal',
      '[id^="ad-content"]',
    ];

    selectorsToRemove.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => el.remove());
    });

    // 애니메이션 완전 제거
    document.querySelectorAll('*').forEach(el => {
      el.style.animation = 'none';
      el.style.transition = 'none';
    });
  });

  await sleep(300);

  // ✅ 본문 컨테이너만 캡처
  const content = await page.$('.se-main-container');
  if (!content) {
    throw new Error('❌ se-main-container를 찾을 수 없습니다');
  }

  // ✅ request_id 기반 파일명 (동시 요청 절대 안 엉킴)
  const fileName = `screenshot_${requestId}.png`;

  await content.screenshot({ path: fileName });

  await browser.close();

  console.log(`✅ Screenshot saved: ${fileName}`);
})();
