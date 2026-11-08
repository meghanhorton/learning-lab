/* Learning Lab Games: extend the existing appbar; do not replace Tools or profiles. */
(()=>{'use strict';
const script=document.currentScript;
const root=new URL('../../',script.src);
const gameURL=new URL('language/wordwizard.html',root).href;
const iconURL=new URL('assets/img/tool-icons/word-wizard.svg',root).href;
function install(){
 const bar=document.getElementById('appbar');if(!bar)return;
 const summaries=[...bar.querySelectorAll('summary')];
 const tools=summaries.find(s=>/\bTools\b/i.test(s.textContent));
 if(tools&&!bar.querySelector('[data-games-menu]')){
   const source=tools.closest('details');
   if(source){
    const details=source.cloneNode(true);details.removeAttribute('open');details.dataset.gamesMenu='1';
    const items=[details,...details.querySelectorAll('[id]')];items.forEach(el=>{if(el.id)el.id='games-'+el.id});
    details.querySelectorAll('[aria-controls],[aria-labelledby]').forEach(el=>{['aria-controls','aria-labelledby'].forEach(a=>{if(el.hasAttribute(a))el.setAttribute(a,el.getAttribute(a).split(/\s+/).map(v=>'games-'+v).join(' '))})});
    const summary=details.querySelector('summary');
    const walker=document.createTreeWalker(summary,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode()){if(/Tools/.test(node.textContent))node.textContent=node.textContent.replace('Tools','Games')}
    summary.setAttribute('aria-label','Games');
    const panel=[...details.children].find(el=>el.tagName!=='SUMMARY');
    if(panel){
      const template=panel.querySelector('a');const a=template?template.cloneNode(true):document.createElement('a');
      a.removeAttribute('id');a.href=gameURL;a.innerHTML='';
      const img=document.createElement('img');img.src=iconURL;img.alt='';img.width=36;img.height=36;img.style.objectFit='contain';
      const label=document.createElement('span');label.textContent='Word Wizard';a.append(img,label);
      a.addEventListener('click',()=>{details.open=false});panel.replaceChildren(a);
    }else{const a=document.createElement('a');a.href=gameURL;a.textContent='Word Wizard';details.append(a)}
    source.after(details);
    details.querySelector('summary').addEventListener('click',()=>{if(!details.open)bar.querySelectorAll('details[open]').forEach(d=>{if(d!==details)d.open=false})});
    document.addEventListener('click',e=>{if(!details.contains(e.target))details.open=false});
    details.addEventListener('keydown',e=>{if(e.key==='Escape'){details.open=false;summary.focus()}});
   }
 }
 if(document.body.dataset.page==='wordwizard'){
   const title=bar.querySelector('.appbar-title');
   if(title&&!title.dataset.wizardBrand){title.dataset.wizardBrand='1';title.innerHTML='';const brand=document.createElement('span');brand.className='tool-brand tool-theme';brand.dataset.tool='wordwizard';const img=document.createElement('img');img.src=iconURL;img.alt='';img.width=44;img.height=44;img.style.objectFit='contain';const text=document.createElement('span');text.className='tool-brand-name';text.textContent='Word Wizard';brand.append(img,text);title.append(brand)}
 }
 const height=bar.getBoundingClientRect().height;if(height)document.documentElement.style.setProperty('--nav-height',height+'px');
}
function ready(){install();const bar=document.getElementById('appbar');if(bar){let pending=false;const observer=new MutationObserver(()=>{if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;install()})}});observer.observe(bar,{childList:true,subtree:true});if(window.ResizeObserver)new ResizeObserver(()=>{const h=bar.getBoundingClientRect().height;document.documentElement.style.setProperty('--nav-height',h+'px')}).observe(bar)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();
/* WORD WIZARD BRAND REPAIR v2 */
(()=>{'use strict';
if(document.body.dataset.page!=='wordwizard'&&!/\/wordwizard\.html$/.test(location.pathname))return;
document.body.dataset.page='wordwizard';
const loaded=[...document.scripts].find(s=>s.src&&s.src.includes('/assets/js/games.js'));
const root=loaded?new URL('../../',loaded.src):new URL('../',location.href);
const icon=new URL('assets/img/tool-icons/word-wizard.svg?v=puppywizard2',root).href;
let scheduled=false;
function repair(){
 const bar=document.getElementById('appbar');if(!bar)return;
 let title=bar.querySelector('.appbar-title');
 if(!title){title=document.createElement('span');title.className='appbar-title';const links=bar.querySelector('[data-nav-slot="links"]');if(links)links.after(title);else bar.prepend(title)}
 if(title.querySelector('.ww-navbar-brand'))return;
 const brand=document.createElement('span');brand.className='tool-brand ww-navbar-brand';
 const img=document.createElement('img');img.src=icon;img.alt='';img.width=46;img.height=46;
 const label=document.createElement('span');label.className='tool-brand-name';label.textContent='Word Wizard';
 brand.append(img,label);title.replaceChildren(brand);
}
function init(){repair();const bar=document.getElementById('appbar');if(bar)new MutationObserver(()=>{if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;repair()})}}).observe(bar,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();