/* One reading controller for slider, pyramid and word-part modes. */
(function(global){
  'use strict';
  const R=global.ReadingApp;
  function unitsFor(text,options){
    const letters=R.chars(text),lower=letters.map(c=>c.toLocaleLowerCase()),clean=R.sightKey(text);
    if(options.sight.includes(clean))return[{start:0,end:letters.length,emphasis:true}];
    const combos=options.groups.map(R.chars).filter(a=>a.length).sort((a,b)=>b.length-a.length),units=[];
    for(let i=0;i<letters.length;){const group=combos.find(g=>g.every((c,j)=>lower[i+j]===c));const n=group?group.length:1;units.push({start:i,end:i+n,emphasis:!!group});i+=n;}return units;
  }
  function mapProgress(units,raw){raw=Math.max(0,Math.min(1,raw));if(!units.length||raw===0||raw===1)return raw;const u=units.find(u=>raw<=u.inputEnd)||units.at(-1),f=(raw-u.inputStart)/(u.inputEnd-u.inputStart);return u.emphasis&&f>=.5?u.endFraction:u.startFraction+f*(u.endFraction-u.startFraction);}
  function inverseProgress(units,value){value=Math.max(0,Math.min(1,value));if(!units.length||value===0||value===1)return value;const u=units.find(u=>value<=u.endFraction)||units.at(-1);return u.inputStart+(value-u.startFraction)/(u.endFraction-u.startFraction)*(u.inputEnd-u.inputStart);}
  function partMatch(text,part){const w=R.chars(text),p=R.chars(part);for(let start=0;start<=w.length-p.length;start++)if(p.every((c,j)=>c.toLocaleLowerCase()===w[start+j].toLocaleLowerCase()))return{start,end:start+p.length};return null;}
  R.readingMath={unitsFor,mapProgress,inverseProgress,partMatch};
  class Word {
    constructor(text,part=''){
      this.text=text;this.value=0;this.complete=false;this.part=part?partMatch(text,part):null;
      this.el=document.createElement('div');this.el.className='reading-word';this.letters=document.createElement('div');this.letters.className='reading-letters';this.letters.setAttribute('aria-hidden','true');
      this.spans=R.chars(text).map((c,i)=>{const span=document.createElement('span');span.className='reading-letter';span.textContent=c;if(this.part&&i>=this.part.start&&i<this.part.end)span.classList.add('part-letter');this.letters.appendChild(span);return span;});
      this.slider=document.createElement('div');this.slider.className='reading-slider';this.track=document.createElement('div');this.track.className='reading-track';this.slider.appendChild(this.track);this.el.append(this.letters,this.slider);this.units=[];this.thresholds=[];
    }
    measure(options){
      const track=this.slider.getBoundingClientRect(),rects=this.spans.map(el=>el.getBoundingClientRect());if(!track.width)return;
      this.thresholds=rects.map(r=>(r.left+r.width/2-track.left)/track.width);this.units=unitsFor(this.text,options);
      this.units.forEach(u=>{const first=rects[u.start],last=rects[u.end-1];u.startFraction=u.start===0?0:((rects[u.start-1].right+first.left)/2-track.left)/track.width;u.endFraction=u.end===rects.length?1:((last.right+rects[u.end].left)/2-track.left)/track.width;if(u.emphasis){const threshold=((first.left+last.right)/2-track.left)/track.width;for(let i=u.start;i<u.end;i++)this.thresholds[i]=threshold;}});
      const total=this.units.reduce((s,u)=>s+(u.endFraction-u.startFraction)*(u.emphasis?.4:1),0)||1;let at=0;
      this.units.forEach(u=>{u.inputStart=at;at+=(u.endFraction-u.startFraction)*(u.emphasis?.4:1)/total;u.inputEnd=at;});if(this.units.length)this.units.at(-1).inputEnd=1;
      this.track.replaceChildren();this.units.forEach(u=>{u.el=document.createElement('span');u.el.className='track-segment'+(u.emphasis?' is-emphasis':'');u.el.style.setProperty('--segment-left',u.startFraction*100+'%');u.el.style.setProperty('--segment-width',(u.endFraction-u.startFraction)*100+'%');u.fill=document.createElement('span');u.fill.className='track-fill';u.el.appendChild(u.fill);this.track.appendChild(u.el);});this.paint();
    }
    paint(){let count=0;this.spans.forEach((span,i)=>{const read=this.value>0&&this.value>=this.thresholds[i];span.classList.toggle('is-read',read);if(read)count++;});this.complete=count===this.spans.length;this.units.forEach(u=>{const progress=Math.max(0,Math.min(1,(this.value-u.startFraction)/(u.endFraction-u.startFraction)));u.el?.style.setProperty('--segment-progress',progress*100+'%');});}
  }
  class Row {
    constructor(words,owner,index){this.words=words;this.owner=owner;this.index=index;this.pointer=null;this.rawX=0;this.el=document.createElement('div');this.el.className='reading-row';this.el.setAttribute('role','group');this.el.setAttribute('aria-label',`Reading line ${index+1}`);words.forEach(w=>this.el.appendChild(w.el));this.handle=document.createElement('div');this.handle.className='reading-handle';this.handle.tabIndex=-1;this.handle.setAttribute('role','slider');this.handle.setAttribute('aria-label',`Read ${words.map(w=>w.text).join(' ')}`);this.handle.setAttribute('aria-valuemin','0');this.handle.setAttribute('aria-valuemax','100');this.el.appendChild(this.handle);this.bind();}
    get complete(){return this.words.every(w=>w.complete);}
    measure(){this.words.forEach(w=>w.measure(this.owner.options));this.restore();}
    bounds(){const origin=this.el.getBoundingClientRect().left;const segments=this.words.map(word=>{const rect=word.slider.getBoundingClientRect();return{word,left:rect.left-origin,width:rect.width};});return{segments,start:segments[0].left,end:segments.at(-1).left+segments.at(-1).width};}
    position(x,b){this.el.style.setProperty('--dot-x',x+'px');this.handle.setAttribute('aria-valuenow',Math.round(100*(x-b.start)/(b.end-b.start)));this.handle.setAttribute('aria-valuetext',`${this.words.filter(w=>w.complete).length} of ${this.words.length} words passed`);}
    apply(x){const b=this.bounds();x=Math.max(b.start,Math.min(b.end,x));let display=x;b.segments.forEach(s=>{const raw=Math.max(0,Math.min(1,(x-s.left)/s.width));s.word.value=mapProgress(s.word.units,raw);s.word.paint();if(x>=s.left&&x<=s.left+s.width)display=s.left+s.word.value*s.width;});this.rawX=x;this.position(display,b);this.owner.progress(false);}
    restore(){const b=this.bounds(),next=b.segments.find(s=>!s.word.complete);this.rawX=next?next.left+inverseProgress(next.word.units,next.word.value)*next.width:b.end;this.position(next?next.left+next.word.value*next.width:b.end,b);}
    cancel(){const id=this.pointer;this.pointer=null;this.el.classList.remove('is-dragging');if(id!==null&&this.handle.hasPointerCapture(id))this.handle.releasePointerCapture(id);}
    bind(){this.handle.addEventListener('pointerdown',p=>{if(!p.isPrimary||p.button!==0||this.pointer!==null||!this.owner.allowed(this.index))return;p.preventDefault();this.owner.cancelAdvance();this.measure();this.offset=p.clientX-this.el.getBoundingClientRect().left-this.rawX;this.pointer=p.pointerId;this.el.classList.add('is-dragging');this.handle.focus({preventScroll:true});this.handle.setPointerCapture(p.pointerId);});this.handle.addEventListener('pointermove',p=>{if(p.pointerId===this.pointer)this.apply(p.clientX-this.el.getBoundingClientRect().left-this.offset);});['pointerup','pointercancel'].forEach(type=>this.handle.addEventListener(type,p=>{if(p.pointerId!==this.pointer)return;if(type==='pointerup')this.apply(p.clientX-this.el.getBoundingClientRect().left-this.offset);this.cancel();this.owner.progress(type==='pointerup');}));this.handle.addEventListener('lostpointercapture',()=>{if(this.pointer===null)return;this.pointer=null;this.el.classList.remove('is-dragging');this.owner.progress(false);});this.handle.addEventListener('keydown',event=>{if(!this.owner.allowed(this.index))return;this.measure();const b=this.bounds();let next;switch(event.key){case'ArrowRight':case'ArrowUp':next=this.rawX+12;break;case'ArrowLeft':case'ArrowDown':next=this.rawX-12;break;case'Home':next=b.start;break;case'End':next=b.end;break;default:return;}event.preventDefault();this.apply(next);this.owner.progress(true);});}
  }
  class Reader {
    constructor(mode){this.mode=mode;this.examples=[];this.exampleIndex=0;this.rowIndex=0;this.rows=[];this.busy=false;this.intro=false;this.active=false;this.timer=null;this.transitionTimer=null;this.epoch=0;this.viewport=R.$('#reading-viewport');this.stage=R.$('#reading-stage');this.status=R.$('#reading-status');this.setup=R.$('#setup-panel');this.view=R.$('#reader-panel');this.options={groups:[],sight:[]};this.bind();}
    cancelAdvance(){clearTimeout(this.timer);this.timer=null;}
    stop(){this.epoch++;this.cancelAdvance();clearTimeout(this.transitionTimer);this.rows.forEach(row=>row.cancel());this.busy=false;R.stopCelebration();}
    allowed(index){return this.active&&!this.busy&&!this.intro&&index===this.rowIndex;}
    bind(){
      R.creator.register(()=>R.creator.readingContent(this.mode));
      this.edit=R.action('reading-edit','edit','Edit activity',()=>{this.stop();this.active=false;this.setup.hidden=false;this.view.hidden=true;document.body.classList.remove('is-reading');this.updateNav();R.$('#reading-text').focus();});
      this.copy=R.action('reading-copy','copy','Copy reading link',()=>R.copyLink(this.shareURL()));
      this.previous=R.action('reading-previous',this.mode==='slider'?'up':'left','Previous reading part',()=>this.go(this.rowIndex-1,true),'reading');
      this.next=R.action('reading-next',this.mode==='slider'?'down':'right','Next reading part',()=>this.go(this.rowIndex+1,true),'reading');
      this.previousExample=R.action('example-previous','left','Previous example',()=>this.switchExample(this.exampleIndex-1),'reading');this.nextExample=R.action('example-next','right','Next example',()=>this.switchExample(this.exampleIndex+1),'reading');
      this.counter=document.createElement('span');this.counter.className='nav-count';R.$('[data-nav-slot="reading"]').appendChild(this.counter);
      R.$('#reading-form').addEventListener('submit',event=>{event.preventDefault();this.start().catch(error=>{R.$('#reading-error').textContent=error.message;});});
      R.$('#reading-size').addEventListener('input',()=>R.$('#reading-size-label').textContent=R.$('#reading-size').value+'px');
      this.viewport.addEventListener('scroll',()=>{if(this.mode!=='slider'||!this.active)return;this.cancelAdvance();clearTimeout(this.scrollTimer);this.scrollTimer=setTimeout(()=>{const index=Math.max(0,Math.min(this.rows.length-1,Math.round(this.viewport.scrollTop/this.viewport.clientHeight)));this.rowIndex=index;this.examples[this.exampleIndex].index=index;this.busy=false;this.updateNav();this.progress(false);if(this.pendingFocus){this.pendingFocus=false;this.focus();}},180);});
      let resize;const layout=()=>{if(!this.active)return;clearTimeout(resize);resize=setTimeout(()=>{const retainFocus=this.stage.contains(document.activeElement),resumeAdvance=this.timer!==null&&!this.busy&&this.rows[this.rowIndex]?.complete;this.build(true);if(resumeAdvance)this.progress(true);if(retainFocus)this.focus();},100);};global.addEventListener('resize',layout);global.addEventListener('reading:layout',layout);
      document.addEventListener('keydown',event=>{if(!this.active)return;if(event.key==='Escape')this.edit.click();else if(event.key==='PageDown'){event.preventDefault();this.go(this.rowIndex+1,true);}else if(event.key==='PageUp'){event.preventDefault();this.go(this.rowIndex-1,true);}});
      this.updateNav();const params=new URLSearchParams(location.search);if(params.has('groups'))R.$('#reading-groups').value=params.get('groups');if(params.has('sight'))R.$('#reading-sight').value=params.get('sight');R.$('#reading-dolch').checked=params.get('dolch')!=='0';if(this.mode==='wordparts'&&params.has('part'))R.$('#reading-part').value=params.get('part').replace(/^-+|-+$/g,'');if(params.has('csv')||params.has('text')){R.$('#reading-format').value=params.has('csv')?'csv':'text';R.$('#reading-text').value=params.get(params.has('csv')?'csv':'text');if(params.get('autostart')!=='0')R.$('#reading-form').requestSubmit();}
    }
    async start(){
      const source=R.$('#reading-text').value.trim(),format=R.$('#reading-format').value,part=this.mode==='wordparts'?R.$('#reading-part').value.trim().normalize('NFC').replace(/^-+|-+$/g,''):'';
      const texts=format==='csv'?R.parseCSV(source):source?[source]:[];if(!texts.length)throw Error('Enter some reading content.');if(this.mode==='wordparts'&&!part)throw Error('Enter a word part.');
      const options={groups:R.entries(R.$('#reading-groups').value),sight:R.wholeSightWords(R.$('#reading-sight').value,R.$('#reading-dolch').checked)};if(part)options.groups=[...new Set([...options.groups,part.toLocaleLowerCase()])];
      if(part){const invalid=texts.flatMap(R.words).filter(w=>!partMatch(w,part));if(invalid.length)throw Error(`These words do not contain “${part}”: ${invalid.join(', ')}.`);}
      const submit=R.$('#reading-start');submit.disabled=true;try{if(document.fonts)await document.fonts.load('64px "KG Primary Penmanship Alt"');}catch(error){}finally{submit.disabled=false;}
      this.stop();this.options=options;this.saved={source,format,part,groups:R.$('#reading-groups').value.trim(),sight:R.$('#reading-sight').value.trim(),dolch:R.$('#reading-dolch').checked};
      this.examples=texts.map(text=>{const parts=this.mode==='wordparts'?R.words(text):this.mode==='pyramid'?text.split(/\r\n|\r|\n/):text.split(/(?<=[.!?…])\s+|(?<=[.!?…]["”’'])\s+|\n+/u);return{lines:parts.map(s=>s.trim()).filter(Boolean).map(line=>line.split(/\s+/u).map(w=>new Word(w,part))),celebrated:false,index:0};});
      this.exampleIndex=0;this.rowIndex=0;this.intro=this.mode==='wordparts';this.active=true;this.setup.hidden=true;this.view.hidden=false;document.body.classList.add('is-reading');R.$('#reading-error').textContent='';this.build(false);this.focus();
    }
    shareURL(){const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set(this.saved.format==='csv'?'csv':'text',this.saved.source);if(this.saved.part)url.searchParams.set('part',this.saved.part);if(this.saved.groups)url.searchParams.set('groups',this.saved.groups);if(this.saved.sight)url.searchParams.set('sight',this.saved.sight);url.searchParams.set('dolch',this.saved.dolch?'1':'0');return url.href;}
    build(resizing){
      if(!this.active)return;const anchor=this.rows[this.rowIndex]?.words[0],wasIntro=this.intro;this.stop();this.stage.replaceChildren();this.viewport.scrollTop=0;this.rows=[];this.view.dataset.mode=this.mode;
      const lines=this.examples[this.exampleIndex].lines,requested=Number(R.$('#reading-size').value);this.stage.style.setProperty('--reading-size',requested+'px');this.stage.style.setProperty('--word-gap','28px');this.stage.style.setProperty('--line-gap','20px');
      if(this.mode==='slider'){
        const available=Math.max(46,this.viewport.clientWidth-112),gap=28,measureBox=document.createElement('div');measureBox.className='measurement-row';this.stage.appendChild(measureBox);lines.flat().forEach(w=>{w.letters.style.removeProperty('--word-size');measureBox.appendChild(w.el);let width=w.el.getBoundingClientRect().width;if(width>available){w.letters.style.setProperty('--word-size',requested*available/width+'px');width=w.el.getBoundingClientRect().width;}w.width=width;});const groups=[];
        lines.forEach(line=>{let group=[],width=0;line.forEach(w=>{if(group.length&&width+gap+w.width>available){groups.push(group);group=[];width=0;}width+=w.width+(group.length?gap:0);group.push(w);});if(group.length)groups.push(group);});measureBox.remove();
        groups.forEach((words,i)=>{const page=document.createElement('div');page.className='reading-page';const row=new Row(words,this,i);this.rows.push(row);page.appendChild(row.el);this.stage.appendChild(page);});this.rowIndex=resizing?Math.max(0,this.rows.findIndex(row=>row.words.includes(anchor))):Math.min(this.examples[this.exampleIndex].index,this.rows.length-1);
      }else if(this.mode==='pyramid'){
        /* PYRAMID FIXED SIZE PAGINATION v1 */
        this.pyramidPages=[];
        this.stage.style.setProperty('--pyramid-viewport-height',this.viewport.clientHeight+'px');
        lines.forEach((words,i)=>{
          words.forEach(w=>w.letters.style.removeProperty('--word-size'));
          const row=new Row(words,this,i);this.rows.push(row);this.stage.appendChild(row.el);
        });
        this.rowIndex=Math.min(this.rowIndex,this.rows.length-1);
        const availableHeight=Math.max(1,this.viewport.clientHeight-48),gap=20;
        let page=null,used=0,widest=0;
        this.rows.forEach(row=>{
          const rect=row.el.getBoundingClientRect(),height=rect.height;
          widest=Math.max(widest,rect.width);
          if(!page||(used>0&&used+gap+height>availableHeight)){
            page=document.createElement('section');page.className='pyramid-page';
            page.setAttribute('aria-label',`Pyramid page ${this.pyramidPages.length+1}`);
            this.pyramidPages.push(page);this.stage.appendChild(page);used=0;
          }
          row.pyramidPage=this.pyramidPages.length-1;
          page.appendChild(row.el);used+=(used?gap:0)+height;
        });
        this.stage.style.width=Math.max(this.viewport.clientWidth,widest+88)+'px';
      }else{
        lines.forEach((words,i)=>{words.forEach(w=>w.letters.style.removeProperty('--word-size'));const row=new Row(words,this,i);this.rows.push(row);this.stage.appendChild(row.el);});this.rowIndex=Math.min(this.rowIndex,this.rows.length-1);
        const available=Math.max(46,this.viewport.clientWidth-88),height=this.viewport.clientHeight-40;let size=requested;
        for(let n=0;n<12;n++){this.stage.style.setProperty('--reading-size',size+'px');this.stage.style.setProperty('--word-gap',Math.max(4,28*size/requested)+'px');this.stage.style.setProperty('--line-gap',Math.max(8,20*size/requested)+'px');const width=Math.max(...this.rows.map(row=>row.el.getBoundingClientRect().width));const total=this.rows.reduce((s,row)=>s+row.el.getBoundingClientRect().height,0)+(this.rows.length-1)*Math.max(8,20*size/requested);const ratio=Math.min(1,available/width);if(ratio>=.995||size<=18)break;size=Math.max(18,size*ratio);}
        this.rows.forEach(row=>{const width=row.el.getBoundingClientRect().width;if(width>available)row.words.forEach(w=>w.letters.style.setProperty('--word-size',size*available/width+'px'));});
      }
      if(this.mode==='wordparts'){this.rows.forEach(row=>{const word=row.words[0],rect=row.el.getBoundingClientRect(),first=word.spans[word.part.start].getBoundingClientRect(),last=word.spans[word.part.end-1].getBoundingClientRect();let offset=rect.width/2-((first.left+last.right)/2-rect.left);const limit=Math.max(0,(this.viewport.clientWidth-rect.width)/2-32);offset=Math.max(-limit,Math.min(limit,offset));row.el.style.setProperty('--anchor-offset',offset+'px');});this.intro=wasIntro;if(this.intro)this.makeIntro();}
      this.rows.forEach(row=>row.measure());this.updateNav();this.progress(false);if(this.mode==='pyramid')this.revealPyramidPage();if(this.mode==='slider')this.viewport.scrollTo({top:this.rowIndex*this.viewport.clientHeight,behavior:'instant'});
    }
    revealPyramidPage(smooth=false){
      if(this.mode!=='pyramid'||!this.rows.length)return;
      const row=this.rows[this.rowIndex],page=this.pyramidPages?.[row.pyramidPage];
      if(!page)return;
      const top=page.offsetTop;
      if(Math.abs(this.viewport.scrollTop-top)>1)this.viewport.scrollTo({
        top,left:0,behavior:smooth&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'instant'
      });
    }
    makeIntro(){const section=document.createElement('section');section.className='part-intro';const title=document.createElement('h2');title.textContent='Our word part';const part=document.createElement('div');part.className='intro-part';part.textContent=this.saved.part;const note=document.createElement('p');note.textContent=`Look for ${this.saved.part} in each word.`;const button=document.createElement('button');button.className='btn btn-primary btn-lg';button.type='button';button.textContent='Let’s read →';button.addEventListener('click',()=>{section.remove();this.intro=false;this.updateNav();this.progress(false);this.focus();});section.append(title,part,note,button);this.stage.appendChild(section);}
    updateNav(){const active=this.active,examples=this.saved?.format==='csv';R.setAction(this.edit,{visible:active});R.setAction(this.copy,{visible:active});R.setAction(this.previous,{visible:active&&this.mode!=='pyramid',disabled:this.busy||this.intro||this.rowIndex===0});R.setAction(this.next,{visible:active&&this.mode!=='pyramid',disabled:this.busy||this.intro||this.rowIndex===this.rows.length-1});R.setAction(this.previousExample,{visible:active&&examples,disabled:this.busy||this.exampleIndex===0});R.setAction(this.nextExample,{visible:active&&examples,disabled:this.busy||this.exampleIndex===this.examples.length-1});this.counter.hidden=!active||(!examples&&this.mode!=='wordparts');this.counter.textContent=examples?`${this.exampleIndex+1} of ${this.examples.length}`:this.intro?'':`${this.rowIndex+1} of ${this.rows.length}`;
      this.rows.forEach((row,i)=>{row.handle.tabIndex=!this.intro&&!this.busy&&i===this.rowIndex?0:-1;row.el.classList.toggle('is-current',i===this.rowIndex&&!this.intro);if(this.mode==='pyramid'){row.el.classList.toggle('is-completed',row.complete);row.el.classList.toggle('is-pending',!row.complete&&i!==this.rowIndex);}});
      const dots=R.$('#example-dots');dots.hidden=!active||!examples;dots.replaceChildren();if(examples)this.examples.forEach((example,i)=>{const button=document.createElement('button');button.type='button';button.className='example-dot';button.classList.toggle('is-current',i===this.exampleIndex);button.classList.toggle('is-completed',example.lines.flat().every(w=>w.complete));button.setAttribute('aria-label',`Example ${i+1}`);if(i===this.exampleIndex)button.setAttribute('aria-current','true');button.addEventListener('click',()=>this.switchExample(i));dots.appendChild(button);});
    }
    progress(released){if(!this.active)return;const dragging=this.rows.some(row=>row.pointer!==null),example=this.examples[this.exampleIndex],all=example.lines.flat().every(w=>w.complete);if(released&&!dragging&&this.rows[this.rowIndex]?.complete){this.rows[this.rowIndex].words.forEach(w=>{w.value=1;w.paint();});this.rows[this.rowIndex].restore();}
      if(this.mode==='pyramid'&&!dragging){const next=this.rows.findIndex(row=>!row.complete);this.rowIndex=next<0?this.rows.length-1:next;this.updateNav();if(released)this.revealPyramidPage(true);}
      else if(this.mode==='wordparts')this.updateNav();
      this.status.textContent=this.intro?'Say the word part, then start reading.':all?'Great reading! This example is complete.':this.mode==='pyramid'?`${this.rows.filter(row=>row.complete).length} of ${this.rows.length} lines complete`:'Drag the dot as you read.';
      if(released&&all&&!dragging&&!example.celebrated){example.celebrated=true;R.celebrate();}
      if(released&&!dragging&&!this.busy&&!this.intro&&this.mode!=='pyramid'&&this.rows[this.rowIndex]?.complete&&this.rowIndex<this.rows.length-1){this.cancelAdvance();const index=this.rowIndex,epoch=this.epoch;this.timer=setTimeout(()=>{if(this.epoch===epoch&&this.rowIndex===index)this.go(index+1,true);},this.mode==='wordparts'?350:650);}
    }
    focus(){const intro=this.stage.querySelector('.part-intro button');if(intro)intro.focus({preventScroll:true});else this.rows[this.rowIndex]?.handle.focus({preventScroll:true});}
    go(index,focus=false){if(!this.active||this.intro||this.busy||this.mode==='pyramid'||index<0||index>=this.rows.length||this.rows.some(row=>row.pointer!==null))return;this.cancelAdvance();const old=this.rowIndex;this.rowIndex=index;this.examples[this.exampleIndex].index=index;
      if(this.mode==='wordparts'&&old!==index){this.busy=true;this.rows[old].el.classList.remove('is-current');this.rows[old].el.classList.add('is-leaving');this.rows[index].el.classList.add('is-entering');this.updateNav();const epoch=this.epoch;this.transitionTimer=setTimeout(()=>{if(epoch!==this.epoch)return;this.rows[old].el.classList.remove('is-leaving');this.rows[index].el.classList.remove('is-entering');this.busy=false;this.updateNav();this.progress(false);if(focus)this.focus();},matchMedia('(prefers-reduced-motion: reduce)').matches?0:320);}
      else {const top=index*this.viewport.clientHeight,smooth=!matchMedia('(prefers-reduced-motion: reduce)').matches&&Math.abs(this.viewport.scrollTop-top)>1;this.busy=smooth;this.pendingFocus=focus;this.updateNav();this.progress(false);this.viewport.scrollTo({top,behavior:smooth?'smooth':'instant'});if(!smooth&&focus){this.pendingFocus=false;this.focus();}}
    }
    switchExample(index){if(index<0||index>=this.examples.length||this.busy||this.rows.some(row=>row.pointer!==null))return;this.stop();this.exampleIndex=index;this.rowIndex=this.examples[index].index;this.intro=this.mode==='wordparts';this.build(false);this.focus();}
  }
  $(function(){R.init();const mode=document.body.dataset.page;if(['slider','pyramid','wordparts'].includes(mode))new Reader(mode);});
})(window);
