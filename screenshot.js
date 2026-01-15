const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const MAX_LOADING_TIME = 40_000;
const MAX_TOTAL_TIME = 90_000;

async function isFontBroken(page) {
  return await page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    let checked = 0;
    while (walker.nextNode() && checked < 50) {
      const t = walker.currentNode.textContent;
      if (t && /[\u25A1\u25A0\uFFFD]/.test(t)) return true;
      checked++;
    }
    return false;
  });
}

/**
 * ✅ 한글 웹폰트 "로드만" 수행
 * ❌ font-family 강제 지정 절대 없음
 */
async function injectKoreanWebFonts(page) {
  const fontCssUrls = [
    'https://hangeul.pstatic.net/hangeul_static/css/nanum-gothic.css',
    'https://hangeul.pstatic.net/hangeul_static/css/maru-buri.css',
    'https://hangeul.pstatic.net/hangeul_static/css/nanum-myeongjo.css',
    'https://hangeul.pstatic.net/hangeul_static/css/NanumDaSiSiJagHae.css',
    'https://hangeul.pstatic.net/hangeul_static/css/NanumBaReunHiPi.css',
  ];

  // 1️⃣ 웹폰트 CSS 주입
  for (const url of fontCssUrls) {
    await page.addStyleTag({ url });
  }

  // 2️⃣ 실제 font-face 다운로드 강제
  await page.evaluate(async () => {
    const fonts = [
      // Nanum Gothic
      'NanumGothic',
      'NanumGothicBold',
      'NanumGothicExtraBold',
      'NanumGothicLight',

      // MaruBuri
      'MaruBuriExtraLight',
      'MaruBuriLight',
      'MaruBuri',
      'MaruBuriSemiBold',
      'MaruBuriBold',

      // Nanum Myeongjo
      'NanumMyeongjo',
      'NanumMyeongjoBold',
      'NanumMyeongjoExtraBold',

      // Etc
      'NanumDaSiSiJagHae',
      'NanumBaReunHiPi',
    ];

    await Promise.all(
      fonts.map(f =>
        document.fonts.load(`16px "${f}"`).catch(() => {})
      )
    );

    await document.fonts.ready;
  });
}

/**
 * 🔧 네모(□) 깨진 텍스트만 fallback 적용
 */
async function fixBrokenFontsOnly(page) {
  await page.addStyleTag({
    content: `
      .__font_fallback__ {
        font-family: "NanumGothic", sans-serif !important;
      }
    `,
  });

  await page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );

    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent && /[\u25A1\u25A0\uFFFD]/.test(node.textContent)) {
        node.parentElement?.classList.add('__font_fallback__');
      }
    }
  });
}

(async () => {
  const startTime = Date.now();

  const rawUrl = process.env.TARGET_URL;
  const requestId = process.env.REQUEST_ID;
  if (!rawUrl || !requestId) throw new Error('env missing');

  const url = rawUrl.replace(/^=/, '');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({
    width: 400,
    height: 800,
    deviceScaleFactor: 3,
  });

  // 페이지 진입
  await page.goto(url, {
    waitUntil: 'networkidle0',
    timeout: 30_000,
  });

  // ✅ 웹폰트 로드 (디자인 유지)
  await injectKoreanWebFonts(page);
  await sleep(500);

  // 기존 폰트 대기 로직 유지
  await Promise.race([
    page.evaluateHandle('document.fonts.ready'),
    sleep(2000),
  ]);

  // 🔥 로딩 전체 제한
  await Promise.race([
    (async () => {
      // lazy-load 스크롤
      await page.evaluate(async () => {
        const start = Date.now();
        const MAX_SCROLL = 15_000;
        await new Promise(resolve => {
          let y = 0;
          const timer = setInterval(() => {
            window.scrollBy(0, 300);
            y += 300;
            if (
              y >= document.body.scrollHeight ||
              Date.now() - start > MAX_SCROLL
            ) {
              clearInterval(timer);
              resolve();
            }
          }, 300);
        });
      });

      // 이미지 고해상도 대기
      await page.evaluate(async () => {
        const start = Date.now();
        const MAX_WAIT = 25_000;
        const imgs = Array.from(
          document.querySelectorAll('.se-main-container img')
        );

        await Promise.all(
          imgs.map(img => {
            const initial = img.currentSrc || img.src;
            return new Promise(resolve => {
              const check = () => {
                const cur = img.currentSrc || img.src;
                if (
                  cur &&
                  cur !== initial &&
                  !/blur|thumb|placeholder|low/i.test(cur)
                ) {
                  resolve();
                }
                if (Date.now() - start > MAX_WAIT) resolve();
              };

              const obs = new MutationObserver(check);
              obs.observe(img, {
                attributes: true,
                attributeFilter: ['src', 'srcset'],
              });

              const timer = setInterval(check, 300);
              setTimeout(() => {
                clearInterval(timer);
                obs.disconnect();
                resolve();
              }, MAX_WAIT);
            });
          })
        );
      });
    })(),
    sleep(MAX_LOADING_TIME),
  ]);

  // 본문 selector
  let content;
  try {
    await page.waitForSelector('.se-main-container', { timeout: 10_000 });
    content = await page.$('.se-main-container');
  } catch {
    content = await page.$('body');
  }

  // UI 제거
  await page.evaluate(() => {
    [
      '.interact_section__y00DX',
      '.comment_area__nxrQe',
      '.splugin_area__Ajs0X',
      '.Ngnb',
      '#ad-bottom-portal',
      '[id^="ad-content"]',
    ].forEach(s =>
      document.querySelectorAll(s).forEach(e => e.remove())
    );
  });

  const filePath = `screenshot_${requestId}.png`;

  // 1차 캡처
  await content.screenshot({ path: filePath });

  // 🔁 네모 깨짐 있을 때만 fallback 적용 후 재캡처
  if (await isFontBroken(page)) {
    console.warn('⚠️ Font broken detected → applying fallback');
    await fixBrokenFontsOnly(page);
    await sleep(1000);
    await content.screenshot({ path: filePath });
  }

  if (Date.now() - startTime > MAX_TOTAL_TIME) {
    console.warn('⏱️ Total time exceeded');
  }

  await browser.close();
})();
