import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const base='http://localhost:3232',out='output/playwright/f1-a2/extended';mkdirSync(out,{recursive:true});
const pass=process.env.RUBIK_DEMO_PASSPHRASE;if(!pass)throw Error('Local demo passphrase required');
const browser=await chromium.launch({executablePath:process.env.CHROME}),report=[],errors=[];
try{
 for(const colorScheme of ['light','dark']){
  const ctx=await browser.newContext({colorScheme,reducedMotion:'reduce'}),page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/acceso`);await page.getByLabel('Correo').fill('demo-agencia@rubik-demo.test');await page.getByLabel('Contraseña').fill(pass);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/panel');
  for(const width of [360,768]){
   await page.setViewportSize({width,height:900});await page.goto(`${base}/panel`);
   const shot=async name=>{
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
    const violations=audit.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}));
    const contrastChecks=audit.passes.find(r=>r.id==='color-contrast')?.nodes.length??0;
    await page.screenshot({path:`${out}/${width}-${colorScheme}-${name}.png`,fullPage:true});
    report.push({width,colorScheme,name,overflow,violations,contrastChecks});
   };
   await shot('agency');await page.locator('.project-card').filter({hasText:'Hotel Playa Azul'}).getByRole('link',{name:'Abrir proyecto',exact:true}).click();await page.getByRole('heading',{level:1}).waitFor();await shot('project-populated');
   await page.locator('.project-nav-disclosure summary').focus();await page.keyboard.press('Enter');if(!await page.locator('.project-nav-disclosure details').evaluate(e=>e.open))throw Error('Disclosure keyboard failed');
   await page.keyboard.press('Tab');const focus=await page.evaluate(()=>{const e=document.activeElement,r=e.getBoundingClientRect(),s=getComputedStyle(e);return{outline:s.outlineStyle,width:s.outlineWidth,color:s.outlineColor,visible:r.left>=0&&r.right<=innerWidth,transition:s.transitionDuration};});
   if(focus.outline==='none'||!focus.visible||focus.transition!=='0s')throw Error(`Focus/reduced motion ${JSON.stringify(focus)}`);
   await page.screenshot({path:`${out}/${width}-${colorScheme}-keyboard.png`,fullPage:true});report.push({width,colorScheme,focus});
   await page.goto(`${base}/panel`);await page.locator('.project-card').filter({hasText:'Taller Rueda Libre'}).getByRole('link',{name:'Abrir proyecto',exact:true}).click();await page.getByRole('heading',{level:1}).waitFor();await shot('project-empty');
  }
  await ctx.close();
 }
}finally{await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify({report,errors},null,2));}
if(errors.length||report.some(r=>r.overflow||r.violations?.length))throw Error('Extended browser audit failed');
console.log(`PASS 360/768 light/dark: ${report.length} checks, no axe WCAG2.2AA violations; keyboard and reduced motion verified.`);
