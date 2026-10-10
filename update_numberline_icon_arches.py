from pathlib import Path
import re
ROOT=Path(__file__).resolve().parent
MODULE="  /* NUMBER LINE CHARACTER */\n  R.mascotFiles.numberline='numberline';\n"
BRAND='  R.brandIcon=key=>R.mascotFiles[key]?\'<img class="tool-brand-mascot" src="\'+R.siteURL(\'assets/img/tool-icons/\'+([\'addition\',\'numberline\'].includes(key)?R.mascotFiles[key]+\'.png?v=mathcharacters1\':\'nav/\'+R.mascotFiles[key]+\'.png?v=header1\')).href+\'" alt="" width="44" height="44">\':(R.toolIcon?R.toolIcon(key):R.icon(\'home\'));'
STYLES='/* NUMBER LINE CHARACTER */\n.numberline-tool-art { display:flex; flex-direction:column; align-items:center; justify-content:flex-end; padding:0; gap:0; background:#048CD6; }\n.numberline-tool-art img { display:block; width:90%; height:auto; max-height:100%; object-fit:contain; object-position:center bottom; margin:0 auto; }\n'
OLD_RISE='rise=Math.min(144,28+Math.abs(to-from)*.36)+(i%3)*2'
NEW_RISE='rise=(Math.min(144,28+Math.abs(to-from)*.36)+(i%3)*2)/2'
OLD_PATH="d:'M '+from+' '+axis+' Q '+mid+' '+(axis-2*rise)+' '+to+' '+axis"
NEW_PATH="d:'M '+from+' '+axis+' A '+(Math.abs(to-from)/2)+' '+rise+' 0 0 '+(to>from?1:0)+' '+to+' '+axis"
OLD_LABEL="label.textContent=(hop.delta>0?'+':'−')+Math.abs(hop.delta);"
NEW_LABEL="label.textContent=(hop.to-this.state.start>=0?'+':'−')+Math.abs(hop.to-this.state.start);"
paths=['assets/js/app.js','assets/js/math/numberline.js','assets/css/styles.css','index.html','math/index.html']
for name in paths:
    if not (ROOT/name).exists():raise SystemExit('Missing '+name+'. Apply the Number Line tool package first. No files changed.')
if not (ROOT/'assets/img/tool-icons/numberline.png').exists():raise SystemExit('Save the generated chubby kangaroo PNG as assets/img/tool-icons/numberline.png first. This code-only package does not include the image. No files changed.')
original={name:(ROOT/name).read_text(encoding='utf-8') for name in paths}
line=original['assets/js/math/numberline.js'];app=original['assets/js/app.js']
if '/* NUMBER LINE ROUND ARCHES + CUMULATIVE LABELS */' in line:raise SystemExit('This update is already installed. No files changed.')
if '/* NUMBER LINE INTEGRATION */' not in app:raise SystemExit('Apply the Number Line integration first. No files changed.')
def once(text,old,new,name):
    if text.count(old)!=1:raise SystemExit('Unexpected '+name+' source anchor. No files changed.')
    return text.replace(old,new,1)
line=once(line,OLD_RISE,NEW_RISE,'arch height')
line=once(line,OLD_PATH,NEW_PATH,'arch path')
line=once(line,OLD_LABEL,NEW_LABEL,'cumulative label')
line=line.rstrip()+'\n/* NUMBER LINE ROUND ARCHES + CUMULATIVE LABELS */\n'
app=once(app,'  R.init = () => {',MODULE+'  R.init = () => {','mascot registration')
app=once(app,"['numberline','Number Line',null,'#048CD6']","['numberline','Number Line','numberline','#048CD6']",'Tools icon')
app,count=re.subn(r'(?m)^  R\.brandIcon\s*=[^\n]*;[ \t]*$',lambda m:BRAND,app,count=1)
if count!=1:raise SystemExit('Could not locate header image helper. No files changed.')
updates={'assets/js/app.js':app,'assets/js/math/numberline.js':line,'assets/css/styles.css':original['assets/css/styles.css'].rstrip()+'\n\n'+STYLES}
pattern=r'<span class="mascot-tool-art numberline-tool-art"><svg\b[^>]*>.*?</svg><span class="numberline-card-numbers"[^>]*>.*?</span></span>'
for name in ['index.html','math/index.html']:
    prefix='../' if name.startswith('math/') else ''
    replacement='<span class="mascot-tool-art numberline-tool-art"><img src="'+prefix+'assets/img/tool-icons/numberline.png" alt="" width="1254" height="1254" loading="lazy" decoding="async"></span>'
    html,count=re.subn(pattern,replacement,original[name],count=1,flags=re.S)
    if count!=1:raise SystemExit('Could not locate Number Line card in '+name+'. No files changed.')
    updates[name]=html
backup=ROOT.parent/(ROOT.name+'-numberline-character-arches-backup')
for name in updates:
    path=backup/name;path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists():path.write_text(original[name],encoding='utf-8')
for name,text in updates.items():(ROOT/name).write_text(text,encoding='utf-8');print('Updated',name)
print('Kangaroo icon, half-height rounded arches and cumulative labels installed.')
print('Original files are backed up outside the repo:',backup)
