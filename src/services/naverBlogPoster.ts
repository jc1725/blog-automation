import { Builder, By, Key, until, WebDriver } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';

export interface NaverPublishResult {
  url: string;
}

const NAVER_LOGIN_URL = 'https://nid.naver.com/nidlogin.login';
const DEFAULT_TIMEOUT = 15_000;

/**
 * 네이버 블로그 자동 로그인 + 글쓰기 + 발행.
 *
 * 주의: 네이버 스마트에디터는 iframe 안에 contenteditable 영역으로 구성되어 있고
 * 마크업이 수시로 바뀝니다. 아래 셀렉터가 깨질 경우 헤드리스를 끄고
 * (SELENIUM_HEADLESS=false) 직접 화면을 보면서 셀렉터를 갱신하세요.
 */
export async function postToNaverBlog(title: string, contentHtml: string): Promise<NaverPublishResult> {
  if (!env.naver.id || !env.naver.password || !env.naver.blogUrl) {
    throw new AppError('네이버 계정/블로그 URL이 설정되지 않았습니다. .env를 확인하세요.', 500);
  }

  const driver = await buildDriver();

  try {
    await login(driver);
    const postUrl = await writeAndPublish(driver, title, contentHtml);
    logger.info(`네이버 블로그 발행 완료: ${postUrl}`);
    return { url: postUrl };
  } catch (error) {
    logger.error(`네이버 블로그 발행 실패: ${(error as Error).message}`);
    throw new AppError(`네이버 블로그 발행 중 오류가 발생했습니다: ${(error as Error).message}`, 502);
  } finally {
    await driver.quit();
  }
}

async function buildDriver(): Promise<WebDriver> {
  const options = new chrome.Options();
  if (env.naver.headless) {
    options.addArguments('--headless=new');
  }
  options.addArguments(
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--window-size=1400,1000',
    '--lang=ko-KR'
  );
  if (env.naver.chromeBin) {
    options.setChromeBinaryPath(env.naver.chromeBin);
  }

  return new Builder().forBrowser('chrome').setChromeOptions(options).build();
}

async function login(driver: WebDriver): Promise<void> {
  await driver.get(NAVER_LOGIN_URL);

  // 네이버는 자동화 탐지를 위해 input에 sendKeys 대신 값 주입을 감지하기도 하므로
  // execute_script로 id/pw를 채운 뒤 이벤트를 발생시킨다.
  await driver.wait(until.elementLocated(By.id('id')), DEFAULT_TIMEOUT);
  await driver.executeScript(
    `document.getElementById('id').value = arguments[0];
     document.getElementById('pw').value = arguments[1];`,
    env.naver.id,
    env.naver.password
  );

  await driver.findElement(By.id('log.login')).click();

  await driver.wait(until.urlContains('naver.com'), DEFAULT_TIMEOUT);

  // 2단계 인증/기기 등록 안내 화면이 뜰 수 있음 — 로그인 성공 여부를 쿠키로 대략 확인
  const cookies = await driver.manage().getCookies();
  const loggedIn = cookies.some((c) => c.name === 'NID_AUT');
  if (!loggedIn) {
    throw new AppError('네이버 로그인에 실패했습니다 (2단계 인증/캡차 가능성). 헤드리스를 끄고 확인하세요.', 401);
  }
}

async function writeAndPublish(driver: WebDriver, title: string, contentHtml: string): Promise<string> {
  const writeUrl = `${env.naver.blogUrl.replace(/\/$/, '')}?Redirect=Write`;
  await driver.get(writeUrl);

  // 스마트에디터 ONE은 여러 개의 iframe으로 구성됨 (mainFrame > 에디터 iframe)
  await driver.wait(until.elementLocated(By.id('mainFrame')), DEFAULT_TIMEOUT);
  await driver.switchTo().frame('mainFrame');

  // 작성 중이던 글이 있으면 뜨는 "이어쓰기" 팝업 닫기 (있을 때만)
  await dismissPopupIfPresent(driver, '.se-popup-button-cancel');

  // 제목 입력
  const titleArea = await driver.wait(
    until.elementLocated(By.css('.se-title-text .se-text-paragraph')),
    DEFAULT_TIMEOUT
  );
  await titleArea.click();
  await driver.actions().sendKeys(title).perform();

  // 본문 입력 (컨테이너를 클릭해 포커스 이동 후 HTML 붙여넣기는 클립보드 권한이 필요하므로
  // 텍스트 흐름으로 입력한다 — 서식이 중요하면 execute_script로 innerHTML을 직접 채우는 방식을 사용)
  const bodyArea = await driver.findElement(By.css('.se-component-content .se-text-paragraph'));
  await bodyArea.click();
  await driver.executeScript(
    `const el = document.querySelector('.se-component-content .se-text-paragraph');
     if (el) el.innerHTML = arguments[0];`,
    contentHtml
  );
  await driver.actions().sendKeys(Key.END).perform();

  // 발행 버튼
  const publishOpenBtn = await driver.wait(
    until.elementLocated(By.css('.publish_btn_area button, .btn_publish')),
    DEFAULT_TIMEOUT
  );
  await publishOpenBtn.click();

  const confirmBtn = await driver.wait(
    until.elementLocated(By.css('.layer_publish button.btn_publish, .confirm_btn')),
    DEFAULT_TIMEOUT
  );
  await confirmBtn.click();

  await driver.wait(until.urlContains('blog.naver.com'), DEFAULT_TIMEOUT);
  return driver.getCurrentUrl();
}

async function dismissPopupIfPresent(driver: WebDriver, selector: string): Promise<void> {
  try {
    const el = await driver.findElement(By.css(selector));
    await el.click();
  } catch {
    // 팝업이 없으면 무시
  }
}
