// Directed review against the existing, exclusively local F1-A2 fixtures. No hosted target or data writes.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='output/playwright/f1-a2-refinement/interactions';mkdirSync(out,{recursive:true});
if(!process.env.RUBIK_DEMO_PASSPHRASE)throw Error('Local demo passphrase required');
const browser=await chromium.launch({executablePath:process.env.CHROME}),report=[];
try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},colorScheme:'light',reducedMotion:'reduce'}),page=await ctx.newPage();
 await page.goto('http://localhost:3232/acceso');await page.getByLabel('Correo').fill('demo-agencia@rubik-demo.test');await page.getByLabel('Contraseña').fill(process.env.RUBIK_DEMO_PASSPHRASE);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/panel');
 await page.locator('.project-card').filter({hasText:'Hotel Playa Azul'}).getByRole('link',{name:'Abrir proyecto',exact:true}).click();await page.getByRole('heading',{level:1}).waitFor();
 const position=await page.locator('.hero-actions .btn').evaluate(e=>{const r=e.getBoundingClientRect();return{top:r.top,bottom:r.bottom,viewport:innerHeight}});if(position.bottom>844)throw Error('Primary mobile action below first screen');
 await page.screenshot({path:`${out}/390-first-screen.png`});
 await page.locator('.hero-actions .btn').click();await page.waitForFunction(()=>{const top=document.querySelector('#evidence-title').getBoundingClientRect().top;return top>=60&&top<=250;},null,{timeout:5000});const anchorTop=await page.locator('#evidence-title').evaluate(e=>e.getBoundingClientRect().top);report.push({exploreAnchorTop:anchorTop});
 const requests=[];await page.waitForLoadState('networkidle');const onRequest=req=>requests.push(req.url());page.on('request',onRequest);
 for(const [name,count] of [['Crítica',1],['Alta',2],['Media',3],['Baja',1],['Informativa',1]]){
  const button=page.getByRole('button',{name:new RegExp(`^${name} `)});await button.focus();await page.keyboard.press('Enter');await page.waitForFunction(n=>document.querySelectorAll('.finding-list>li').length===n,count);if(await button.getAttribute('aria-pressed')!=='true')throw Error('Filter state not exposed');
  const labels=await page.locator('.finding-list .severity').allTextContents();if(labels.some(label=>label!==name))throw Error('Wrong filtered severity');report.push({severity:name,count});
  if(name==='Crítica'){await page.screenshot({path:`${out}/390-critical-filter.png`,fullPage:true});await page.locator('.finding-context summary').first().click();if(!await page.getByText('URL afectada · https://hotel-playa.ejemplo.test/ofertas',{exact:true}).isVisible())throw Error('Evidence URL not visible');await page.screenshot({path:`${out}/390-critical-evidence.png`,fullPage:true});}
 }
 page.off('request',onRequest);if(requests.length)throw Error(`Filter caused ${requests.length} requests`);
 await page.getByRole('button',{name:'Todos 8',exact:true}).click();if(await page.locator('.finding-list>li').count()!==6)throw Error('Default sample cap lost');
 const source=page.locator('.source-cell').filter({hasText:'Medición'});await source.locator('summary').focus();await page.keyboard.press('Enter');if(!await source.getByText('Sin propiedad de Google asociada',{exact:true}).isVisible())throw Error('Source context missing');
 const diagnostics=page.locator('.environment-diagnostics');if(await diagnostics.getAttribute('open')!==null)throw Error('Technical notice dominates by default');await diagnostics.locator('summary').focus();await page.keyboard.press('Enter');if(!await diagnostics.getByText(/Core/).isVisible())throw Error('Diagnostics missing');
 const document=page.locator('.finding-list h3 a').first();const url=page.url();await document.click();await page.waitForURL('**/importaciones/**');await page.goBack();if(page.url()!==url)throw Error('Back route changed');
 for(const width of [360,390,768,1280,1600]){await page.setViewportSize({width,height:width<500?844:1000});await page.goto(url);await page.getByRole('heading',{level:1}).waitFor();await page.screenshot({path:`${out}/${width}-first-screen.png`});}
 report.push({primaryAction:position,filterRequests:requests.length,sourceDisclosure:'PASS',diagnosticsDisclosure:'PASS',evidenceAndBack:'PASS'});
 await ctx.close();
}finally{await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('PASS: five severity filters by keyboard, correct counts, 0 requests, source/evidence/diagnostics disclosure, real detail and Back; primary CTA in first mobile viewport.');
