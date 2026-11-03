/* Lesson editor, checklist and timing summaries. Uses shared app services directly. */
$(function(){
  'use strict';
  const R=window.ReadingApp;R.init();let plan,editing=false;
  function blankPlan(){return R.normalizePlan({version:1,id:R.id(),title:'New Lesson',updatedAt:0,sections:[]});}
  function message(text){R.$('#lesson-message').textContent=text;}
  function persist(){const stored=R.savePlan(plan);try{history.replaceState(null,'',creating?R.creator.lessonURL(plan):shareableLessonURL());}catch(error){try{const base=R.siteURL('lesson.html');if(creating)base.searchParams.set('create','1');history.replaceState(null,'',base.href);}catch(ignored){}message(stored?'Lesson saved in this browser, but its link is too large. Export a JSON backup or shorten the notes.':'Browser storage is unavailable. Export a JSON backup before leaving.');}if(!stored)message('Browser storage is unavailable. Export a JSON backup before leaving.');}
  function changed(){R.touchPlan(plan);persist();refreshTimes();}
  const edit=R.action('lesson-edit','edit','Edit lesson',()=>{editing=!editing;render();});
  R.action('lesson-copy','copy','Copy lesson link',()=>shareCurrentLesson(false));R.action('lesson-share','share','Share lesson',()=>shareCurrentLesson(true));
  R.action('lesson-new','new','New blank lesson',()=>{if(!confirm('Start a new blank plan? Keep a link or backup of your current lesson.'))return;plan=blankPlan();editing=true;changed();render();});
  R.action('lesson-export','save','Save lesson backup',()=>{plan=R.freshPlan(plan);const url=URL.createObjectURL(new Blob([JSON.stringify(R.planSnapshot(plan),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=(plan.title.replace(/[^a-z0-9_-]+/gi,'-')||'lesson')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  R.action('lesson-import','up','Import lesson backup',()=>R.$('#lesson-import-file').click());
  /* WEEKLY PDF REPORT ACTION */
  R.action('lesson-weekly-pdf','save','Weekly PDF',()=>R.weeklyReport.open(()=>R.freshPlan(plan)));
  function moveButton(className,label,text,disabled){return $('<button type="button" class="btn btn-sm btn-outline-secondary">').addClass(className).text(text).attr('aria-label',label).prop('disabled',disabled);}
  /* LESSON BUILDER: launch tools with an explicit target plan and section. */
  let creating=new URLSearchParams(location.search).get('create')==='1',builderSectionId='';
  function shareableLessonURL(){const url=R.lessonURL(plan);if(new URL(url,location.href).hash.slice(1).replace(/^plan=/,'').length>300000)throw Error('This lesson is too large for a share link. Export a JSON backup or shorten the notes.');return url;}
  function shareCurrentLesson(native=false){persist();try{R.copyLink(shareableLessonURL(),native,plan.title);}catch(error){message(error.message);}}
  /* OFFLINE LESSON ACTIVITY CONTROLS */
  function addOfflineActivity(kind,sectionId){
    if(!['worksheet','book'].includes(kind))return;
    const section=plan.sections.find(section=>section.id===sectionId);
    if(!section){message('Choose or create a lesson section first.');return;}
    if(R.planItems(plan).length>=200){message('Maximum 200 activities.');return;}
    const item={id:R.id(),title:kind==='worksheet'?'New worksheet':'New book reading',kind,url:null,reference:'',notes:'',done:false,timer:R.timer()};section.items.push(item);editing=true;changed();render();
    const field=document.querySelector('[data-item="'+CSS.escape(item.id)+'"] .item-title');if(field){field.focus();field.select();field.scrollIntoView({block:'center'});}
  }
  function renderBuilder(){
    let panel=document.getElementById('lesson-builder');if(!panel){panel=document.createElement('section');panel.id='lesson-builder';panel.className='lesson-builder';panel.setAttribute('aria-labelledby','lesson-builder-title');R.$('#lesson-sections').before(panel);}
    panel.replaceChildren();
    const heading=document.createElement('div');heading.className='builder-heading';
    const title=document.createElement('h2');title.id='lesson-builder-title';title.textContent='Build your lesson with the tools';heading.appendChild(title);
    const toggle=document.createElement('button');toggle.type='button';toggle.className='btn '+(creating?'btn-primary':'btn-outline-primary');toggle.textContent=creating?'Exit create mode':'Enable create mode';toggle.setAttribute('aria-pressed',String(creating));toggle.addEventListener('click',()=>{creating=!creating;persist();renderBuilder();panel.querySelector('.builder-heading button').focus();});heading.appendChild(toggle);panel.appendChild(heading);
    const description=document.createElement('p');description.textContent=creating?'Choose a section, open a tool, then use Add to lesson to save what you create.':'Enable Create mode to turn reading, spelling and math content into lesson activities.';panel.appendChild(description);
    if(!creating)return;
    if(!plan.sections.some(section=>section.id===builderSectionId))builderSectionId=plan.sections[0]?.id||'';
    const controls=document.createElement('div');controls.className='builder-controls';
    const label=document.createElement('label');label.htmlFor='builder-section';label.textContent='Add activities to';controls.appendChild(label);
    const select=document.createElement('select');select.id='builder-section';select.className='form-select';
    if(!plan.sections.length){const option=document.createElement('option');option.value='';option.textContent='Create a section first';select.appendChild(option);}else plan.sections.forEach(section=>{const option=document.createElement('option');option.value=section.id;option.textContent=section.title;select.appendChild(option);});
    select.value=builderSectionId;controls.appendChild(select);
    const addSection=document.createElement('button');addSection.type='button';addSection.className='btn btn-outline-primary';addSection.textContent='+ New section';addSection.addEventListener('click',()=>{if(plan.sections.length>=50){R.notice('Maximum 50 lesson sections.');return;}const input=prompt('Name your new lesson section:','');if(input===null)return;const name=input.trim();if(!name){R.notice('Enter a section name.');return;}if(name.length>200){R.notice('Section names must be 200 characters or fewer.');return;}const section={id:R.id(),title:name,items:[]};plan.sections.push(section);builderSectionId=section.id;changed();render();});controls.appendChild(addSection);panel.appendChild(controls);
    const offlineActions=document.createElement('div');offlineActions.className='offline-builder-actions';
    for(const [kind,name] of [['worksheet','Add worksheet'],['book','Add book reading']]){const button=document.createElement('button');button.type='button';button.className='btn btn-outline-primary';button.textContent=name;button.disabled=!builderSectionId;button.addEventListener('click',()=>addOfflineActivity(kind,builderSectionId));offlineActions.appendChild(button);}panel.appendChild(offlineActions);

    const grid=document.createElement('div');grid.className='builder-tool-grid';
    for(const [page,name] of Object.entries(R.creator.names)){
      const link=document.createElement('a');link.className='builder-tool-btn tool-theme';link.dataset.tool=page;
      const icon=document.createElement('span');icon.className='builder-tool-icon';icon.innerHTML=R.lessonMascotMarkup(page);link.appendChild(icon);
      const text=document.createElement('span');text.textContent=name;link.appendChild(text);
      if(builderSectionId){try{link.href=R.creator.toolURL(page,plan,builderSectionId);}catch(error){link.setAttribute('aria-disabled','true');}}else link.setAttribute('aria-disabled','true');
      link.addEventListener('click',event=>{if(!builderSectionId){event.preventDefault();R.notice('Create a lesson section first.');return;}try{persist();link.href=R.creator.toolURL(page,plan,builderSectionId);}catch(error){event.preventDefault();R.notice(error.message);}});grid.appendChild(link);
    }
    select.addEventListener('change',()=>{builderSectionId=select.value;renderBuilder();R.$('#builder-section').focus();});panel.appendChild(grid);
  }
  function render(){
    const root=$('#lesson-sections').empty();$('#lesson-panel').toggleClass('is-editing',editing);$('#lesson-editor-nav').toggleClass('is-editing',editing);$('#lesson-title').text(plan.title);$('#lesson-title-input').val(plan.title);edit.innerHTML=R.icon(editing?'done':'edit')+'<span class="lesson-editor-label">'+(editing?'Done':'Edit')+'</span>';edit.title=editing?'Finish editing lesson':'Edit lesson';edit.setAttribute('aria-label',edit.title);
    plan.sections.forEach((section,index)=>{
      const card=$('<section class="lesson-section">').attr('data-section',section.id).appendTo(root),heading=$('<div class="section-heading">').appendTo(card);
      $('<h2 class="view-only">').text(section.title).appendTo(heading);$('<input class="form-control edit-only section-title">').val(section.title).attr({'aria-label':'Section title',maxlength:200}).appendTo(heading);
      const actions=$('<div class="edit-only editor-actions">').appendTo(heading);actions.append(moveButton('section-up','Move section up','↑',index===0),moveButton('section-down','Move section down','↓',index===plan.sections.length-1),$('<button type="button" class="btn btn-sm btn-outline-danger section-delete">').text('Remove section'));
      const list=$('<ul class="lesson-items">').appendTo(card);
      section.items.forEach((item,i)=>{
        const row=$('<li class="lesson-item">').attr('data-item',item.id).toggleClass('is-complete',item.done).appendTo(list);
        $('<input type="checkbox" class="form-check-input lesson-check">').prop('checked',item.done).attr('aria-label',`Mark ${item.title} completed`).appendTo(row);
        const content=$('<div class="lesson-item-content">').appendTo(row);
        if(R.isOfflineItem(item)){
          const summary=$('<div class="offline-activity-summary view-only">').appendTo(content);
          $('<span class="lesson-row-mascot" aria-hidden="true">').html(R.offlineItemIcon(item.kind)).appendTo(summary);$('<span class="offline-activity-title">').text(item.title).appendTo(summary);
          $('<span class="offline-kind-label view-only">').text(item.kind==='worksheet'?'Worksheet':'Book reading').appendTo(content);
          if(item.reference)$('<p class="offline-reference view-only">').text(item.reference).appendTo(content);
          if(item.notes)$('<p class="offline-notes view-only">').text(item.notes).appendTo(content);
        }else{
          const activity=$('<a class="lesson-activity view-only">').attr('href',item.url).text(item.title).appendTo(content);const mascot=R.lessonItemMascot(item);if(mascot)activity.prepend($('<span class="lesson-row-mascot" aria-hidden="true">').html(mascot));
        }
        $('<input class="form-control edit-only item-title">').val(item.title).attr({'aria-label':'Activity title',maxlength:200}).appendTo(content);
        const type=$('<select class="form-select edit-only item-kind" aria-label="Activity type">').appendTo(content);for(const [value,name] of [['link','Web activity'],['worksheet','Worksheet'],['book','Book reading']])$('<option>').val(value).text(name).appendTo(type);type.val(item.kind||'link');
        if(R.isOfflineItem(item)){
          $('<input class="form-control edit-only item-reference">').val(item.reference||'').attr({'aria-label':'Pages, chapter or worksheet reference',placeholder:'Pages, chapter, workbook or worksheet reference',maxlength:300}).appendTo(content);
          $('<textarea class="form-control edit-only item-notes" rows="2">').val(item.notes||'').attr({'aria-label':'Activity notes',placeholder:'Instructions or notes (optional)',maxlength:2000}).appendTo(content);
        }else $('<input class="form-control edit-only item-url">').val(item.url).attr('aria-label','Activity URL').appendTo(content);
        const controls=$('<div class="edit-only editor-actions">').appendTo(content);controls.append(moveButton('item-up','Move activity up','↑',i===0),moveButton('item-down','Move activity down','↓',i===section.items.length-1),$('<button type="button" class="btn btn-sm btn-outline-danger item-delete">').text('Remove'));
        $('<output class="item-time">').attr('aria-label',`Recorded time for ${item.title}`).appendTo(row);
      });$('<button type="button" class="btn btn-outline-primary edit-only item-add">').text('+ Add web activity').appendTo(card);const offline=$('<div class="edit-only editor-actions section-offline-add">').appendTo(card);$('<button type="button" class="btn btn-outline-primary item-add-worksheet">').text('+ Add worksheet').appendTo(offline);$('<button type="button" class="btn btn-outline-primary item-add-book">').text('+ Add book reading').appendTo(offline);
    });refreshTimes();renderBuilder();
  }
  function locate(el){const section=plan.sections.find(s=>s.id===$(el).closest('[data-section]').attr('data-section'));return{section,item:section?.items.find(i=>i.id===$(el).closest('[data-item]').attr('data-item'))};}
  $('#lesson-title-input').on('input',function(){plan.title=this.value||'Reading Lesson';$('#lesson-title').text(plan.title);changed();});
  $('#lesson-sections').on('change','.lesson-check',function(){const {item}=locate(this);item.done=this.checked;if(item.done){const latest=R.planItems(R.readPlan(plan.id)).find(i=>i.id===item.id);item.timer=R.timerAction(latest?.timer||item.timer,'pause');}$(this).closest('.lesson-item').toggleClass('is-complete',item.done);changed();})
    .on('input','.section-title',function(){locate(this).section.title=this.value;changed();})
    .on('input','.item-title',function(){locate(this).item.title=this.value;changed();})
    .on('change','.item-kind',function(){const {item}=locate(this),old=item.kind||'link',kind=this.value;if(!['link','worksheet','book'].includes(kind)){this.value=old;return;}let url=null;
      if(kind==='link'){const value=prompt('Web address for this activity:',item.url||'');if(value===null){this.value=old;return;}try{if(!value.trim())throw Error('Enter a web address, or keep this as an offline activity.');url=R.localURL(value.trim());}catch(error){this.value=old;message(error.message);return;}}
      item.kind=kind;item.url=url;if(R.isOfflineItem(item))item.timer=R.timerAction(item.timer,'pause');message('');changed();render();})
    .on('input','.item-reference',function(){locate(this).item.reference=this.value;changed();})
    .on('input','.item-notes',function(){locate(this).item.notes=this.value;changed();})
    .on('click','.item-add-worksheet',function(){addOfflineActivity('worksheet',locate(this).section.id);})
    .on('click','.item-add-book',function(){addOfflineActivity('book',locate(this).section.id);})
    .on('change','.item-url',function(){try{locate(this).item.url=R.localURL(this.value);this.value=locate(this).item.url;$(this).removeClass('is-invalid');message('');changed();}catch(error){$(this).addClass('is-invalid');message(error.message);}})
    .on('click','.lesson-activity',function(event){persist();const {item}=locate(this);this.href=R.activityURL(item,plan);})
    .on('click','.item-add',function(){if(R.planItems(plan).length>=200){message('Maximum 200 activities.');return;}locate(this).section.items.push({id:R.id(),title:'New web activity',kind:'link',url:'slider.html',done:false,timer:R.timer()});changed();render();})
    .on('click','.item-delete',function(){const {section,item}=locate(this);section.items=section.items.filter(i=>i!==item);changed();render();})
    .on('click','.section-delete',function(){const {section}=locate(this);if(!confirm('Remove this section and its activities?'))return;plan.sections=plan.sections.filter(s=>s!==section);changed();render();})
    .on('click','.item-up,.item-down',function(){const {section,item}=locate(this),i=section.items.indexOf(item),j=i+($(this).hasClass('item-up')?-1:1);if(j<0||j>=section.items.length)return;[section.items[i],section.items[j]]=[section.items[j],section.items[i]];changed();render();})
    .on('click','.section-up,.section-down',function(){const {section}=locate(this),i=plan.sections.indexOf(section),j=i+($(this).hasClass('section-up')?-1:1);if(j<0||j>=plan.sections.length)return;[plan.sections[i],plan.sections[j]]=[plan.sections[j],plan.sections[i]];changed();render();});
  $('#lesson-add-section').on('click',()=>{if(plan.sections.length>=50){message('Maximum 50 sections.');return;}plan.sections.push({id:R.id(),title:'New section',items:[]});changed();render();});
  $('#lesson-clear').on('click',()=>{if(!confirm('Clear completion checkboxes? Recorded times will be kept.'))return;plan.sections.forEach(s=>s.items.forEach(i=>i.done=false));changed();render();});
  $('#lesson-import-file').on('change',async function(){if(!this.files[0])return;try{plan=R.normalizePlan(JSON.parse(await this.files[0].text()));editing=false;changed();render();message('Lesson imported.');}catch(error){message('Import failed: '+error.message);}this.value='';});
  function refreshTimes(){if(!plan)return;const fresh=R.freshPlan(plan),map=new Map(R.planItems(fresh).map(i=>[i.id,i]));R.planItems(plan).forEach(item=>{const other=map.get(item.id);if(other&&R.timer(other.timer).updatedAt>R.timer(item.timer).updatedAt)item.timer=other.timer;});const now=Date.now();let total=0;R.planItems(plan).forEach(item=>{const elapsed=R.elapsed(item.timer,now);total+=elapsed;const row=document.querySelector(`[data-item="${CSS.escape(item.id)}"] .item-time`);if(row){const text=R.formatTime(elapsed);if(row.textContent!==text)row.textContent=text;}});$('#lesson-total').text(R.formatTime(total));$('#lesson-progress').text(`${R.planItems(plan).filter(i=>i.done).length} of ${R.planItems(plan).length} activities complete`);}
  /* DEFAULT EXAMPLE LESSON LOAD */
  async function loadInitialLesson(){
    const panel=R.$('#lesson-panel'),footer=R.$('#lesson-editor-nav');if(panel)panel.inert=true;if(footer)footer.inert=true;
    const controls=Array.from(document.querySelectorAll('#lesson-panel button,#lesson-panel input,#lesson-panel select,#lesson-panel textarea,#lesson-editor-nav button')).map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);
    let warning='';const value=new URLSearchParams(location.hash.slice(1)).get('plan');
    try{
      if(value){plan=R.freshPlan(R.normalizePlan(R.decode(value)));}
      else{
        message('Loading the default Week 2 lesson…');const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),15000);
        try{const response=await fetch(R.siteURL('examples/Week-2-November-2-2026.json'),{cache:'no-cache',signal:abort.signal});if(!response.ok)throw Error('HTTP '+response.status);const sample=R.normalizePlan(await response.json());plan=R.freshPlan(sample);}
        catch(error){plan=R.lastPlan()||blankPlan();warning='Could not load examples/Week-2-November-2-2026.json. Your saved lesson (or a blank one) is shown instead. Open the deployed site or serve it with python3 -m http.server, then reload. '+error.message;}
        finally{clearTimeout(timeout);}
      }
      editing=plan.sections.length===0;message('');render();persist();
      if(warning)message(warning);else if(!value&&!R.$('#lesson-message').textContent)message(R.readPlan(plan.id)?'Default lesson: Week 2: November 2, 2026. Existing saved progress for this lesson is retained.':'Default lesson loaded, but browser storage is unavailable. Export a JSON backup before leaving.');
    }catch(error){plan=R.lastPlan()||blankPlan();editing=plan.sections.length===0;render();message('That lesson link could not be loaded. Your saved data has not been deleted. '+error.message);}
    finally{if(panel)panel.inert=false;if(footer)footer.inert=false;controls.forEach(([el,disabled])=>{if(el.isConnected)el.disabled=disabled;});}
  }
  loadInitialLesson();
  setInterval(refreshTimes,250);globalThis.addEventListener('storage',refreshTimes);
});
