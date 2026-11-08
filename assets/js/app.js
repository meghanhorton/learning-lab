/* Shared services: navigation, sharing, lesson storage, timers and celebrations. */
(function (global) {
  'use strict';
  const R = global.ReadingApp = {};
  R.$ = selector => document.querySelector(selector);
  R.chars = text => typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text.normalize('NFC')), s=>s.segment)
    : Array.from(text.normalize('NFC'));
  R.entries = text => text.split(/[,\n]+/u).map(s=>s.trim().normalize('NFC').toLocaleLowerCase()).filter(Boolean);
  R.words = text => text.normalize('NFC').split(/[\s,;]+/u).map(s=>s.trim()).filter(Boolean);
  R.id = () => global.crypto?.randomUUID?.() || Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  R.timer = raw => ({elapsedMs:Math.max(0,Number(raw?.elapsedMs)||0),runningSince:Number.isFinite(raw?.runningSince)&&raw.runningSince>0?raw.runningSince:null,updatedAt:Math.max(0,Number(raw?.updatedAt)||0)});
  R.elapsed = (raw,now=Date.now()) => {const t=R.timer(raw);return t.elapsedMs+(t.runningSince?Math.max(0,now-t.runningSince):0);};
  R.timerAction = (raw,action,now=Date.now()) => {const t=R.timer(raw);if(action==='start'&&!t.runningSince)t.runningSince=now;if(action==='pause'){t.elapsedMs=R.elapsed(t,now);t.runningSince=null;}if(action==='reset'){t.elapsedMs=0;t.runningSince=null;}t.updatedAt=Math.max(now,t.updatedAt+1);return t;};
  R.formatTime = ms => {const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s/60)%60;return(h?h+':':'')+String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
  R.encode = value => {let binary='';for(const b of new TextEncoder().encode(JSON.stringify(value)))binary+=String.fromCharCode(b);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
  R.decode = value => {if(!value||value.length>300000)throw Error('Invalid or oversized lesson link.');let text=value.replace(/-/g,'+').replace(/_/g,'/');text+='='.repeat((4-text.length%4)%4);return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(text),c=>c.charCodeAt(0))));};
  const toolNames=new Set(['slider.html','pyramid.html','wordparts.html','lettertiles.html']);
  R.safeURL = value => R.resolveURL(value);
  R.localURL = value => {const u=R.safeURL(value),file=u.pathname.split('/').pop(),subject=R.mathFiles?.has(file)?'math':R.languageFiles.has(file)?'language':null;return subject&&u.origin===R.siteRoot.origin&&u.pathname===R.siteURL(subject+'/'+file).pathname?subject+'/'+file+u.search+(new URLSearchParams(u.hash.slice(1)).has('lesson')?'':u.hash):u.href;};
  R.planItems = plan => plan?.sections?.flatMap(s=>s.items)||[];
  R.normalizePlan = raw => {
    if(!raw||![1,2].includes(raw.version)||typeof raw.id!=='string'||!raw.id||raw.id.length>100||!Array.isArray(raw.sections)||raw.sections.length>50)throw Error('Invalid lesson plan.');
    const ids=new Set();let count=0;
    return {version:R.lessonSchemaVersion(raw),id:raw.id,title:String(raw.title||'Reading Lesson').slice(0,200),updatedAt:Math.max(0,Number(raw.updatedAt)||0),sections:raw.sections.map(section=>{
      if(!section||typeof section.id!=='string'||ids.has(section.id)||!Array.isArray(section.items))throw Error('Invalid section.');ids.add(section.id);
      return{id:section.id,title:String(section.title||'Section').slice(0,200),items:section.items.map(item=>{
        if(!item||typeof item.id!=='string'||ids.has(item.id)||++count>200)throw Error('Invalid activity.');ids.add(item.id);
        return R.normalizeLessonItem(item);
      })};
    })};
  };
  R.readPlan = id => {try{const data=localStorage.getItem(R.profileStorageKey('lesson:')+id);return data?R.normalizePlan(JSON.parse(data)):null;}catch(error){return null;}};
  R.lastPlan = () => {try{const id=localStorage.getItem(R.profileStorageKey('last-lesson'));return id?R.readPlan(id):null;}catch(error){return null;}};
  function mergeTimers(plan,other){const map=new Map(R.planItems(other).map(i=>[i.id,i]));R.planItems(plan).forEach(item=>{const local=R.timer(map.get(item.id)?.timer);if(local.updatedAt>R.timer(item.timer).updatedAt)item.timer=local;});return plan;}
  R.freshPlan = plan => {const local=R.readPlan(plan.id);return local?mergeTimers(local.updatedAt>=plan.updatedAt?local:plan,local.updatedAt>=plan.updatedAt?plan:local):plan;};
  R.touchPlan = plan => {plan.version=R.lessonSchemaVersion(plan);plan.updatedAt=Math.max(Date.now(),plan.updatedAt+1);return plan;};
  R.savePlan = plan => {plan.version=R.lessonSchemaVersion(plan);mergeTimers(plan,R.readPlan(plan.id));R.planItems(plan).forEach(i=>{if(R.isOfflineItem(i))i.url=null;else i.url=R.localURL(i.url);});try{localStorage.setItem(R.profileStorageKey('lesson:')+plan.id,JSON.stringify(plan));localStorage.setItem(R.profileStorageKey('last-lesson'),plan.id);return true;}catch(error){return false;}};
  R.planSnapshot = plan => {const copy=JSON.parse(JSON.stringify(mergeTimers(plan,R.readPlan(plan.id))));copy.version=R.lessonSchemaVersion(copy);R.planItems(copy).forEach(item=>{const t=R.timer(item.timer);item.timer={...t,elapsedMs:R.elapsed(t),runningSince:null};});return copy;};
  R.lessonURL = (plan,base='lesson.html') => {const u=R.safeURL(base);u.search='';u.hash='plan='+R.encode(R.planSnapshot(plan));return u.href;};
  R.activityURL = (item,plan) => {if(R.isOfflineItem(item))throw Error("Offline activities do not have a web address.");const u=R.safeURL(item.url);if(u.origin===location.origin&&toolNames.has(u.pathname.split('/').pop()))u.hash='lesson='+R.encode({version:1,plan,itemId:item.id,returnBase:R.siteURL('lesson.html').href});return u.href;};
  R.parseCSV = text => {
    const rows=[];let row=[],cell='',quoted=false,closed=false;text=text.replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}else if(c==='"'&&!cell.trim()&&!closed){cell='';quoted=true;}else if(c===','){row.push(cell);cell='';closed=false;}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';closed=false;}else if(closed&&!/\s/.test(c))throw Error('Unexpected text after a CSV quote.');else if(!closed)cell+=c;}
    if(quoted)throw Error('CSV has an unclosed quote.');row.push(cell);rows.push(row);const first=rows.findIndex(r=>r.some(c=>c.trim()));if(first>=0&&rows[first].length===1&&/^(text|sentence|example)$/i.test(rows[first][0].trim()))rows.splice(first,1);return rows.flat().map(c=>c.trim()).filter(Boolean);
  };
  const icons={home:'M3 10l9-7 9 7M5 9v12h5v-7h4v7h5V9',lesson:'M8 5h13M8 12h13M8 19h13M2 5h1M2 12h1M2 19h1',edit:'M4 16l12-12 4 4-12 12H4v-4M14 6l4 4',copy:'M8 8h13v13H8zM16 8V3H3v13h5',share:'M12 16V3M7 8l5-5 5 5M4 12v9h16v-9',done:'M4 12l5 5L20 6',play:'M7 4l14 8-14 8z',pause:'M8 4v16M16 4v16',reset:'M4 8a9 9 0 1 1-1 8M4 3v6h6',left:'M15 5l-7 7 7 7',right:'M9 5l7 7-7 7',up:'M5 15l7-7 7 7',down:'M5 9l7 7 7-7',new:'M12 4v16M4 12h16',save:'M5 3h14l2 2v16H3V3h2M7 3v6h10V3M7 21v-8h10v8'};
  R.icon = name => '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="'+(icons[name]||icons.lesson)+'" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  R.action = (id,icon,label,handler,slot='actions') => {if(document.body.dataset.page==='lesson'&&slot==='actions'&&id.startsWith('lesson-'))slot='lesson-editor';const el=document.createElement('button');el.id=id;el.type='button';el.className='icon-button';el.title=label;el.setAttribute('aria-label',label);el.innerHTML=R.icon(icon);if(R.isToolToolbarPage()&&id!=='creator-add-to-lesson'){const caption=document.createElement('span');caption.className='tool-toolbar-label';caption.textContent=R.toolToolbarLabels[id]||label;el.appendChild(caption);}if(slot==='lesson-editor'){const caption=document.createElement('span');caption.className='lesson-editor-label';caption.textContent=R.lessonEditorLabels[id]||label;el.appendChild(caption);}el.addEventListener('click',handler);document.querySelector(`[data-nav-slot="${slot}"]`).appendChild(el);R.scheduleToolToolbar();return el;};
  R.setAction = (el,{visible=true,disabled=false}={}) => {const footerVisibilityChanged=el.hidden!==!visible;el.hidden=!visible;el.disabled=disabled;if(footerVisibilityChanged)R.scheduleToolToolbar();};
  let noticeTimer;R.notice = text => {const el=R.$('#app-notice');if(!el)return;clearTimeout(noticeTimer);el.textContent=text;if(text)noticeTimer=setTimeout(()=>{el.textContent='';},5000);};
  R.copyLink = async (url,share=false,title=document.title) => {
    try{if(share&&navigator.share){await navigator.share({title,url});return;}if(location.protocol==='file:'||!navigator.clipboard)throw Error('manual');await navigator.clipboard.writeText(url);R.notice('Link copied.');}
    catch(error){if(error.name==='AbortError')return;let d=R.$('#share-dialog');if(!d){d=document.createElement('dialog');d.id='share-dialog';d.innerHTML='<h2>Copy link</h2><label for="share-url">Select and copy this link</label><textarea id="share-url" class="form-control mt-3" rows="6" readonly></textarea><button type="button" class="btn btn-primary mt-3">Close</button>';d.querySelector('button').addEventListener('click',()=>d.close());document.body.appendChild(d);}d.querySelector('textarea').value=url;d.showModal();d.querySelector('textarea').focus();d.querySelector('textarea').select();}
  };
  let context=null,audio=null,canvas=null,animation=null;
  R.stopCelebration = () => {cancelAnimationFrame(animation);if(canvas)canvas.remove();canvas=null;};
  function unlockAudio(){try{const A=global.AudioContext||global.webkitAudioContext;if(!A)return;if(!audio)audio=new A();if(audio.state==='suspended')audio.resume().catch(()=>{});}catch(error){}}
  R.celebrate = () => {
    if(audio?.state==='running'){const now=audio.currentTime;[[1046.5,.15,.85],[2093,.04,.6]].forEach(([f,v,d])=>{const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=f;g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(v,now+.012);g.gain.exponentialRampToValueAtTime(.0001,now+d);o.connect(g);g.connect(audio.destination);o.start(now);o.stop(now+d+.03);o.onended=()=>{o.disconnect();g.disconnect();};});}
    R.stopCelebration();canvas=document.createElement('canvas');canvas.className='confetti';canvas.setAttribute('aria-hidden','true');document.body.appendChild(canvas);const ctx=canvas.getContext('2d');if(!ctx){R.stopCelebration();return;}
    const w=innerWidth,h=innerHeight,dpr=Math.min(devicePixelRatio||1,2),reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);const colors=['#2375dc','#ffca48','#ec6394','#52b788','#9c7bea'];const parts=Array.from({length:reduce?40:140},()=>({x:Math.random()*w,y:reduce?Math.random()*h:-Math.random()*h*.5,vx:(Math.random()-.5)*100,vy:140+Math.random()*220,s:5+Math.random()*7,a:Math.random()*6.28,color:colors[Math.floor(Math.random()*5)]}));const start=performance.now();let last=start;
    function frame(now){const duration=reduce?1000:3000;if(now-start>duration){R.stopCelebration();return;}const dt=Math.min((now-last)/1000,.04);last=now;ctx.clearRect(0,0,w,h);ctx.globalAlpha=Math.min(1,(duration-(now-start))/600);parts.forEach(p=>{if(!reduce){p.x+=p.vx*dt;p.y+=p.vy*dt;p.a+=2*dt;}ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a);ctx.fillStyle=p.color;ctx.fillRect(-p.s/2,-p.s/3,p.s,p.s*.65);ctx.restore();});animation=requestAnimationFrame(frame);}animation=requestAnimationFrame(frame);
  };
  function currentContext(){if(!context)return null;const plan=R.freshPlan(context.plan),item=R.planItems(plan).find(i=>i.id===context.itemId);return item?{plan,item}:null;}
  function timerChange(action){const data=currentContext();if(!data)return;data.item.timer=R.timerAction(data.item.timer,action);R.touchPlan(data.plan);R.savePlan(data.plan);context.plan=data.plan;}
    // TOOL IDENTITIES: shared by homepage cards, hero preview and page navigation.
  R.toolMetadata = {"home": {"name": "Reading Tools", "icon": "<path d=\"M12 16h20c5 0 8 3 8 6v42c0-4-4-7-9-7H12V16Zm56 0H48c-5 0-8 3-8 6v42c0-4 4-7 9-7h19V16Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"5\" stroke-linejoin=\"round\"/>"}, "slider": {"name": "Reading Slider", "icon": "<path d=\"M14 20h52M14 34h36\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M12 58h56\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"33\" cy=\"58\" r=\"10\" fill=\"currentColor\"/>"}, "pyramid": {"name": "Sentence Pyramids", "icon": "<path d=\"M33 15h14M25 29h30M17 43h46M9 57h62\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"6\" stroke-linecap=\"round\"/><path d=\"M9 69h62\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\"/><circle cx=\"26\" cy=\"69\" r=\"5\" fill=\"currentColor\"/>"}, "wordparts": {"name": "Word Parts", "icon": "<rect x=\"5\" y=\"20\" width=\"20\" height=\"35\" rx=\"5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"4\"/><rect x=\"30\" y=\"20\" width=\"20\" height=\"35\" rx=\"5\" fill=\"currentColor\"/><rect x=\"55\" y=\"20\" width=\"20\" height=\"35\" rx=\"5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"4\"/><path d=\"M29 65h22M29 62v6M51 62v6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"4\" stroke-linecap=\"round\"/>"}, "lettertiles": {"name": "Letter Tiles", "icon": "<rect x=\"6\" y=\"15\" width=\"29\" height=\"42\" rx=\"6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"4\"/><rect x=\"45\" y=\"24\" width=\"29\" height=\"42\" rx=\"6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"4\"/><path d=\"M13 46l7-21 7 21m-12-6h10M53 34v22h6c9 0 9-11 0-11h-6m0 0h5c8 0 8-11 0-11h-5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"}, "lesson": {"name": "Lesson Plan", "icon": "<rect x=\"14\" y=\"14\" width=\"52\" height=\"58\" rx=\"7\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"4\"/><rect x=\"28\" y=\"8\" width=\"24\" height=\"13\" rx=\"4\" fill=\"currentColor\"/><path d=\"M23 34l4 4 6-7M41 35h15M23 51l4 4 6-7M41 52h15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"}};
  R.toolIcon = page => {
    const tool = R.toolMetadata[page] || R.toolMetadata.home;
    return '<svg class="tool-glyph" viewBox="0 0 80 80" fill="none" aria-hidden="true">' + tool.icon + '</svg>';
  };
  R.brandMarkup = page => {
    const key = R.toolMetadata[page] ? page : 'home';
    const tool = R.toolMetadata[key];
    return '<span class="tool-brand tool-theme" data-tool="' + key + '"><span class="tool-brand-icon">' + R.brandIcon(key) + '</span><span class="tool-brand-name">' + tool.name + '</span></span>';
  };
  /* LESSON CREATOR: explicit URL context; normal practice has no authoring controls. */
  R.creator = { context:null, capture:null, button:null };
  R.creator.names = {slider:'Reading Slider',pyramid:'Sentence Pyramids',wordparts:'Word Parts',lettertiles:'Letter Tiles'};
  R.creator.boundedEncode = value => {const encoded=R.encode(value);if(encoded.length>300000)throw Error('This lesson is too large for a lesson link. Shorten the activity content before adding more.');return encoded;};
  R.creator.getPlan = () => {if(!R.creator.context)throw Error('Open a tool from your lesson’s Create mode first.');return R.freshPlan(R.normalizePlan(R.creator.context.plan));};
  R.creator.lessonURL = plan => {const url=R.siteURL('lesson.html');url.searchParams.set('create','1');url.hash='plan='+R.creator.boundedEncode(R.planSnapshot(plan));return url.href;};
  R.creator.toolURL = (page,plan,sectionId) => {
    if(!Object.hasOwn(R.creator.names,page))throw Error('Choose a supported lesson tool.');
    const fresh=R.freshPlan(R.normalizePlan(plan));if(!fresh.sections.some(s=>s.id===sectionId))throw Error('Choose a lesson section first.');
    const url=R.siteURL(R.practicePath(page));url.hash='create='+R.creator.boundedEncode({version:1,plan:R.planSnapshot(fresh),sectionId});return url.href;
  };
  R.creator.cleanURL = value => {const url=R.safeURL(value);if(url.origin!==location.origin||!Object.keys(R.creator.names).some(page=>url.pathname===R.siteURL(R.practicePath(page)).pathname))throw Error('Choose content from one of this site’s lesson tools.');url.hash='';['create','teacher','autostart'].forEach(key=>url.searchParams.delete(key));return R.localURL(url.href);};
  R.creator.readingContent = mode => {
    const source=R.$('#reading-text').value.trim(),format=R.$('#reading-format').value;
    const examples=format==='csv'?R.parseCSV(source):source?[source]:[];
    if(!examples.length)throw Error('Enter some reading content first.');
    const part=mode==='wordparts'?R.$('#reading-part').value.trim().normalize('NFC').replace(/^-+|-+$/g,''):'';
    if(mode==='wordparts'){
      if(!part)throw Error('Enter a word part first.');
      const invalid=examples.flatMap(R.words).filter(word=>!R.readingMath.partMatch(word,part));
      if(invalid.length)throw Error(`These words do not contain “${part}”: ${invalid.join(', ')}.`);
    }
    const url=R.siteURL('language/'+mode+'.html');url.searchParams.set(format==='csv'?'csv':'text',source);url.searchParams.set('dolch',(R.$('#reading-dolch')?.checked??false)?'1':'0');
    if(part)url.searchParams.set('part',part);
    for(const key of ['groups','sight']){const value=R.$('#reading-'+key).value.trim();if(value)url.searchParams.set(key,value);}
    // Pyramid activity names use the final nonempty line of the first example.
    const titleSource=mode==='pyramid'
      ? examples[0].split(/\r\n|\r|\n/).map(line=>line.trim()).filter(Boolean).pop()||examples[0]
      : part||examples[0];
    const preview=titleSource.replace(/\s+/g,' ').slice(0,mode==='pyramid'?200:80);
    return {url:url.href,title:((mode==='pyramid'?'Sentence Pyramids':R.creator.names[mode])+': '+preview).slice(0,200)};
  };
  R.creator.spellingContent = () => {
    const words=[...new Set(R.words(R.$('#tile-words').value).map(word=>word.toLocaleLowerCase()))];
    if(!words.length)throw Error('Enter some spelling words first.');if(words.length>200)throw Error('Maximum 200 spelling words.');
    const invalid=words.filter(word=>!/^\p{L}[\p{L}\p{M}]*$/u.test(word));if(invalid.length)throw Error('Use single words containing letters only: '+invalid.join(', '));
    const url=R.siteURL('language/lettertiles.html');url.searchParams.set('text',words.join(', '));
    return {url:url.href,title:('Letter Tiles: '+words.join(', ')).slice(0,200)};
  };
  R.creator.addContent = ({sectionId,sectionTitle,title,url}) => {
    const plan=R.creator.getPlan(),label=String(title||'').trim();if(!label)throw Error('Give the activity a name.');if(label.length>200)throw Error('Activity names must be 200 characters or fewer.');
    if(R.planItems(plan).length>=200)throw Error('Maximum 200 activities per lesson.');
    let section;
    if(sectionId==='__new__'){
      const name=String(sectionTitle||'').trim();if(!name)throw Error('Give the new section a name.');if(name.length>200)throw Error('Section names must be 200 characters or fewer.');if(plan.sections.length>=50)throw Error('Maximum 50 lesson sections.');
      section={id:R.id(),title:name,items:[]};plan.sections.push(section);
    }else{section=plan.sections.find(s=>s.id===sectionId);if(!section)throw Error('That section was removed. Return to the lesson and choose another section.');}
    const item={id:R.id(),title:label,url:R.creator.cleanURL(url),done:false,timer:R.timer()};section.items.push(item);R.touchPlan(plan);
    const returnURL=R.creator.lessonURL(plan),saved=R.savePlan(plan);
    R.creator.context={version:1,plan,sectionId:section.id};return {plan,item,returnURL,saved};
  };
  R.creator.register = capture => {R.creator.capture=capture;if(R.creator.button)R.creator.button.disabled=false;};
  R.creator.openDialog = () => {
    let content,plan;try{if(!R.creator.capture)throw Error('The tool is still loading.');content=R.creator.capture();plan=R.creator.getPlan();}catch(error){R.notice(error.message);return;}
    if(document.getElementById('lesson-add-dialog'))return;
    const dialog=document.createElement('dialog');dialog.id='lesson-add-dialog';dialog.className='lesson-add-dialog';dialog.setAttribute('aria-labelledby','lesson-add-title');
    dialog.innerHTML='<form><h2 id="lesson-add-title">Add to lesson</h2><p class="creator-target"></p><label for="creator-activity-name">Activity name</label><input id="creator-activity-name" class="form-control" required maxlength="200"><label for="creator-section">Lesson section</label><select id="creator-section" class="form-select" required></select><div class="creator-new-section" hidden><label for="creator-section-name">New section name</label><input id="creator-section-name" class="form-control" maxlength="200"></div><p class="creator-save-error" role="alert"></p><div class="creator-dialog-actions"><button type="button" class="btn btn-outline-secondary creator-cancel">Cancel</button><button type="submit" class="btn btn-primary">Add &amp; return to lesson</button></div></form>';
    const form=dialog.querySelector('form'),title=dialog.querySelector('#creator-activity-name'),select=dialog.querySelector('#creator-section'),sectionName=dialog.querySelector('#creator-section-name'),error=dialog.querySelector('.creator-save-error');
    dialog.querySelector('.creator-target').textContent=plan.title;title.value=content.title;
    const option=(value,label)=>{const el=document.createElement('option');el.value=value;el.textContent=label;select.appendChild(el);};
    option('','Choose a section');plan.sections.forEach(section=>option(section.id,section.title));option('__new__','+ Create a new section');
    const selected=R.creator.context.sectionId;select.value=plan.sections.some(section=>section.id===selected)?selected:'';
    const sync=()=>{const adding=select.value==='__new__';dialog.querySelector('.creator-new-section').hidden=!adding;sectionName.required=adding;};select.addEventListener('change',sync);sync();
    dialog.querySelector('.creator-cancel').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>dialog.remove());
    form.addEventListener('submit',event=>{
      event.preventDefault();if(!form.reportValidity())return;const submit=form.querySelector('[type="submit"]');submit.disabled=true;
      let result;try{result=R.creator.addContent({sectionId:select.value,sectionTitle:sectionName.value,title:title.value,url:content.url});}catch(problem){submit.disabled=false;error.textContent=problem.message;return;}
      try{location.assign(result.returnURL);}catch(problem){error.textContent='Activity added. Use the link below to return to your lesson.';const link=document.createElement('a');link.href=result.returnURL;link.textContent='Return to lesson';error.append(' ',link);}
    });
    document.body.appendChild(dialog);dialog.showModal();title.focus();title.select();
  };
  R.creator.init = () => {
    if(!Object.hasOwn(R.creator.names,document.body.dataset.page))return;
    const params=new URLSearchParams(location.hash.slice(1)),value=params.get('create');if(!value||params.has('lesson'))return;
    try{
      const raw=R.decode(value);if(raw.version!==1||typeof raw.sectionId!=='string')throw Error('Invalid create-mode context.');
      R.creator.context={version:1,plan:R.freshPlan(R.normalizePlan(raw.plan)),sectionId:raw.sectionId};
      const plan=R.creator.getPlan();document.body.classList.add('is-create-mode');
      const button=R.creator.button=R.action('creator-add-to-lesson','new','Add content to lesson',R.creator.openDialog);button.classList.add('creator-add-button');button.disabled=!R.creator.capture;const label=document.createElement('span');label.textContent='Add to lesson';button.appendChild(label);
      const strip=document.createElement('aside');strip.className='creator-strip';strip.setAttribute('aria-label','Create mode');
      const title=document.createElement('span');title.textContent='Create mode · '+plan.title;strip.appendChild(title);
      const link=document.createElement('a');link.className='btn btn-sm btn-outline-primary';link.textContent='Back to lesson';link.href=R.creator.lessonURL(plan);link.addEventListener('click',event=>{try{link.href=R.creator.lessonURL(R.creator.getPlan());}catch(error){event.preventDefault();R.notice(error.message);}});strip.appendChild(link);
      const setup=R.$('#setup-panel');if(setup)setup.before(strip);
      const lessonLink=R.$('[data-nav-slot="links"] a[href="lesson.html"]');if(lessonLink){lessonLink.href=link.href;lessonLink.addEventListener('click',event=>{try{lessonLink.href=R.creator.lessonURL(R.creator.getPlan());}catch(error){event.preventDefault();R.notice(error.message);}});}
    }catch(error){R.creator.context=null;R.notice('Create mode could not be opened: '+error.message);}
  };
  /* LANGUAGE ROUTING: shared root services and backward-compatible tool links. */
  const appScript=Array.from(document.scripts).find(script=>script.src&&new URL(script.src,location.href).pathname.endsWith('/assets/js/app.js'));
  R.siteRoot=new URL(appScript?'../../':(location.pathname.includes('/language/')?'../':'./'),appScript?appScript.src:location.href);
  R.siteURL=path=>new URL(path,R.siteRoot);
  R.languageFiles=new Set(['slider.html','pyramid.html','wordparts.html','lettertiles.html']);
  R.route=path=>{
    const text=String(path),match=text.match(/^(?:\.\/)?(?:(?:language|math)\/)?([^/?#]+\.html)([?#].*)?$/);
    if(!match)return text;
    if(R.mathFiles?.has(match[1]))return 'math/'+match[1]+(match[2]||'');
    return R.languageFiles.has(match[1])?'language/'+match[1]+(match[2]||''):text;
  };
  R.resolveURL=value=>{
    const text=String(value||'');
    const relative=text.match(/^(?:\.\/)?(?:(?:language|math)\/)?([^/?#]+\.html)([?#].*)?$/),owned=!!relative&&(R.languageFiles.has(relative[1])||R.mathFiles?.has(relative[1])||['lesson.html','index.html'].includes(relative[1]));
    let url=new URL(owned?R.route(text):text,owned?R.siteRoot:location.href);
    if(!['http:','https:'].includes(url.protocol)&&!(location.protocol==='file:'&&url.protocol==='file:'))throw Error('Use an http or https activity link.');
    const file=url.pathname.split('/').pop(),root=R.siteRoot.pathname;
    if(R.mathFiles?.has(file)&&((url.origin===R.siteRoot.origin&&(url.pathname===root+file||url.pathname===root+'math/'+file))||(url.hostname==='meghanhorton.github.io'&&url.pathname.startsWith('/reading-slider/')))){
      const canonical=R.siteURL('math/'+file);canonical.search=url.search;canonical.hash=url.hash;return canonical;
    }
    const ours=url.origin===R.siteRoot.origin&&(url.pathname===root+file||url.pathname===root+'language/'+file);
    const legacy=url.hostname==='meghanhorton.github.io'&&url.pathname.startsWith('/reading-slider/')&&R.languageFiles.has(file);
    if(R.languageFiles.has(file)&&(ours||legacy)){
      const canonical=R.siteURL('language/'+file);canonical.search=url.search;canonical.hash=url.hash;url=canonical;
    }
    return url;
  };
  R.mascotFiles={slider:'reading-slider',pyramid:'sentence-pyramids',wordparts:'word-parts',lettertiles:'letter-tiles',lesson:'lesson-plan'};
  R.brandIcon=key=>R.mascotFiles[key]?'<img class="tool-brand-mascot" src="'+R.siteURL('assets/img/tool-icons/'+(['addition','numberline'].includes(key)?R.mascotFiles[key]+'.png?v=mathcharacters1':'nav/'+R.mascotFiles[key]+'.png?v=header1')).href+'" alt="" width="44" height="44">':(R.toolIcon?R.toolIcon(key):R.icon('home'));
  if(R.toolMetadata?.home)R.toolMetadata.language={name:'Language',icon:R.toolMetadata.home.icon};
  /* MINIMAL TOOLS DROPDOWN */
  R.addToolsDropdown=bar=>{
    const slot=bar.querySelector('[data-nav-slot="links"]'),details=document.createElement('details');details.className='minimal-tools';
    const summary=document.createElement('summary');summary.className='icon-button minimal-tools-toggle';summary.textContent='Tools';details.appendChild(summary);
    const panel=document.createElement('nav');panel.className='minimal-tools-panel';panel.setAttribute('aria-label','Tools');
    const tools=[['slider','Reading Slider','reading-slider','#048CD6'],['pyramid','Sentence Pyramids','sentence-pyramids','#FF6B43'],['wordparts','Word Parts','word-parts','#552CB8'],['lettertiles','Letter Tiles','letter-tiles','#FC7DA8'],['addition','Addition','addition','#FC4F42'],['numberline','Number Line','numberline','#048CD6']];
    const planLink=document.createElement('a');planLink.className='minimal-tools-item tools-plan-entry';planLink.href=R.siteURL('lesson.html').href;planLink.style.setProperty('--tool-link-color','#906E37');
    const planImage=document.createElement('img');planImage.src=R.siteURL('assets/img/tool-icons/lesson-plan.png').href;planImage.alt='';planImage.width=44;planImage.height=50;planLink.appendChild(planImage);
    const planName=document.createElement('span');planName.textContent='Lesson Plan';planLink.appendChild(planName);if(document.body.dataset.page==='lesson')planLink.setAttribute('aria-current','page');
    planLink.addEventListener('click',event=>{if(R.creator?.context){try{planLink.href=R.creator.lessonURL(R.creator.getPlan());}catch(error){event.preventDefault();R.notice(error.message);return;}}details.open=false;});panel.appendChild(planLink);
    const languageHeading=document.createElement('p');languageHeading.className='math-menu-heading';languageHeading.textContent='Language';panel.appendChild(languageHeading);
    for(const [key,name,file,color] of tools){
      if(key==='addition'){const heading=document.createElement('p');heading.className='math-menu-heading';heading.textContent='Math';panel.appendChild(heading);}
      const link=document.createElement('a');link.href=R.siteURL(R.practicePath(key)).href;link.className='minimal-tools-item';link.style.setProperty('--tool-link-color',color);
      if(file){const image=document.createElement('img');image.src=R.siteURL('assets/img/tool-icons/'+file+'.png').href;image.alt='';image.width=44;image.height=50;link.appendChild(image);}else{const icon=document.createElement('span');icon.className='math-menu-icon';icon.innerHTML=R.toolIcon(key);link.appendChild(icon);}
      const label=document.createElement('span');label.textContent=name;link.appendChild(label);if(document.body.dataset.page===key)link.setAttribute('aria-current','page');
      link.addEventListener('click',event=>{if(R.creator?.context){try{link.href=R.creator.toolURL(key,R.creator.getPlan(),R.creator.context.sectionId);}catch(error){event.preventDefault();R.notice(error.message);return;}}details.open=false;});panel.appendChild(link);
    }
    details.appendChild(panel);slot.appendChild(details);
    const position=()=>{const rect=details.getBoundingClientRect(),width=Math.min(300,window.innerWidth-24);panel.style.width=width+'px';panel.style.left=Math.max(12-rect.left,Math.min(0,window.innerWidth-12-rect.left-width))+'px';};
    details.addEventListener('toggle',()=>{if(details.open)position();});
    document.addEventListener('pointerdown',event=>{if(details.open&&!details.contains(event.target))details.open=false;});
    document.addEventListener('focusin',event=>{if(details.open&&!details.contains(event.target))details.open=false;});
    details.addEventListener('keydown',event=>{if(event.key==='Escape'&&details.open){event.preventDefault();event.stopPropagation();details.open=false;summary.focus();}});
    window.addEventListener('resize',()=>{if(details.open)position();});
  };
  /* PUPPY BRAND ASSETS */
  R.homeLogoMarkup=()=>'<img class="home-logo-image" src="'+R.siteURL('assets/img/branding/app-icon.png?v=puppy3').href+'" alt="" width="34" height="34">';
  /* WHITE HEADER + LESSON EDITOR FOOTER */
  R.lessonEditorLabels={'lesson-edit':'Edit','lesson-copy':'Copy link','lesson-share':'Share','lesson-new':'New lesson','lesson-export':'Save backup','lesson-import':'Import'};
  R.finishWhiteHeader=()=>{
    const bar=R.$('#appbar');if(!bar)return;
    const menu=bar.querySelector('.minimal-tools')||bar.querySelector('.tools-dropdown');
    if(menu){let slot=bar.querySelector('.header-tools-slot');if(!slot){slot=document.createElement('div');slot.className='nav-group header-tools-slot';bar.insertBefore(slot,R.$('#app-notice'));}slot.appendChild(menu);}
    if(['slider','pyramid','wordparts','lettertiles','addition','numberline','lesson'].includes(document.body.dataset.page)&&!bar.querySelector('.header-puppy-divider')){
      const divider=document.createElement('span');divider.className='header-puppy-divider';divider.setAttribute('aria-hidden','true');bar.insertBefore(divider,bar.querySelector('.appbar-title'));
    }
    if(document.body.dataset.page==='lesson'){
      const footer=R.$('#lesson-editor-nav');if(!footer)return;
      const measure=()=>{const height=Math.ceil(footer.getBoundingClientRect().height);if(R.lessonEditorHeight!==height){R.lessonEditorHeight=height;document.documentElement.style.setProperty('--lesson-editor-height',height+'px');}};
      measure();if(typeof ResizeObserver==='function')new ResizeObserver(measure).observe(footer);else window.addEventListener('resize',measure);
    }
  };
  /* STICKY TOOL CONTROLS */
  R.isToolToolbarPage=()=>['slider','pyramid','wordparts','lettertiles','addition','numberline'].includes(document.body.dataset.page);
  R.toolToolbarLabels={"reading-edit": "Edit", "reading-copy": "Copy link", "reading-previous": "Previous", "reading-next": "Next", "example-previous": "Previous example", "example-next": "Next example", "tiles-edit": "Edit", "tiles-copy": "Copy link", "complete-return": "Done", "timer-start": "Start", "timer-pause": "Pause", "timer-reset": "Reset"};
  R.scheduleToolToolbar=()=>{if(!R.toolToolbar||R.toolToolbarFrame)return;R.toolToolbarFrame=requestAnimationFrame(()=>{R.toolToolbarFrame=null;R.refreshToolToolbar();});};
  R.refreshToolToolbar=()=>{
    const footer=R.toolToolbar;if(!footer)return;
    const visible=element=>{for(let node=element;node&&node!==footer;node=node.parentElement)if(node.hidden)return false;return true;};
    const groups=Array.from(footer.querySelectorAll('.tool-toolbar-group'));
    groups.forEach(group=>{
      group.hidden=false;
      if(group.dataset.toolControls==='spelling'&&R.$('#reader-panel').hidden){group.hidden=true;return;}
      group.hidden=!Array.from(group.querySelectorAll('button,a,output,.nav-count')).some(visible);
    });
    const active=groups.some(group=>!group.hidden);footer.hidden=!active;
    const height=active?Math.ceil(footer.getBoundingClientRect().height):0;
    if(R.toolToolbarHeight!==height){R.toolToolbarHeight=height;document.documentElement.style.setProperty('--tool-toolbar-height',height+'px');window.dispatchEvent(new Event('reading:layout'));}
  };
  R.initToolToolbar=()=>{
    if(!R.isToolToolbarPage()||R.toolToolbar)return;
    const bar=R.$('#appbar'),footer=document.createElement('nav');footer.id='tool-toolbar';footer.className='tool-toolbar';footer.setAttribute('aria-label','Activity controls');footer.hidden=true;
    const inner=document.createElement('div');inner.className='tool-toolbar-inner';footer.appendChild(inner);
    for(const slot of ['actions','reading','timer']){const group=bar.querySelector('[data-nav-slot="'+slot+'"]');if(group){group.classList.add('tool-toolbar-group');inner.appendChild(group);}}
    if(document.body.dataset.page==='lettertiles'){const spelling=R.$('.tile-actions');if(spelling){spelling.classList.add('tool-toolbar-group');spelling.dataset.toolControls='spelling';inner.appendChild(spelling);}}
    document.body.appendChild(footer);document.body.classList.add('has-tool-toolbar');R.toolToolbar=footer;
    if(typeof ResizeObserver==='function')new ResizeObserver(()=>R.scheduleToolToolbar()).observe(footer);
    window.addEventListener('resize',()=>R.scheduleToolToolbar());
    R.refreshToolToolbar();
  };
  /* MATH ADDITION INTEGRATION */
  R.mathFiles=new Set(['addition.html']);
  R.practicePath=page=>(R.mathFiles.has(page+'.html')?'math/':'language/')+page+'.html';
  toolNames.add('addition.html');
  R.toolMetadata.addition={name:'Addition',icon:"<circle cx=\"40\" cy=\"40\" r=\"29\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"5\"/><path d=\"M40 23v34M23 40h34\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"6\" stroke-linecap=\"round\"/>"};
  R.toolMetadata.math={name:'Math',icon:R.toolMetadata.addition.icon};
  R.creator.names.addition='Addition';
  Object.assign(R.toolToolbarLabels,{'addition-edit':'Settings','addition-copy':'Copy link'});
  /* CHARACTER ICONS + LESSON PLAN MENU */
  R.mascotFiles.addition='addition';
  R.lessonMascotMarkup=page=>{const file=R.mascotFiles[page];return file?'<img class="lesson-character-image" src="'+R.siteURL('assets/img/tool-icons/'+file+'.png').href+'" alt="" loading="lazy" decoding="async">':(R.toolIcon?R.toolIcon(page):R.icon('lesson'));};
  R.lessonItemMascot=item=>{if(R.isOfflineItem(item))return R.offlineItemIcon(item.kind);
    try{const url=R.safeURL(item.url),page=Object.keys(R.creator.names).find(page=>url.origin===R.siteRoot.origin&&url.pathname===R.siteURL(R.practicePath(page)).pathname);return page?R.lessonMascotMarkup(page):'';}catch(error){return '';}
  };
  /* NUMBER LINE INTEGRATION */
  R.mathFiles.add('numberline.html');toolNames.add('numberline.html');
  R.toolMetadata.numberline={name:'Number Line',icon:"<path d=\"M8 54h64M14 44v20M32 44v20M50 44v20M68 44v20M24 44Q40 10 56 44M7 54l6-5M7 54l6 5M73 54l-6-5M73 54l-6 5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"};
  R.creator.names.numberline='Number Line';
  Object.assign(R.toolToolbarLabels,{'numberline-edit':'Settings','numberline-copy':'Copy link','numberline-undo':'Undo','numberline-clear':'Clear line'});
  /* NUMBER LINE CHARACTER */
  R.mascotFiles.numberline='numberline';
  /* OFFLINE LESSON ACTIVITIES */
  R.isOfflineItem=item=>item?.kind==='worksheet'||item?.kind==='book';
  R.lessonSchemaVersion=plan=>plan.version===2||(Array.isArray(plan.sections)&&plan.sections.some(section=>Array.isArray(section?.items)&&section.items.some(R.isOfflineItem)))?2:1;
  R.normalizeLessonItem=item=>{
    const kind=item.kind===undefined?'link':item.kind;
    if(!['link','worksheet','book'].includes(kind))throw Error('Unsupported lesson activity type.');
    if(kind==='link'&&(typeof item.url!=='string'||!item.url.trim()))throw Error('Web activities need an address. Choose Worksheet or Book reading for an offline item.');
    return{id:item.id,title:String(item.title||'Activity').slice(0,200),kind,url:kind==='link'?R.localURL(item.url):null,reference:String(item.reference||'').slice(0,300),notes:String(item.notes||'').slice(0,2000),done:!!item.done,timer:R.timer(item.timer)};
  };
  R.offlineItemIcon=kind=>'<svg class="tool-glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="'+(kind==='book'?'M3 4h6c2 0 3 1 3 3v14c0-2-2-3-4-3H3V4Zm18 0h-6c-2 0-3 1-3 3v14c0-2 2-3 4-3h5V4Z':'M5 3h10l4 4v14H5V3Zm10 0v5h4M8 12h8M8 16h6')+'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  /* DOLCH WHOLE-SIGHT-WORD SETTINGS */
  // Source lists: https://sightwords.com/sight-words/dolch/ (220 service words + 95 nouns).
  R.dolchWords=["a", "and", "away", "big", "blue", "can", "come", "down", "find", "for", "funny", "go", "help", "here", "I", "in", "is", "it", "jump", "little", "look", "make", "me", "my", "not", "one", "play", "red", "run", "said", "see", "the", "three", "to", "two", "up", "we", "where", "yellow", "you", "all", "am", "are", "at", "ate", "be", "black", "brown", "but", "came", "did", "do", "eat", "four", "get", "good", "have", "he", "into", "like", "must", "new", "no", "now", "on", "our", "out", "please", "pretty", "ran", "ride", "saw", "say", "she", "so", "soon", "that", "there", "they", "this", "too", "under", "want", "was", "well", "went", "what", "white", "who", "will", "with", "yes", "after", "again", "an", "any", "as", "ask", "by", "could", "every", "fly", "from", "give", "going", "had", "has", "her", "him", "his", "how", "just", "know", "let", "live", "may", "of", "old", "once", "open", "over", "put", "round", "some", "stop", "take", "thank", "them", "then", "think", "walk", "were", "when", "always", "around", "because", "been", "before", "best", "both", "buy", "call", "cold", "does", "don't", "fast", "first", "five", "found", "gave", "goes", "green", "its", "made", "many", "off", "or", "pull", "read", "right", "sing", "sit", "sleep", "tell", "their", "these", "those", "upon", "us", "use", "very", "wash", "which", "why", "wish", "work", "would", "write", "your", "about", "better", "bring", "carry", "clean", "cut", "done", "draw", "drink", "eight", "fall", "far", "full", "got", "grow", "hold", "hot", "hurt", "if", "keep", "kind", "laugh", "light", "long", "much", "myself", "never", "only", "own", "pick", "seven", "shall", "show", "six", "small", "start", "ten", "today", "together", "try", "warm", "apple", "baby", "back", "ball", "bear", "bed", "bell", "bird", "birthday", "boat", "box", "boy", "bread", "brother", "cake", "car", "cat", "chair", "chicken", "children", "Christmas", "coat", "corn", "cow", "day", "dog", "doll", "door", "duck", "egg", "eye", "farm", "farmer", "father", "feet", "fire", "fish", "floor", "flower", "game", "garden", "girl", "goodbye", "grass", "ground", "hand", "head", "hill", "home", "horse", "house", "kitty", "leg", "letter", "man", "men", "milk", "money", "morning", "mother", "name", "nest", "night", "paper", "party", "picture", "pig", "rabbit", "rain", "ring", "robin", "Santa Claus", "school", "seed", "sheep", "shoe", "sister", "snow", "song", "squirrel", "stick", "street", "sun", "table", "thing", "time", "top", "toy", "tree", "watch", "water", "way", "wind", "window", "wood"];
  R.sightKey=text=>String(text).normalize('NFC').toLocaleLowerCase().replace(/[^\p{L}\p{M}]/gu,'');
  R.wholeSightWords=(value,useDolch=false)=>[...new Set([...R.entries(value),...(useDolch?R.dolchWords:[])].flatMap(word=>word.split(/\s+/u)).map(R.sightKey).filter(Boolean))];
  R.init = () => {
    if(R.initialized)return;R.initialized=true;
    const bar=R.$('#appbar');if(!bar)return;
    [['index.html','home','Home']].forEach(([href,icon,label])=>{const a=document.createElement('a');a.href=R.siteURL(R.route(href)).href;a.className='icon-button';a.title=label;a.setAttribute('aria-label',label);a.innerHTML=icon==='home'?R.homeLogoMarkup():(icon==='lesson'?R.toolIcon('lesson'):R.icon(icon));if(icon==='home')a.classList.add('home-logo-button');bar.querySelector('[data-nav-slot="links"]').appendChild(a);});
    R.addToolsDropdown(bar);
    bar.querySelector('.appbar-title').innerHTML = R.brandMarkup(document.body.dataset.page);
    document.querySelectorAll('[data-tool-icon]').forEach(el => {
      el.innerHTML = R.toolIcon(el.dataset.toolIcon);
    });
    const size=()=>{const h=Math.ceil(bar.getBoundingClientRect().height);if(R.navHeight!==h){R.navHeight=h;document.documentElement.style.setProperty('--nav-height',h+'px');global.dispatchEvent(new Event('reading:layout'));}};
    if(typeof ResizeObserver==='function')new ResizeObserver(size).observe(bar);else global.addEventListener('resize',size);size();
    document.addEventListener('pointerdown',unlockAudio,{passive:true});document.addEventListener('keydown',unlockAudio);
    try{const value=new URLSearchParams(location.hash.slice(1)).get('lesson');if(value){const raw=R.decode(value),base=new URL(raw.returnBase,location.href),plan=R.normalizePlan(raw.plan);if(raw.version!==1||base.origin!==location.origin||!base.pathname.endsWith('/lesson.html')||!R.planItems(plan).some(i=>i.id===raw.itemId))throw Error('Invalid checklist context.');context={plan,itemId:raw.itemId,base:base.href};}}
    catch(error){R.notice('Checklist return link could not be loaded.');}
    if(context){
      const finish=R.action('complete-return','done','Complete and return to checklist',()=>{const data=currentContext();if(!data)return;data.item.timer=R.timerAction(data.item.timer,'pause');data.item.done=true;R.touchPlan(data.plan);R.savePlan(data.plan);location.assign(R.lessonURL(data.plan,context.base));});finish.classList.add('success-button');
      const slot=bar.querySelector('[data-nav-slot="timer"]'),time=document.createElement('output');time.className='timer-value';time.setAttribute('aria-label','Activity elapsed time');slot.appendChild(time);
      const start=R.action('timer-start','play','Start timer',()=>timerChange('start'),'timer'),pause=R.action('timer-pause','pause','Pause timer',()=>timerChange('pause'),'timer');R.action('timer-reset','reset','Reset timer',()=>{if(confirm('Reset this activity’s recorded time?'))timerChange('reset');},'timer');
      const refresh=()=>{const data=currentContext();if(!data)return;time.textContent=R.formatTime(R.elapsed(data.item.timer));start.disabled=!!data.item.timer.runningSince;pause.disabled=!data.item.timer.runningSince;};refresh();setInterval(refresh,250);
    }
    R.creator.init();
    R.finishWhiteHeader();
    R.initToolToolbar();
    if(document.body.dataset.page==='home'){const p=new URLSearchParams(location.search);if(p.has('text')||p.has('csv')){const u=R.siteURL('language/slider.html');u.search=location.search;u.hash=location.hash;location.replace(u.href);}}
  };
})(window);

$(function(){ window.ReadingApp.init(); });

/* LITTLE LEARNING LAB PROFILES v1 */
(function(global){
  'use strict';
  const R=global.ReadingApp;
  const META='reading:profiles:v1',SESSION='reading:profile-tab:v1';
  const animals=['kitten','puppy','bunny','fox','red panda','otter','bear','penguin'];
  const P=R.profiles={ready:false,id:null,requiresChoice:false,error:'',animals};
  const prefix=id=>'reading:profile:'+id+':';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const state=()=>{const s=JSON.parse(localStorage.getItem(META)||'null');if(!s||s.version!==1||!Array.isArray(s.profiles)||!s.profiles.length||s.profiles.some(p=>!p||typeof p.id!=='string'||!p.id||typeof p.name!=='string'||!animals.includes(p.animal))||new Set(s.profiles.map(p=>p.id)).size!==s.profiles.length)throw Error('Profile storage needs recovery. Existing records have not been deleted.');return s;};
  const write=s=>localStorage.setItem(META,JSON.stringify(s));
  const exists=id=>state().profiles.some(p=>p.id===id);
  const keys=()=>Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter(Boolean);
  P.current=()=>{try{return state().profiles.find(p=>p.id===P.id)||null;}catch(error){return null;}};
  P.all=()=>state().profiles;
  P.canUse=()=>P.ready&&!P.requiresChoice&&!!P.current();
  P.key=suffix=>{if(!P.canUse())throw Error('Choose an available profile before saving this lesson.');return prefix(P.id)+suffix;};
  R.profileStorageKey=P.key;
  P.pause=raw=>{const p=R.normalizePlan(copy(raw));R.planItems(p).forEach(item=>{item.timer=R.timerAction(item.timer,'pause');});return p;};
  function cleanName(name){const value=String(name||'').trim();if(!value||value.length>60)throw Error('Enter a name between 1 and 60 characters.');return value;}
  function cleanAnimal(animal){if(!animals.includes(animal))throw Error('Choose an animal.');return animal;}
  P.listPlans=id=>{if(!exists(id))throw Error('That profile is no longer available.');return keys().filter(k=>k.startsWith(prefix(id)+'lesson:')).flatMap(k=>{try{return[R.normalizePlan(JSON.parse(localStorage.getItem(k)))];}catch(error){return[];}}).sort((a,b)=>b.updatedAt-a.updatedAt||a.title.localeCompare(b.title));};
  P.putPlan=(id,raw,makeLast=true)=>{
    if(!exists(id))throw Error('That profile is no longer available.');
    const p=R.normalizePlan(copy(raw)),key=prefix(id)+'lesson:'+p.id,lastKey=prefix(id)+'last-lesson',old=localStorage.getItem(key),last=localStorage.getItem(lastKey);
    if(localStorage.getItem(prefix(id)+'deleted:'+p.id))throw Error('This lesson was deleted. Import it as a new lesson to restore it.');
    try{localStorage.setItem(key,JSON.stringify(p));if(makeLast)localStorage.setItem(lastKey,p.id);}
    catch(error){try{if(old===null)localStorage.removeItem(key);else localStorage.setItem(key,old);if(last===null)localStorage.removeItem(lastKey);else localStorage.setItem(lastKey,last);}catch(ignored){}throw error;}
    return p;
  };
  P.blank=()=>R.normalizePlan({version:1,id:R.id(),title:'New Lesson',updatedAt:Date.now(),sections:[]});
  P.clonePlan=(raw,reset=false)=>{
    const p=P.pause(raw);p.id=R.id();p.updatedAt=Date.now();p.sections.forEach(section=>{section.id=R.id();section.items.forEach(item=>{item.id=R.id();if(reset){item.done=false;item.timer=R.timer();}});});return p;
  };
  P.importPlan=raw=>P.clonePlan(raw,false);
  P.create=(name,animal)=>{
    const s=state(),profile={id:R.id(),name:cleanName(name),animal:cleanAnimal(animal)},plan=P.blank(),k=prefix(profile.id)+'lesson:'+plan.id,last=prefix(profile.id)+'last-lesson';
    try{localStorage.setItem(k,JSON.stringify(plan));localStorage.setItem(last,plan.id);s.profiles.push(profile);write(s);}
    catch(error){localStorage.removeItem(k);localStorage.removeItem(last);throw error;}
    return profile;
  };
  P.update=(id,name,animal)=>{const s=state(),p=s.profiles.find(p=>p.id===id);if(!p)throw Error('That profile is no longer available.');p.name=cleanName(name);p.animal=cleanAnimal(animal);write(s);return p;};
  P.removeProfile=id=>{
    if(id===P.id)throw Error('Switch to another profile before deleting this one.');
    const s=state();if(!s.profiles.some(p=>p.id===id))return;
    s.profiles=s.profiles.filter(p=>p.id!==id);if(s.last===id)s.last=P.id;write(s);
    keys().filter(k=>k.startsWith(prefix(id))).forEach(k=>localStorage.removeItem(k));
  };
  P.pauseCurrent=()=>{
    const last=localStorage.getItem(P.key('last-lesson'));
    for(const p of P.listPlans(P.id)){
      if(R.planItems(p).some(i=>R.timer(i.timer).runningSince)){
        const paused=P.pause(p);R.touchPlan(paused);P.putPlan(P.id,paused,false);
      }
    }
    if(last)localStorage.setItem(P.key('last-lesson'),last);
  };
  P.removePlan=id=>{
    if(!P.canUse())throw Error('Choose a profile first.');
    const tomb=P.key('deleted:')+id,key=P.key('lesson:')+id;
    localStorage.setItem(tomb,String(Date.now()));localStorage.removeItem(key);
    if(localStorage.getItem(P.key('last-lesson'))===id)localStorage.removeItem(P.key('last-lesson'));
  };
  P.switchTo=id=>{
    if(!exists(id))throw Error('That profile is no longer available.');
    if(P.canUse())P.pauseCurrent();
    const s=state();s.last=id;write(s);try{sessionStorage.setItem(SESSION,id);}catch(ignored){}
    const url=P.requiresChoice?new URL(location.href):R.siteURL('lesson.html');url.searchParams.set('profile',id);location.assign(url.href);
  };
  P.familyBackup=()=>({type:'little-learning-lab-profiles',version:1,exportedAt:new Date().toISOString(),profiles:P.all().map(profile=>({name:profile.name,animal:profile.animal,plans:P.listPlans(profile.id).map(P.pause)}))});
  P.restoreFamily=raw=>{
    if(!raw||raw.type!=='little-learning-lab-profiles'||raw.version!==1||!Array.isArray(raw.profiles)||!raw.profiles.length||raw.profiles.length>100)throw Error('Invalid family backup.');
    const prepared=raw.profiles.map(p=>{
      if(!p||!Array.isArray(p.plans)||p.plans.length>1000)throw Error('Invalid profile backup.');
      return{profile:{id:R.id(),name:cleanName(p.name),animal:cleanAnimal(p.animal)},plans:p.plans.map(raw=>P.clonePlan(raw,false))};
    });
    const s=state(),written=[];
    try{
      for(const {profile,plans} of prepared){
        for(const plan of plans){const key=prefix(profile.id)+'lesson:'+plan.id;localStorage.setItem(key,JSON.stringify(plan));written.push(key);}
        if(plans.length){const key=prefix(profile.id)+'last-lesson';localStorage.setItem(key,plans[0].id);written.push(key);}
        s.profiles.push(profile);
      }
      write(s);
    }catch(error){written.forEach(k=>localStorage.removeItem(k));throw error;}
    return prepared.length;
  };
  P.boot=()=>{
    try{
      if(localStorage.getItem(META)===null){
        const profile={id:R.id(),name:'My learning',animal:'kitten'},written=[];
        try{
          for(const key of keys().filter(k=>k.startsWith('reading:lesson:'))){
            const target=prefix(profile.id)+'lesson:'+key.slice('reading:lesson:'.length),raw=localStorage.getItem(key);
            let value=raw;try{value=JSON.stringify(P.pause(JSON.parse(raw)));}catch(ignored){}
            localStorage.setItem(target,value);written.push(target);
          }
          const last=localStorage.getItem('reading:last-lesson');if(last){const target=prefix(profile.id)+'last-lesson';localStorage.setItem(target,last);written.push(target);}
          write({version:1,last:profile.id,profiles:[profile]});
        }catch(error){written.forEach(k=>localStorage.removeItem(k));throw error;}
      }
      const s=state(),requested=new URL(location.href).searchParams.get('profile');let tab=null;try{tab=sessionStorage.getItem(SESSION);}catch(ignored){}
      const valid=id=>s.profiles.some(p=>p.id===id);
      P.requiresChoice=!!requested&&!valid(requested);
      P.id=valid(requested)?requested:valid(tab)?tab:valid(s.last)?s.last:s.profiles[0].id;
      try{sessionStorage.setItem(SESSION,P.id);}catch(ignored){}
      P.ready=true;
    }catch(error){P.error='Profiles could not open: '+error.message+' No existing lessons were deleted. Free browser storage or restore a backup; do not clear site data.';}
  };
  P.boot();
  const oldSave=R.savePlan;
  R.savePlan=plan=>{
    try{
      if(!P.canUse()||localStorage.getItem(P.key('deleted:')+plan.id))return false;
      const result=oldSave(plan);if(result)global.dispatchEvent(new CustomEvent('profiles:plan-saved'));return result;
    }catch(error){return false;}
  };
  const owned=url=>url.origin===R.siteRoot.origin&&url.pathname.startsWith(R.siteRoot.pathname);
  function bindURL(value){const u=new URL(value,location.href);if(owned(u)&&P.canUse())u.searchParams.set('profile',P.id);return u.href;}
  for(const [obj,key] of [[R,'activityURL'],[R,'lessonURL'],[R.creator,'toolURL'],[R.creator,'lessonURL']]){
    if(typeof obj?.[key]==='function'){const original=obj[key];obj[key]=function(...args){return bindURL(original.apply(this,args));};}
  }
  const init=R.init;
  R.init=function(...args){const result=init.apply(this,args);P.mount();return result;};
  function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
  function button(text,handler,className='btn btn-outline-primary'){const b=el('button',text,className);b.type='button';b.addEventListener('click',()=>{try{handler();}catch(error){alert(error.message);}});return b;}
  function avatar(animal){
    const node=el('span',undefined,'profile-avatar'),index=animals.indexOf(animal);node.setAttribute('aria-hidden','true');node.dataset.animal=animal;
    node.style.backgroundImage='url("'+R.siteURL('assets/img/profiles/animals.png').href+'")';node.style.setProperty('--avatar-x',String(index%4));node.style.setProperty('--avatar-y',String(Math.floor(index/4)));return node;
  }
  function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  P.mount=()=>{
    if(document.getElementById('profile-bar'))return;
    const bar=el('aside',undefined,'profile-bar');bar.id='profile-bar';bar.setAttribute('aria-label','Learner profile');
    if(!P.ready){bar.append(el('p',P.error,'profile-error'));}
    else{
      const p=P.current();if(!p){bar.append(el('p','This profile was deleted. Reload and choose another profile.','profile-error'));}
      else{
        const choose=button('',()=>P.openPicker(),'profile-switch-button');choose.append(avatar(p.animal),el('span',p.name,'profile-nav-name'),el('span','Switch profile','profile-switch-caption'));choose.title='Switch profile: '+p.name;choose.setAttribute('aria-label','Switch profile. Current learner: '+p.name);bar.append(choose);
        if(P.requiresChoice)bar.append(el('p','The profile in this link is not on this browser. Choose a profile before opening the lesson.','profile-error'));
      }
    }
    /* PROFILE NAV PLACEMENT v1 */
    const appbar=document.getElementById('appbar');
    if(appbar){
      const slot=appbar.querySelector('[data-nav-slot="links"]')||appbar;
      const tools=slot.querySelector('.minimal-tools');
      if(tools)tools.after(bar);else slot.appendChild(bar);
      requestAnimationFrame(()=>{const height=appbar.getBoundingClientRect().height;if(height>0)document.documentElement.style.setProperty('--nav-height',height+'px');R.scheduleToolToolbar?.();});
    }else document.body.prepend(bar);
    if(P.requiresChoice)P.openPicker();
  };
  P.openPicker=()=>{
    if(!P.ready)return;
    if(document.getElementById('profile-picker'))return;
    const dialog=el('dialog',undefined,'profile-dialog');dialog.id='profile-picker';dialog.setAttribute('aria-labelledby','profile-picker-title');
    const heading=el('h2','Choose a profile');heading.id='profile-picker-title';dialog.append(heading,el('p','Each child has a separate lesson list, checkboxes, and timers. Profiles stay in this browser.'));
    const grid=el('div',undefined,'profile-grid');
    for(const p of P.all()){
      const card=el('div',undefined,'profile-card'),choose=button('',()=>{if(p.id===P.id&&!P.requiresChoice){dialog.close();return;}P.switchTo(p.id);},'profile-card-choice');choose.append(avatar(p.animal),el('span',p.name));if(p.id===P.id)choose.setAttribute('aria-current','true');
      card.append(choose,button('Edit',()=>{dialog.close();P.editProfile(p);}));
      if(p.id!==P.id)card.append(button('Delete',()=>{if(!confirm('Delete '+p.name+' and all of their lessons from this browser? Export a family backup first.'))return;P.removeProfile(p.id);dialog.close();P.openPicker();},'btn btn-outline-danger'));
      grid.append(card);
    }
    const controls=el('div',undefined,'profile-actions');controls.append(button('Add child',()=>{dialog.close();P.editProfile();},'btn btn-primary'),button('Back up all profiles',()=>download(P.familyBackup(),'learning-lab-family-backup.json')));
    const input=el('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
    input.addEventListener('change',async()=>{if(!input.files[0])return;try{const raw=JSON.parse(await input.files[0].text());if(!confirm('Restore this family backup as additional profiles? Existing profiles will be kept.'))return;const count=P.restoreFamily(raw);dialog.close();alert(count+' profiles restored as new copies.');P.openPicker();}catch(error){alert('Restore failed: '+error.message);}finally{input.value='';}});
    controls.append(button('Restore family backup',()=>input.click()),button('Close',()=>dialog.close()));dialog.append(grid,controls,input);dialog.addEventListener('close',()=>dialog.remove());document.body.appendChild(dialog);dialog.showModal();
  };
  P.editProfile=profile=>{
    const dialog=el('dialog',undefined,'profile-dialog');dialog.setAttribute('aria-labelledby','profile-edit-title');const title=el('h2',profile?'Edit profile':'Add a child');title.id='profile-edit-title';const form=el('form'),label=el('label','Name'),name=el('input',undefined,'form-control');name.id='profile-name';label.htmlFor=name.id;name.required=true;name.maxLength=60;name.value=profile?.name||'';
    let selected=profile?.animal||'kitten';const grid=el('div',undefined,'profile-grid profile-animal-grid');grid.setAttribute('role','group');grid.setAttribute('aria-label','Choose an animal');const options=[];
    for(const animal of animals){const b=button('',()=>{selected=animal;options.forEach(o=>o.setAttribute('aria-pressed',String(o.dataset.animal===selected)));},'profile-animal-choice');b.dataset.animal=animal;b.setAttribute('aria-label',animal);b.setAttribute('aria-pressed',String(animal===selected));b.append(avatar(animal),el('span',animal));options.push(b);grid.append(b);}
    const error=el('p','', 'profile-error');error.setAttribute('role','alert');const submit=el('button',profile?'Save profile':'Create profile','btn btn-primary');submit.type='submit';const actions=el('div',undefined,'profile-actions');actions.append(submit,button('Cancel',()=>dialog.close()));
    form.append(label,name,el('h3','Choose an animal'),grid,error,actions);form.addEventListener('submit',event=>{event.preventDefault();if(!form.reportValidity())return;try{if(profile){P.update(profile.id,name.value,selected);dialog.close();const bar=document.getElementById('profile-bar');if(bar)bar.remove();P.mount();P.refreshLibrary?.();}else{const created=P.create(name.value,selected);P.switchTo(created.id);}}catch(problem){error.textContent=problem.message;}});
    dialog.append(title,form);dialog.addEventListener('close',()=>dialog.remove());document.body.appendChild(dialog);dialog.showModal();name.focus();
  };
  P.attachLesson=api=>{
    if(!P.ready)return;
    const section=el('section',undefined,'profile-lessons');section.setAttribute('aria-labelledby','profile-lessons-title');const title=el('h2');title.id='profile-lessons-title';const label=el('label','Saved lessons');label.htmlFor='profile-lesson-select';const select=el('select',undefined,'form-select');select.id='profile-lesson-select';
    select.addEventListener('change',()=>{const next=R.readPlan(select.value);if(next)api.openPlan(next);});
    const actions=el('div',undefined,'profile-actions');
    actions.append(button('New lesson',()=>api.newPlan(),'btn btn-primary'),button('Make a fresh copy',()=>{const original=api.getPlan();if(!original)return;const p=P.clonePlan(R.freshPlan(original),true);p.title=(p.title+' (copy)').slice(0,200);api.openPlan(p);}),button('Delete lesson',()=>{const p=api.getPlan();if(!p||!confirm('Delete “'+p.title+'” from '+P.current().name+'? Export a backup first.'))return;P.removePlan(p.id);api.openPlan(P.listPlans(P.id)[0]||P.blank());},'btn btn-outline-danger'));
    const destination=el('select',undefined,'form-select');destination.setAttribute('aria-label','Copy lesson to another child');const copyButton=button('Copy to child',()=>{const p=api.getPlan();if(!p||!destination.value)return;const target=P.all().find(p=>p.id===destination.value);if(!target)throw Error('Choose another child.');if(!confirm('Copy “'+p.title+'” to '+target.name+' with clear checkboxes and zero timers? The original will stay unchanged.'))return;P.putPlan(target.id,P.clonePlan(R.freshPlan(p),true));alert('Lesson copied to '+target.name+'.');});const copyControls=el('div',undefined,'profile-copy-controls');copyControls.append(destination,copyButton);
    section.append(title,label,select,actions,copyControls);const panel=document.getElementById('lesson-panel');panel.before(section);
    P.refreshLibrary=()=>{
      if(!P.canUse()){section.querySelectorAll('button,select').forEach(n=>n.disabled=true);return;}
      const current=api.getPlan();title.textContent=P.current().name+'’s lesson plans';select.replaceChildren();for(const p of P.listPlans(P.id)){const o=el('option',p.title);o.value=p.id;select.append(o);}if(current)select.value=current.id;
      section.querySelectorAll('button,select').forEach(n=>n.disabled=!current);
      destination.replaceChildren();const other=P.all().filter(p=>p.id!==P.id);for(const p of other){const o=el('option',p.name);o.value=p.id;destination.append(o);}copyControls.hidden=!other.length;
    };
    global.addEventListener('profiles:plan-saved',P.refreshLibrary);P.refreshLibrary();
  };
  global.addEventListener('storage',event=>{
    if(!P.ready)return;
    if(event.key===META){
      if(!P.current()){const warning=el('div','This profile was deleted in another tab. Saving is disabled. Reload and choose another profile.','profile-error');document.body.prepend(warning);}
      else{const bar=document.getElementById('profile-bar');if(bar)bar.remove();P.mount();P.refreshLibrary?.();}
    }else if(event.key?.startsWith(prefix(P.id)))P.refreshLibrary?.();
  });
})(window);

/* LESSON NAV CONSOLIDATION v2 */
(function(global){
  'use strict';const R=global.ReadingApp,P=R.profiles;if(!P)return;
  const $=id=>document.getElementById(id);
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const paths={link:'M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7 7l2-2',paper:'M14 2H5v20h14V7l-5-5ZM14 2v5h5M8 12h8M8 16h8'};
  const icon=key=>paths[key]?'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="'+paths[key]+'" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>':R.icon(key);
  function label(button,text,key,onlyIcon=false){button.title=text;button.setAttribute('aria-label',text);button.innerHTML=icon(key);if(!onlyIcon)button.append(node('span',text,'lesson-control-label'));}
  function action(text,handler,key){const b=node('button');b.type='button';b.className='icon-button';label(b,text,key||'lesson');b.addEventListener('click',()=>{try{handler();}catch(error){alert(error.message);}});return b;}
  const oldMount=P.mount;
  P.mount=()=>{
    oldMount();const bar=$('appbar'),profile=$('profile-bar');if(!bar||!profile)return;
    let right=$('nav-tools-profile');if(!right){right=node('div',undefined,'nav-tools-profile');right.id='nav-tools-profile';bar.append(right);}
    const tools=bar.querySelector('.minimal-tools');if(tools&&tools.parentElement!==right)right.append(tools);if(profile.parentElement!==right)right.append(profile);
    requestAnimationFrame(()=>{const height=bar.getBoundingClientRect().height;if(height>0)document.documentElement.style.setProperty('--nav-height',height+'px');R.scheduleToolToolbar?.();});
  };
  P.attachLesson=api=>{
    if(!P.ready)return;
    document.body.classList.add('lesson-ui-v2');document.querySelectorAll('.profile-lessons').forEach(n=>n.remove());
    const panel=$('lesson-panel'),footer=$('lesson-editor-nav'),slot=footer?.querySelector('[data-nav-slot="lesson-editor"]');if(!panel||!footer||!slot)return;
    let heading=$('profile-page-title');if(!heading){heading=node('h1');heading.id='profile-page-title';panel.prepend(heading);}
    const quick=node('div',undefined,'lesson-quick-actions');quick.setAttribute('role','group');quick.setAttribute('aria-label','Edit and share lesson');
    for(const id of ['lesson-edit','lesson-copy','lesson-share']){const b=$(id);if(b){if(id==='lesson-copy')label(b,'Copy Link','link',true);if(id==='lesson-share')label(b,'Share','share',true);quick.append(b);}}
    slot.prepend(quick);
    const menus=[];
    function dropup(id,text){
      const details=node('details',undefined,'lesson-dropup');details.id=id;const summary=node('summary',text);summary.setAttribute('aria-controls',id+'-panel');
      const box=node('div',undefined,'lesson-menu-panel');box.id=id+'-panel';details.append(summary,box);slot.append(details);menus.push(details);
      details.addEventListener('toggle',()=>{summary.setAttribute('aria-expanded',String(details.open));if(details.open){menus.filter(m=>m!==details).forEach(m=>m.open=false);box.style.left='0px';const rect=box.getBoundingClientRect();const shift=Math.min(0,global.innerWidth-12-rect.right)+Math.max(0,12-rect.left);box.style.left=shift+'px';}});
      box.addEventListener('click',event=>{if(event.target.closest('button'))details.open=false;});
      details.addEventListener('keydown',event=>{
        if(event.key==='Escape'){details.open=false;summary.focus();event.preventDefault();return;}
        if(!details.open||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
        const items=Array.from(box.querySelectorAll('button:not(:disabled),select:not(:disabled)'));if(!items.length)return;
        const i=items.indexOf(document.activeElement);let next=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowDown'?(i+1)%items.length:(i<=0?items.length-1:i-1);items[next].focus();event.preventDefault();
      });
      return{details,box};
    }
    const manage=dropup('lesson-manage-menu','Manage Lessons');
    for(const [id,text,key] of [['lesson-new','New Lesson','new'],['lesson-export','Save Lesson','save'],['lesson-import','Import Lesson','up']]){const b=$(id);if(b){label(b,text,key);if(id==='lesson-export')b.title='Save Lesson — download a JSON backup; browser changes also autosave';manage.box.append(b);}}
    const remove=action('Delete Lesson',()=>{const p=api.getPlan();if(!p)return;if(!confirm('Delete “'+p.title+'” from '+P.current().name+'? Save a backup first.'))return;P.removePlan(p.id);api.openPlan(P.listPlans(P.id)[0]||P.blank());},'reset');remove.classList.add('lesson-delete-action');manage.box.append(remove);
    const more=node('div','More options','lesson-menu-subheading');manage.box.append(more);
    manage.box.append(action('Make a fresh copy',()=>{const p=api.getPlan();if(!p)return;const clone=P.clonePlan(R.freshPlan(p),true);clone.title=(p.title+' (copy)').slice(0,200);api.openPlan(clone);},'copy'));
    const copyTo=action('Copy to another child',()=>{
      const current=api.getPlan(),others=P.all().filter(p=>p.id!==P.id);if(!current||!others.length)return;
      const dialog=node('dialog',undefined,'profile-dialog');const h=node('h2','Copy lesson to another child');h.id='copy-child-title';dialog.setAttribute('aria-labelledby',h.id);
      const select=node('select',undefined,'form-select');select.setAttribute('aria-label','Destination child');for(const p of others){const o=node('option',p.name);o.value=p.id;select.append(o);}
      const note=node('p','The copy starts with clear checkboxes and zero timers. The original stays unchanged.');
      const controls=node('div',undefined,'profile-actions');controls.append(action('Copy lesson',()=>{P.putPlan(select.value,P.clonePlan(R.freshPlan(current),true));dialog.close();R.notice('Lesson copied.');},'copy'),action('Cancel',()=>dialog.close(),'left'));
      dialog.append(h,note,select,controls);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
    },'copy');manage.box.append(copyTo);
    const saved=dropup('lesson-saved-menu','Saved Lessons');const savedLabel=node('label','Choose a saved lesson');savedLabel.htmlFor='profile-lesson-select';const select=node('select',undefined,'form-select');select.id='profile-lesson-select';
    select.addEventListener('change',()=>{const p=R.readPlan(select.value);if(p){saved.details.open=false;api.openPlan(p);}});const status=node('p',undefined,'lesson-saved-count');saved.box.append(savedLabel,select,status);
    const report=$('lesson-weekly-pdf');if(report){label(report,'Weekly Report','paper');slot.append(report);}
    document.addEventListener('pointerdown',event=>{menus.forEach(m=>{if(m.open&&!m.contains(event.target))m.open=false;});});
    P.refreshLibrary=()=>{
      const profile=P.current(),current=api.getPlan(),available=P.canUse();heading.textContent=profile?profile.name+"'s Lesson Plan":'Lesson Plan';
      select.replaceChildren();if(available){const plans=P.listPlans(P.id);for(const p of plans){const o=node('option',p.title);o.value=p.id;select.append(o);}if(current)select.value=current.id;status.textContent=plans.length+' saved '+(plans.length===1?'lesson':'lessons')+' for '+profile.name;}
      manage.box.querySelectorAll('button,select').forEach(b=>b.disabled=!available||!current);quick.querySelectorAll('button').forEach(b=>b.disabled=!available||!current);select.disabled=!available||!current;copyTo.hidden=!available||P.all().filter(p=>p.id!==P.id).length===0;
    };
    global.addEventListener('profiles:plan-saved',P.refreshLibrary);P.refreshLibrary();
    function measure(){const height=footer.getBoundingClientRect().height;if(height>0)document.documentElement.style.setProperty('--lesson-v2-footer-height',height+'px');}
    if(global.ResizeObserver)new ResizeObserver(measure).observe(footer);global.addEventListener('resize',measure);requestAnimationFrame(measure);
  };
})(window);
