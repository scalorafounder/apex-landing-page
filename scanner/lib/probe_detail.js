// Probe what happens when we click various elements in a result row.
// Goal: figure out how to reach the document's grantor/address detail.

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const DEBUG = path.resolve('./debug-probe');

async function main() {
  await mkdir(DEBUG, { recursive: true });
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  console.log('📂 Loading Suffolk...');
  await page.goto('http://www.masslandrecords.com/Suffolk', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  await page.selectOption('#SearchCriteriaName1_DDL_SearchName', { label: 'Recorded Date Search' });
  await page.waitForTimeout(2500);

  await page.click('#SearchFormEx1_BtnAdvanced');
  await page.waitForTimeout(2500);

  // Last 7 days, all our doc types
  await page.fill('#SearchFormEx1_DRACSTextBox_DateFrom', '4/30/2026');
  await page.fill('#SearchFormEx1_DRACSTextBox_DateTo', '5/6/2026');
  await page.selectOption('#SearchFormEx1_ACSDropDownList_DocumentType', [
    { label: 'LIS PENDENS' }, { label: 'TAX LIEN' }, { label: 'INSTRUMENT OF TAKING' },
    { label: 'ORDER OF TAKING' }, { label: 'LIEN' }, { label: 'NOTICE' },
  ]);
  await page.click('#SearchFormEx1_btnSearch');
  await page.waitForTimeout(8000);
  await page.screenshot({ path: path.join(DEBUG, '00_results.png'), fullPage: true });

  // Dump the FULL HTML of the first result row
  const rowHtml = await page.evaluate(() => {
    const cb = document.querySelector('input[id^="chkDocList1_GridView_Document"]');
    if (!cb) return null;
    let row = cb.closest('tr');
    return row ? row.outerHTML : null;
  });
  console.log('\n=== FIRST ROW HTML ===\n');
  console.log(rowHtml);
  await writeFile(path.join(DEBUG, '01_first_row.html'), rowHtml || '');

  // Try clicking the row's "ImgBut" image button — this is supposed to open the doc image
  console.log('\n🖱️  Clicking the first row image button...');
  const beforeUrl = page.url();
  // The first data row is index 0, button id is _ctl02_ImgBut (off by 2 from row idx)
  const btn = await page.$('#DocList1_GridView_Document_ctl02_ImgBut');
  if (btn) {
    const [popup] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null),
      btn.click(),
    ]);
    await page.waitForTimeout(3000);
    const target = popup || page;
    const afterUrl = target.url();
    console.log(`   Before URL: ${beforeUrl}`);
    console.log(`   After URL:  ${afterUrl}`);
    console.log(`   Popup opened: ${!!popup}`);
    await target.screenshot({ path: path.join(DEBUG, '02_after_imgbut_click.png'), fullPage: true });
    const html = await target.content();
    await writeFile(path.join(DEBUG, '02_after_imgbut_click.html'), html);
    if (popup) await popup.close().catch(() => {});
  } else {
    console.log('   ❌ Image button not found at expected id');
  }

  // Now try clicking the row TEXT itself (not the button)
  await page.waitForTimeout(2000);
  console.log('\n🖱️  Trying to click on the book/page cell...');
  const cellClick = await page.evaluate(() => {
    const cb = document.querySelector('input[id^="chkDocList1_GridView_Document"]');
    if (!cb) return 'no checkbox';
    const row = cb.closest('tr');
    const cells = row?.querySelectorAll('td') || [];
    const results = [];
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const aTags = c.querySelectorAll('a');
      const links = [...aTags].map(a => ({
        text: (a.textContent || '').trim().slice(0, 40),
        href: a.href,
        onclick: a.getAttribute('onclick'),
        id: a.id,
      }));
      results.push({
        idx: i,
        text: (c.textContent || '').trim().slice(0, 40),
        links,
      });
    }
    return results;
  });
  console.log('   Cell breakdown:');
  for (const c of cellClick) {
    console.log(`   cell[${c.idx}] text="${c.text}" links=${JSON.stringify(c.links)}`);
  }

  // Find a BOSTON-tagged LIEN or NOTICE row (more likely to have property info)
  console.log('\n🔎 Finding a BOSTON-tagged row to probe...');
  const targetRow = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr');
    for (const tr of rows) {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 5) continue;
      const cb = cells[0].querySelector('input[type="checkbox"]');
      if (!cb || !cb.id?.startsWith('chkDocList1_GridView_Document')) continue;
      const town = cells[4]?.textContent?.trim();
      const type = cells[3]?.textContent?.trim();
      if (town === 'BOSTON' && (type === 'LIEN' || type === 'NOTICE' || type === 'LIS PENDENS')) {
        const link = cells[2].querySelector('a');
        return {
          rowIdx: cb.id.replace('chkDocList1_GridView_Document', ''),
          bookPage: cells[2].textContent?.trim(),
          docType: type,
          linkId: link?.id,
        };
      }
    }
    return null;
  });

  if (!targetRow) {
    console.log('   ❌ No BOSTON-tagged LIEN/NOTICE/LIS PENDENS in current results');
  } else {
    console.log(`   Found: ${targetRow.docType} ${targetRow.bookPage} (rowIdx=${targetRow.rowIdx})`);
    console.log(`   Link id: ${targetRow.linkId}`);

    const escapedSelector = '#' + targetRow.linkId.replace(/\//g, '\\/');
    const detailLink = await page.$(escapedSelector);
    if (detailLink) {
      await detailLink.click();
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(DEBUG, '03_boston_detail.png'), fullPage: true });
      const text = await page.evaluate(() => document.body.innerText);
      await writeFile(path.join(DEBUG, '03_boston_detail.txt'), text);
      console.log('\n=== BOSTON ROW DETAIL (first 4000 chars after results table) ===\n');
      // Skip past the search-results portion of the page text
      const detailStart = text.indexOf('Doc. #');
      console.log(text.slice(detailStart, detailStart + 4000));

      // Also try clicking "View Details" toggle to see if it expands more info
      console.log('\n🖱️  Looking for "View Details" link...');
      const vdLink = await page.$('a:has-text("View Details")');
      if (vdLink) {
        await vdLink.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(DEBUG, '04_view_details_clicked.png'), fullPage: true });
        const fullText = await page.evaluate(() => document.body.innerText);
        await writeFile(path.join(DEBUG, '04_view_details.txt'), fullText);
        const vdStart = fullText.indexOf('Doc. #');
        console.log('\n=== AFTER VIEW DETAILS ===\n');
        console.log(fullText.slice(vdStart, vdStart + 4000));
      } else {
        console.log('   ❌ View Details link not found');
      }
    }
  }

  console.log('\n⏸️  Browser staying open 30s for manual inspection');
  await page.waitForTimeout(30_000);

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
