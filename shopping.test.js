const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

const FILE_URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message}`);
    failed++;
  }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // localStorage 초기화 후 페이지 열기
  await page.goto(FILE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // ── 아이템 추가 ────────────────────────────────────────────────
  console.log('\n📋 아이템 추가');

  await test('입력창이 비어 있으면 추가되지 않는다', async () => {
    await page.click('button:has-text("추가")');
    const count = await page.locator('.item').count();
    assert.strictEqual(count, 0, `항목이 추가되면 안 됨 (실제: ${count})`);
  });

  await test('항목을 입력하고 추가 버튼으로 추가된다', async () => {
    await page.fill('#input', '사과');
    await page.click('button:has-text("추가")');
    const count = await page.locator('.item').count();
    assert.strictEqual(count, 1, `항목 수가 1이어야 함 (실제: ${count})`);
    const text = await page.locator('.item-text').first().textContent();
    assert.strictEqual(text, '사과', `텍스트가 "사과"여야 함 (실제: "${text}")`);
  });

  await test('Enter 키로도 항목이 추가된다', async () => {
    await page.fill('#input', '우유');
    await page.press('#input', 'Enter');
    const count = await page.locator('.item').count();
    assert.strictEqual(count, 2, `항목 수가 2여야 함 (실제: ${count})`);
  });

  await test('추가 후 입력창이 비워진다', async () => {
    const val = await page.inputValue('#input');
    assert.strictEqual(val, '', `입력창이 비워져야 함 (실제: "${val}")`);
  });

  await test('여러 항목을 연속으로 추가할 수 있다', async () => {
    for (const item of ['바나나', '빵', '달걀']) {
      await page.fill('#input', item);
      await page.press('#input', 'Enter');
    }
    const count = await page.locator('.item').count();
    assert.strictEqual(count, 5, `항목 수가 5여야 함 (실제: ${count})`);
  });

  // ── 체크 기능 ──────────────────────────────────────────────────
  console.log('\n✔️  체크 기능');

  await test('체크박스 클릭 시 항목에 done 클래스가 추가된다', async () => {
    await page.locator('.item input[type="checkbox"]').first().click();
    const hasDone = await page.locator('.item').first().evaluate(el => el.classList.contains('done'));
    assert.ok(hasDone, 'done 클래스가 없음');
  });

  await test('체크된 항목의 텍스트에 취소선이 적용된다', async () => {
    const decoration = await page.locator('.item.done .item-text').first()
      .evaluate(el => getComputedStyle(el).textDecoration);
    assert.ok(decoration.includes('line-through'), `취소선 없음 (실제: "${decoration}")`);
  });

  await test('다시 클릭하면 체크가 해제된다', async () => {
    await page.locator('.item input[type="checkbox"]').first().click();
    const hasDone = await page.locator('.item').first().evaluate(el => el.classList.contains('done'));
    assert.ok(!hasDone, '체크 해제가 되지 않음');
  });

  await test('요약 텍스트에 완료 개수가 표시된다', async () => {
    await page.locator('.item input[type="checkbox"]').first().click();
    await page.locator('.item input[type="checkbox"]').nth(1).click();
    const summary = await page.locator('#summary').textContent();
    assert.ok(summary.includes('완료 2개'), `요약에 "완료 2개" 없음 (실제: "${summary}")`);
  });

  // ── 아이템 삭제 ────────────────────────────────────────────────
  console.log('\n🗑️  아이템 삭제');

  await test('✕ 버튼으로 개별 항목이 삭제된다', async () => {
    const before = await page.locator('.item').count();
    await page.locator('.del-btn').first().click();
    const after = await page.locator('.item').count();
    assert.strictEqual(after, before - 1, `삭제 후 항목이 ${before - 1}개여야 함 (실제: ${after})`);
  });

  await test('"완료 항목 삭제" 버튼으로 체크된 항목만 삭제된다', async () => {
    const doneBefore = await page.locator('.item.done').count();
    const totalBefore = await page.locator('.item').count();
    await page.click('#clear-btn');
    const totalAfter = await page.locator('.item').count();
    assert.strictEqual(totalAfter, totalBefore - doneBefore,
      `완료 항목만 삭제되어야 함 (이전: ${totalBefore}, 완료: ${doneBefore}, 이후: ${totalAfter})`);
    const doneAfter = await page.locator('.item.done').count();
    assert.strictEqual(doneAfter, 0, '완료 항목이 남아 있음');
  });

  await test('모든 항목 삭제 후 빈 상태 메시지가 표시된다', async () => {
    const remaining = await page.locator('.item').count();
    for (let i = 0; i < remaining; i++) {
      await page.locator('.del-btn').first().click();
    }
    const emptyVisible = await page.locator('#empty').isVisible();
    assert.ok(emptyVisible, '빈 상태 메시지가 보여야 함');
  });

  // ── localStorage 영속성 ────────────────────────────────────────
  console.log('\n💾 localStorage 영속성');

  await test('항목이 localStorage에 저장된다', async () => {
    await page.fill('#input', '저장테스트');
    await page.press('#input', 'Enter');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('shopping') || '[]'));
    assert.ok(stored.some(i => i.text === '저장테스트'), 'localStorage에 항목 없음');
  });

  await test('페이지 새로고침 후에도 항목이 유지된다', async () => {
    await page.reload();
    const count = await page.locator('.item').count();
    assert.ok(count > 0, '새로고침 후 항목이 사라짐');
    const text = await page.locator('.item-text').first().textContent();
    assert.strictEqual(text, '저장테스트', `텍스트가 유지되어야 함 (실제: "${text}")`);
  });

  await test('체크 상태도 새로고침 후 유지된다', async () => {
    await page.locator('.item input[type="checkbox"]').first().click();
    await page.reload();
    const hasDone = await page.locator('.item').first().evaluate(el => el.classList.contains('done'));
    assert.ok(hasDone, '체크 상태가 유지되지 않음');
  });

  // ── 결과 출력 ──────────────────────────────────────────────────
  await browser.close();

  const total = passed + failed;
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`결과: ${passed}/${total} 통과  (실패: ${failed})`);
  if (failed === 0) {
    console.log('🎉 모든 테스트를 통과했습니다!\n');
  } else {
    console.log('⚠️  일부 테스트가 실패했습니다.\n');
    process.exit(1);
  }
})();