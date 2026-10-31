// Visual review of the real, authenticated app; fictitious data belongs only to the dedicated local stack.
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const phase=process.argv[2]??'after',base=process.env.RUBIK_DEMO_URL??`http://localhost:${phase==='before'?'3233':'3232'}`;
if(!/^http:\/\/localhost:323[23]$/.test(base))throw Error('Local F1-A2 demo only');
const pass=process.env.RUBIK_DEMO_PASSPHRASE;if(!pass)throw Error('Local demo passphrase required');
const out=`output/playwright/f1-a2/${phase}`;mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME}),report=[],errors=[];
try{
for(const width of [1280,1600,390]){
 const ctx=await browser.newContext({viewport:{width,height:width===390?844:1000},colorScheme:'light'}),page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/acceso`);await page.getByLabel('Correo').fill('demo-agencia@rubik-demo.test');await page.getByLabel('Contraseña').fill(pass);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/panel');
 const shot=async(name)=>{await page.screenshot({path:`${out}/${width}-${name}.png`,fullPage:true});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error(`Overflow ${width} ${name}`);const h1=await page.locator('h1').count();if(h1!==1)throw Error('Expected one h1');let violations=[];if(phase==='after')violations=(await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));report.push({width,name,overflow,violations});};
 await shot('agency');await page.locator('.project-card').filter({hasText:'Hotel Playa Azul'}).getByRole('link',{name:'Abrir proyecto'}).click();await page.getByRole('heading',{level:1,name:'Hotel Playa Azul (demo)'}).waitFor();const project=page.url();await shot('project-populated');
 if(phase==='after'){const first=page.locator('.finding-list h3 a').first();await first.click();await page.waitForURL('**/importaciones/**');await page.goBack();await page.getByRole('heading',{level:1}).waitFor();if(page.url()!==project)throw Error('Back failed');}
 await page.goto(`${base}/panel`);await page.locator('.project-card').filter({hasText:'Taller Rueda Libre'}).getByRole('link',{name:'Abrir proyecto'}).click();await page.getByRole('heading',{level:1,name:'Taller Rueda Libre (demo)'}).waitFor();await shot('project-empty');
 if(phase==='after'&&width===390){await page.locator('.mobile-nav summary').focus();await page.keyboard.press('Enter');if(!await page.locator('.mobile-nav').getAttribute('open')&&await page.locator('.mobile-nav').getAttribute('open')===null)throw Error('Mobile menu failed');}
 await ctx.close();
}
if(phase==='after'){
 for(const[email,count]of [['demo-analista@rubik-demo.test',2],['demo-cliente@rubik-demo.test',1]]){const ctx=await browser.newContext(),page=await ctx.newPage();await page.goto(`${base}/acceso`);await page.getByLabel('Correo').fill(email);await page.getByLabel('Contraseña').fill(pass);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/panel');if(await page.locator('.project-card').count()!==count)throw Error('Authorized portfolio count changed');report.push({role:email.split('@')[0],projects:count});await ctx.close();}
}
}finally{await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify({report,errors},null,2));}
if(errors.length||report.some(r=>r.violations?.length))throw Error('Browser errors or serious/critical accessibility violations; see local report');
console.log(`PASS ${phase}: ${report.length} checks; 0 overflow; 0 page errors; screenshots ${out}`);
