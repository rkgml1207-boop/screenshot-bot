const puppeteer = require('puppeteer');

// sleep 함수
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const MAX_TOTAL_WAIT = 30_000; // 🔥 전체 최대 30초

(async () => {
  const rawUrl = process.env.TARGET_URL;
  const requestId = process.env.REQUEST_ID;

  if (!rawUrl) {
    throw new Error('❌ TARGET_URL 환경변수가 필요합니다');
  }
  if (!requestId) {
    throw new Error('❌ REQUEST_ID 환경변수가 필요합니다');
  }

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

  await page.setViewport({
    width: 400,
    height: 800,
    deviceScaleFactor: 3,
  });

  // 1️⃣ 페이지 진입 (최대 30초)
  await page.goto(url, {
    waitUntil: 'networkidle0',
    timeout: 30_000,
  });

  // 2️⃣ 웹폰트 (최대 2초)
  await Promise.race([
    page.evaluateHandle('document.fonts.ready'),
    sleep(2000),
  ]);

  // 🔥 3~4단계를 하나로 묶어서 "최대 30초" 제한
  await Promise.race([
    (async () => {
      // 3️⃣ lazy-load 스크롤 (최대 6초)
      await page.evaluate(async () => {
        const start = Date.now();
        const MAX_SCROLL_TIME = 6000;

        await new Promise(resolve => {
          let totalHeight = 0;
          const distance = 300;
          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (
              totalHeight >= document.body.scrollHeight ||
              Date.now() - start > MAX_SCROLL_TIME
            ) {
              clearInterval(timer);
              resolve();
            }
          }, 200);
        });
      });

      // 4️⃣ 이미지 로딩 대기 (최대 5초)
      await page.evaluate(async () => {
        const MAX_IMAGE_WAIT = 5000;
        const start = Date.now();
        const imgs = Array.from(document.images);

        await Promise.all(
          imgs.map(img => {
            if (img.complete) return;

            return new Promise(resolve => {
              const timer = setInterval(() => {
                if (
                  img.complete ||
                  Date.now() - start > MAX_IMAGE_WAIT
                ) {
                  clearInterval(timer);
                  resolve();
                }
              }, 100);

              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
            });
          })
        );
      });
    })(),
    sleep(MAX_TOTAL_WAIT), // 🔥 30초 지나면 강제 종료
  ]);

  // 5️⃣ 안정화 딜레이 (짧게)
  await sleep(500);

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
