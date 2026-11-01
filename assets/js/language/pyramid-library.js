(function(){
  'use strict';
  $(function(){
    const R=window.ReadingApp;
    R.init();
    const search=document.getElementById('pyramid-search');
    const sections=[...document.querySelectorAll('.pyramid-library section')];
    const count=document.getElementById('pyramid-results');
    function filter(){let total=0;const query=search.value.trim().toLocaleLowerCase();sections.forEach(section=>{let visible=0;section.querySelectorAll('li').forEach(li=>{li.hidden=!li.querySelector('a').textContent.toLocaleLowerCase().includes(query);if(!li.hidden)visible++;});section.hidden=!visible;total+=visible;});count.textContent=total+' pyramids';}
    function ensureContext(){
      if(R.creator.context)return;
      let plan=R.lastPlan();
      if(!plan)plan={version:1,id:R.id(),title:'Learning Lab Lesson',updatedAt:Date.now(),sections:[{id:R.id(),title:'Reading',items:[]}]};
      R.creator.context={version:1,plan,sectionId:plan.sections[0]?.id||'__new__'};
    }
    sections.forEach(section=>section.querySelectorAll('li').forEach(li=>{
      const link=li.querySelector('a[href]');if(!link)return;
      const url=new URL(link.href,location.href);
      if(!url.pathname.endsWith('/pyramid.html'))return;
      const canonical=R.siteURL('language/pyramid.html');canonical.search=url.search;
      link.href=canonical.href;
      link.addEventListener('click',()=>{const next=new URL(canonical.href);if(R.creator.context)next.hash='create='+R.creator.boundedEncode({version:1,plan:R.planSnapshot(R.creator.getPlan()),sectionId:R.creator.context.sectionId});link.href=next.href;});
      const button=document.createElement('button');button.type='button';button.className='btn btn-sm btn-outline-primary pyramid-add';button.textContent='Add to lesson';button.setAttribute('aria-label','Add '+link.textContent+' to lesson');
      button.addEventListener('click',()=>{try{ensureContext();R.creator.register(()=>({url:canonical.href,title:('Sentence Pyramids: '+link.textContent).slice(0,200)}));R.creator.openDialog();}catch(error){R.notice(error.message);}});
      li.appendChild(button);
    }));
    search.addEventListener('input',filter);filter();
  });
})();
