import assert from 'node:assert/strict';
import {connectPage} from './browser-check.mjs';
const page=await connectPage({port:9335,url:'file:///Users/shiruixing/Desktop/csp/civil/index.html',timeout:60000});
try{
 await page.reload();
 await page.evaluate(`document.getElementById('newGameButton').click()`);
 assert.equal(await page.evaluate(`!!document.querySelector('[data-start-mode="governance"]')`),true);
 await page.evaluate(`document.querySelector('[data-start-mode="governance"]').click();document.getElementById('worldSeed').value='48271';document.getElementById('newGameForm').requestSubmit()`);
 assert.equal(await page.evaluate(`document.getElementById('startScreen').classList.contains('hidden')`),true);
 assert.equal(await page.evaluate(`document.querySelector('[data-panel="build"]').classList.contains('hidden')`),true);
 await page.evaluate(`document.querySelectorAll('#ackEvent').forEach(b=>b.click());document.getElementById('ackEvent')?.click();document.getElementById('cabinetButton').click()`);
 assert.equal(await page.evaluate(`document.querySelectorAll('[data-direction]').length`),4);
 assert.ok(await page.evaluate(`document.querySelectorAll('.government-letter').length`));
 await page.evaluate(`document.getElementById('cabinetBudget').click()`);
 assert.ok(await page.evaluate(`document.querySelectorAll('[data-tax]').length>=4`));
 await page.send('Page.captureScreenshot',{format:'png'}).then(async result=>{const{writeFile,mkdir}=await import('node:fs/promises');await mkdir('artifacts',{recursive:true});await writeFile('artifacts/governance-mode.png',Buffer.from(result.data,'base64'));});
 assert.equal(page.errors.length,0,JSON.stringify(page.errors));
 console.log('5 governance browser checks passed (file:// start, restrictions, policy directions, letters, tax controls); no page errors');
}finally{await page.close();}
