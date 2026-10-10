from pathlib import Path
from html.parser import HTMLParser
from html import escape
from string import Template
from urllib.parse import urlsplit,urljoin,quote
import argparse,json,hashlib,struct

ROOT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description='Sync a shared social-preview template into static pages.')
parser.add_argument('--site-url',help='Override the public site URL in the config.')
parser.add_argument('--image',help='Optional path to the generated PNG to copy into the configured image location.')
args=parser.parse_args()
config_path=ROOT/'templates/social-preview.json'
template_path=ROOT/'templates/social-head.html'
if not config_path.exists() or not template_path.exists():raise SystemExit('Extract the whole package into the repository root first. No files changed.')
config=json.loads(config_path.read_text(encoding='utf-8'))
site=(args.site_url or config.get('site_url','')).strip().rstrip('/')+'/'
parts=urlsplit(site)
if parts.scheme!='https' or not parts.netloc or parts.query or parts.fragment:raise SystemExit('Set a valid public HTTPS site URL without query or fragment. No files changed.')
image_path=(ROOT/config['image_path']).resolve()
try:image_path.relative_to(ROOT.resolve())
except ValueError:raise SystemExit('Image location must be inside this repository.')
source_image=Path(args.image).expanduser().resolve() if args.image else image_path
if not source_image.exists() and not args.image:
    fallback=ROOT/'little-learning-lab-social-preview.png'
    if fallback.exists():source_image=fallback
if not source_image.exists():raise SystemExit('Save the generated card image as '+config['image_path']+' first, or use --image with its PNG path. The image is not included in this template-only package. No files changed.')
image=source_image.read_bytes()
if image[:8]!=b'\x89PNG\r\n\x1a\n' or len(image)<24:raise SystemExit('The share image must be a real PNG. Do not just rename a JPG. No files changed.')
width,height=struct.unpack('>II',image[16:24])
if not width or not height:raise SystemExit('Invalid PNG dimensions. No files changed.')
version=hashlib.sha256(image).hexdigest()[:12]
image_url=urljoin(site,quote(config['image_path'],safe='/'))+'?v='+version
shared=Template(template_path.read_text(encoding='utf-8'))

class HeadInfo(HTMLParser):
    def __init__(self,text):
        super().__init__(convert_charrefs=True);self.offsets=[0];self.in_title=False;self.title=[];self.description=None;self.remove=[]
        for line in text.splitlines(keepends=True):self.offsets.append(self.offsets[-1]+len(line))
    def position(self):
        row,col=self.getpos();return self.offsets[row-1]+col
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='title':self.in_title=True
        if tag=='meta':
            key=(attrs.get('property') or attrs.get('name') or '').lower()
            if key.startswith('og:') or key.startswith('twitter:'):
                start=self.position();self.remove.append((start,start+len(self.get_starttag_text())))
            elif key=='description':self.description=attrs.get('content','')
    def handle_endtag(self,tag):
        if tag=='title':self.in_title=False
    def handle_data(self,data):
        if self.in_title:self.title.append(data)

import re
pages=set(ROOT.glob('*.html'))
for folder in ['language','math']:
    if (ROOT/folder).exists():pages.update((ROOT/folder).rglob('*.html'))
if not pages:raise SystemExit('No site pages found. Place the script at the repository root.')
updates={}
for page in sorted(pages):
    original=page.read_text(encoding='utf-8')
    match=re.search(r'(<head\b[^>]*>)(.*?)(</head\s*>)',original,flags=re.I|re.S)
    if not match:raise SystemExit('Missing head in '+str(page.relative_to(ROOT))+'. No files changed.')
    head=re.sub(r'\s*<!-- LITTLE LEARNING LAB SOCIAL START -->.*?<!-- LITTLE LEARNING LAB SOCIAL END -->\s*','',match.group(2),flags=re.S)
    info=HeadInfo(head);info.feed(head);info.close()
    for start,end in sorted(info.remove,reverse=True):head=head[:start]+head[end:]
    title=''.join(info.title).strip() or config['site_name']
    if config['site_name'].lower() not in title.lower():title+=' | '+config['site_name']
    relative=page.relative_to(ROOT).as_posix()
    public_path='' if relative=='index.html' else relative[:-10] if relative.endswith('/index.html') else relative
    page_url=urljoin(site,quote(public_path,safe='/'))
    description=config.get('page_descriptions',{}).get(relative) or info.description or config['default_description']
    values={key:escape(str(value),quote=True) for key,value in {
       'site_name':config['site_name'],'page_title':title,'description':description,
       'page_url':page_url,'image_url':image_url,'image_width':width,'image_height':height,'image_alt':config['image_alt']}.items()}
    metadata=shared.substitute(values).rstrip()
    updated=original[:match.start(2)]+head.rstrip()+'\n'+metadata+'\n'+original[match.end(2):]
    if updated!=original:updates[page]=(original,updated)
backup=ROOT.parent/(ROOT.name+'-social-preview-backup')
for page,(original,_) in updates.items():
    path=backup/page.relative_to(ROOT);path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists():path.write_text(original,encoding='utf-8')
if source_image.resolve()!=image_path:
    if image_path.exists():
        path=backup/config['image_path'];path.parent.mkdir(parents=True,exist_ok=True)
        if not path.exists():path.write_bytes(image_path.read_bytes())
    image_path.parent.mkdir(parents=True,exist_ok=True);image_path.write_bytes(image)
for page,(_,updated) in updates.items():page.write_text(updated,encoding='utf-8');print('Synced',page.relative_to(ROOT))
print('Shared image:',image_url)
print('Image size:',str(width)+' x '+str(height))
print('Upload the image and updated HTML. Keep the templates for future changes.')
