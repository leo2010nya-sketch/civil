import assert from 'node:assert/strict';
import {connectPage} from './browser-check.mjs';
const p=await connectPage({port:9335,url:'file:///Users/shiruixing/Desktop/csp/civil/index.html',timeout:60000});
try{
 await p.send('Network.enable');await p.send('Network.setCacheDisabled',{cacheDisabled:true});await p.send('Page.navigate',{url:'file:///Users/shiruixing/Desktop/csp/civil/index.html?panels=20261125'});await new Promise(r=>setTimeout(r,700));p.errors.length=0;await p.viewport(1440,1000);
 await p.evaluate(`document.getElementById('newGameButton').click();document.getElementById('worldSeed').value='48271';document.getElementById('newGameForm').requestSubmit();document.getElementById('ackEvent')?.click();document.querySelector('[data-panel="policy"]').click();document.getElementById('workspaceNew').click()`);
 assert.equal(await p.evaluate(`!!document.querySelector('.policy-layout')`),true);
 await p.evaluate(`document.getElementById('proposalName').value='面板测试储粮';document.getElementById('proposalName').dispatchEvent(new Event('input'));document.querySelector('[data-clause="reserve"]').click();`);
 assert.equal(await p.evaluate(`document.querySelectorAll('[data-workspace-tab]').length`),2);
 await p.evaluate(`document.getElementById('proposalForm').requestSubmit()`);
 assert.equal(await p.evaluate(`!!document.getElementById('workspacePause')`),true);
 await p.evaluate(`document.querySelector('[data-workspace-tab="effects"]').click()`);
 assert.ok(await p.evaluate(`document.querySelector('.workspace-effects').textContent.includes('面板测试储粮')`));
 await p.screenshot('artifacts/live-policy-workspace.png');
 await p.evaluate(`document.getElementById('workspacePause').click()`);
 assert.ok(await p.evaluate(`document.getElementById('workspacePause').textContent.includes('恢复')`));
 await p.evaluate(`document.querySelector('[data-workspace-tab="design"]').click();document.getElementById('proposalName').value='面板测试改名';document.getElementById('proposalName').dispatchEvent(new Event('input'));document.getElementById('proposalForm').requestSubmit()`);
 assert.ok(await p.evaluate(`document.querySelector('.policy-sidebar').textContent.includes('面板测试改名')`));
 await p.evaluate(`document.querySelector('[data-close="panel"]').click()`);
 // Click the visible land near the initial home at the centered camera.
 await p.send('Input.dispatchMouseEvent',{type:'mousePressed',x:720+150,y:500+100,button:'left',clickCount:1});
 await p.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:720+150,y:500+100,button:'left',clickCount:1});
 assert.ok(await p.evaluate(`document.getElementById('buildingSearch')`));
 await p.evaluate(`document.getElementById('landDetails').click()`);
 await p.screenshot('artifacts/live-settlement-workspace.png');
 await p.viewport(390,844);await p.evaluate(`document.querySelector('[data-panel="policy"]').click()`);
 assert.equal(await p.evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
 await p.screenshot('artifacts/live-policy-workspace-mobile.png');
 assert.equal(p.errors.length,0,JSON.stringify(p.errors));
 console.log('Live workspace passed: create, rename, real submit, pause, effects, settlement tabs, facilities, mobile; no page errors.');
}finally{p.close();}
