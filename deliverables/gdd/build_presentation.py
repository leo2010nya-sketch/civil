# coding: utf-8
"""Build an editable GDD presentation plus a matching PDF reading copy.
Run with python-pptx and Pillow installed. Layout units are 1600 x 900 pixels.
"""
from pathlib import Path
import json, math, textwrap
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.xmlchemy import OxmlElement

HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[1]
ASSET=HERE/'assets'; PREVIEW=HERE/'preview'
ASSET.mkdir(exist_ok=True); PREVIEW.mkdir(exist_ok=True)
W,H=1600,900
BG='#10231D'; CARD='#1C3329'; CARD2='#243D30'; FG='#EFE9D7'; MUTE='#A9BAA1'; GOLD='#D5BA80'; SAGE='#B9CC99'; RED='#D69B83'
FONT='/System/Library/Fonts/Hiragino Sans GB.ttc'; SERIF='/System/Library/Fonts/Supplemental/Songti.ttc'
prs=Presentation();prs.slide_width=Inches(13.333333);prs.slide_height=Inches(7.5)
prs.core_properties.title='世脉｜游戏设计与项目进度';prs.core_properties.subject='依据 Simple GDD Template 制作；v4.3 项目快照'
prs.core_properties.author='世脉项目';prs.core_properties.keywords='GDD, civilization, project progress, v4.3'
slides=[]; violations=[]; alltext=[]
def rgb(h):return RGBColor.from_string(h.strip('#'))
def inch(px):return Inches(px/120)
def font(size,bold=False,serif=False):return ImageFont.truetype(SERIF if serif else FONT,round(size),index=1 if serif else 2 if bold else 0)
def cropped(src,dest,box=None):
 im=Image.open(ROOT/src).convert('RGB')
 if box:im=im.crop(box)
 im.save(ASSET/dest);return ASSET/dest
mapimg=cropped('artifacts/v43-04-policy-feedback.png','map.png',(0,100,1055,805))
for name,file in [('warehouse','v43-01-warehouse.png'),('tax','v43-03-tax-feedback.png'),('policy','v43-04-policy-feedback.png'),('trade','v43-02-trade.png'),('war','v43-05-war-feedback.png')]:
 cropped('artifacts/'+file,name+'.png',(1060,96,1430,748))
buildings=cropped('artifacts/v43-08-production-buildings.png','production.png',(35,115,1400,690))
village=cropped('artifacts/02-village.png','village.png')
mobile=cropped('artifacts/v43-06-mobile-warehouse.png','mobile.png')

def new(section,title,sub='',notes=''):
 idx=len(slides)+1;sl=prs.slides.add_slide(prs.slide_layouts[6]);sl.background.fill.solid();sl.background.fill.fore_color.rgb=rgb(BG)
 im=Image.new('RGB',(W,H),BG);d=ImageDraw.Draw(im)
 page={'slide':sl,'image':im,'draw':d,'index':idx,'section':section,'title':title,'text':[]}
 slides.append(page)
 if section:
  tx(page,64,34,1350,30,section.upper(),21,GOLD,bold=True)
  tx(page,64,89,1470,78,title,58,FG,serif=True)
  if sub:tx(page,66,174,1468,54,sub,25,MUTE)
 line(page,64,838,1536,838,'#385043',1)
 tx(page,64,854,1330,25,'世脉  /  GDD · v4.3  /  2026.11.11',18,MUTE)
 tx(page,1460,849,75,35,f'{idx:02d}',24,GOLD,align='right')
 sl.notes_slide.notes_text_frame.text=notes or '项目快照：2026-11-11，v4.3。根据项目 README、讨论记录、代码及已有测试结果整理。'
 return page

def rect(p,x,y,w,h,fill=CARD,r=22,linecolor=None):
 p['draw'].rounded_rectangle((x,y,x+w,y+h),radius=r,fill=fill,outline=linecolor,width=1)
 sh=p['slide'].shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if r else MSO_SHAPE.RECTANGLE,inch(x),inch(y),inch(w),inch(h));sh.fill.solid();sh.fill.fore_color.rgb=rgb(fill)
 if linecolor:sh.line.color.rgb=rgb(linecolor)
 else:sh.line.fill.background()
 if r:
  try:sh.adjustments[0]=min(.25,r/min(w,h))
  except:pass
 return sh

def line(p,x1,y1,x2,y2,color=GOLD,width=2):
 # The document's thin rules are presentation furniture, not game UI.
 p['draw'].line((x1,y1,x2,y2),fill=color,width=width)
 sh=p['slide'].shapes.add_connector(1,inch(x1),inch(y1),inch(x2),inch(y2));sh.line.color.rgb=rgb(color);sh.line.width=Pt(width*.6)

def wrap(text,f,maxwidth):
 result=[]
 for raw in str(text).split('\n'):
  if not raw:result.append('');continue
  current=''
  for ch in raw:
   if f.getlength(current+ch)>maxwidth and current:result.append(current.rstrip());current=ch.lstrip()
   else:current+=ch
  result.append(current)
 return result

def tx(p,x,y,w,h,text,size=30,color=FG,bold=False,serif=False,align='left',leading=1.3):
 f=font(size,bold,serif);lines=wrap(text,f,w-5);lh=size*leading
 if len(lines)*lh>h+3:violations.append({'slide':p['index'],'text':str(text)[:55],'needed':len(lines)*lh,'height':h})
 for i,t in enumerate(lines):
  tw=f.getlength(t);px=x if align=='left' else x+(w-tw)/2 if align=='center' else x+w-tw
  p['draw'].text((px,y+i*lh),t,font=f,fill=color,anchor='lt')
 box=p['slide'].shapes.add_textbox(inch(x),inch(y),inch(w),inch(h));tf=box.text_frame;tf.clear();tf.word_wrap=False
 tf.margin_left=tf.margin_right=tf.margin_top=tf.margin_bottom=0
 from pptx.enum.text import PP_ALIGN
 for i,t in enumerate(lines):
  para=tf.paragraphs[0] if i==0 else tf.add_paragraph();para.text=t;para.alignment={'left':PP_ALIGN.LEFT,'center':PP_ALIGN.CENTER,'right':PP_ALIGN.RIGHT}[align]
  para.font.name='Songti SC' if serif else 'Hiragino Sans GB';para.font.size=Pt(size*.6);para.font.bold=bold
  para.font.color.rgb=rgb(color);para.space_before=Pt(0);para.space_after=Pt(0);para.line_spacing=Pt(lh*.6)
  for run in para.runs:
   rpr=run._r.get_or_add_rPr();ea=OxmlElement('a:ea');ea.set('typeface','Songti SC' if serif else 'Hiragino Sans GB');rpr.append(ea)
 p['text'].append(str(text));alltext.append(str(text));return box

def pic(p,path,x,y,w,h):
 im=Image.open(path).convert('RGB');fit=ImageOps.fit(im,(round(w),round(h)),method=Image.Resampling.LANCZOS)
 p['image'].paste(fit,(round(x),round(y)));p['slide'].shapes.add_picture(str(path),inch(x),inch(y),width=inch(w),height=inch(h))
 # Match PowerPoint crop to the preview, rather than stretching screenshots.
 sh=p['slide'].shapes[-1];iw,ih=im.size;ratio=max(w/iw,h/ih);cw=iw*ratio;ch=ih*ratio
 sh.crop_left=sh.crop_right=max(0,(cw-w)/(2*cw));sh.crop_top=sh.crop_bottom=max(0,(ch-h)/(2*ch))

def label(p,x,y,text,color=SAGE,w=130):
 rect(p,x,y,w,36,CARD2,16);tx(p,x+12,y+5,w-24,28,text,19,color,bold=True)
def card(p,x,y,w,h,n,title,body,accent=SAGE):
 rect(p,x,y,w,h);tx(p,x+25,y+23,60,54,n,39,accent,serif=True);tx(p,x+25,y+89,w-50,50,title,32,FG,bold=True);tx(p,x+25,y+151,w-50,h-165,body,27,MUTE,leading=1.45)
def bullet(p,x,y,w,title,body):
 tx(p,x,y,w,45,title,31,SAGE,bold=True);tx(p,x,y+54,w,102,body,27,FG,leading=1.4)
def strip(p,y,title,body,num):
 rect(p,64,y,1472,115);tx(p,88,y+22,60,65,num,42,GOLD,serif=True);tx(p,175,y+22,360,63,title,32,FG,bold=True);tx(p,555,y+25,945,80,body,27,MUTE)

# 01 — Cover.
p=new('', '世脉',notes='项目名：世脉。团队正式名称与成员署名尚待确认。当前为可玩原型，不是完整发布版。')
pic(p,mapimg,640,0,960,838);rect(p,0,0,670,838,BG,0)
label(p,66,80,'可玩原型',w=150);tx(p,63,185,590,190,'世 脉',132,FG,serif=True)
tx(p,70,403,520,120,'从一缕炊烟，\n到一套文明秩序。',46,FG,serif=True)
tx(p,72,587,510,95,'游戏设计文档与项目进度\nGame Design Document · v4.3',28,MUTE)
tx(p,72,748,500,40,'中文汇报  /  2026 年 11 月 11 日',22,GOLD)

# 02 — Overview.
p=new('01 / Project Overview','让每一步治理，改变文明的走向','一句话概念：在随机世界里，以建设、经济政策与制度改革推动文明逐步演化。')
for x,n,t,b in [(64,'01','类型与平台','文明发展 × 国家经营\n经济策略 / 轻量战争\nHTML + Canvas 浏览器游戏'),(565,'02','目标玩家 · 定位','喜欢建设与制度推演的玩家\n关注长期因果与资源规划\n偏好宏观决策、少量微操'),(1066,'03','核心差异','玩家组合条款，拟定政策\n政策逐地区扩散并遇到阻力\n建设结果反过来改变治理')]:card(p,x,270,470,445,n,t,b)
tx(p,70,758,1450,44,'USP：用“建成了什么、政策如何落地、社会如何反馈”呈现文明演化。',28,GOLD)

# 03 — Current progress.
p=new('01 / Current Snapshot','当前版本：已有完整的可玩循环','以下为已实现与已验证范围；长期全时代平衡仍需后续测试。')
metrics=[('64','建筑定义'),('28','政策条款'),('9','实物资源'),('2','开局模式')]
for i,(n,t) in enumerate(metrics):
 x=64+i*376;rect(p,x,268,344,175);tx(p,x+24,286,285,96,n,71,SAGE,serif=True);tx(p,x+25,382,285,42,t,28,FG)
bullet(p,78,496,680,'已打通','启动与存档 → 地图探索 → 建设与供给 → 政策、税务与贸易 → 社会和战争反馈。')
bullet(p,846,496,650,'仍属原型','世界与主体采用汇总模拟；动态商品价格、债务、完整科技树与正式胜负结算尚未完成。')
label(p,80,715,'89 组引擎检查',w=255);label(p,370,715,'167 项浏览器检查',w=290)

# 04 — Core loop.
p=new('02.1 / The Core Loop','观察 → 决策 → 实施 → 反馈','30 秒操作窗口：看缺口、做一次决定，再通过时间推进观察效果。')
for i,(t,b) in enumerate([('观察','地图地貌、仓库与收支\n识别供给、住房和财政缺口'),('决策','点击建设位置\n拟定议案、调整税率与贸易'),('实施','工程按工期推进\n政策逐地区扩散'),('反馈','库存、人口、信任变化\n重要事件通过小弹窗呈现')]):
 x=64+i*376;rect(p,x,290,344,307);tx(p,x+24,317,285,60,f'0{i+1}',43,GOLD,serif=True);tx(p,x+24,392,290,53,t,38,FG,bold=True);tx(p,x+24,467,290,110,b,25,MUTE)
 if i<3:tx(p,x+345,406,31,50,'→',30,GOLD,align='center')
rect(p,64,647,1472,123,CARD2);tx(p,90,671,1410,82,'扩展奖励：设施与知识积累 → 新政策与产业 → 更大聚落和治理范围 → 新一轮资源与政治选择。',31,SAGE)

# 05 — Controls.
p=new('02.2 / Controls & Movement','鼠标为主，信息按需展开','无明确回合；玩家可以暂停、规划，再推进时间。')
pic(p,mapimg,64,265,810,511)
for y,t,b in [(270,'点击土地 → 点击建筑','直接在所点位置开工；无需第二次选址。'),(421,'拖动 / 滚轮 / 触屏双指','平移与缩放；世界、地区、聚落三级视野。'),(572,'暂停与速度','空格播放 / 暂停；1×、5×、12×。')]:bullet(p,935,y,565,t,b)
tx(p,937,748,560,49,'快捷键：B 建设 · P 政策 · R 报告 · E 探索',22,GOLD)

# 06 — Economy.
p=new('02 / Mechanics · Economy','从生存供给，到资源与财政规划','经济是主要玩法：建设改变产能，库存和收支约束进一步发展。')
pic(p,ASSET/'warehouse.png',1110,253,305,536)
for y,t,b in [(260,'九类物资','粮食、木材、石材、黏土、铁料、煤炭、工具、布匹、药材；国库独立核算。'),(425,'生产链与仓储','原料、劳力、容量不足会限制产出；仓库展示库存、流量与累计溢出。'),(590,'实际后果','缺粮会导致人口下降；伐木消耗周围森林。工具与生活物资带来实际收益。')]:bullet(p,77,y,930,t,b)

# 07 — Policies.
p=new('02 / Mechanics · Politics','玩家拟定安排，政策逐步落地','28 项可用条款库，每份议案最多 6 条；未解锁内容保持隐藏。')
pic(p,ASSET/'policy.png',1105,251,310,546)
for i,(t,b) in enumerate([('组合式议案','命名 + 条款 + 地区 + 对象 + 执行组织 + 条件 + 期限。'),('改革有阻力','改变幅度、收益与实施范围影响政治阻力、信任压力及落实速度。'),('反馈可追踪','查看各地区覆盖和实际效力；到期、过半与完成时给出有限反馈。')]):bullet(p,78,262+i*165,935,t,b)

# 08 — Tax + trade.
p=new('02 / Mechanics · Tax & Trade','贸易由玩家决定，关税进入真实结算','采用货币前为实物交换；采用后统一按货币计价。')
pic(p,ASSET/'trade.png',64,260,300,528)
rect(p,411,266,1125,194);tx(p,438,288,1068,48,'玩家逐国设置进口与出口',35,SAGE,bold=True);tx(p,438,354,1068,90,'货物和年数量可自行选择；实际交付受库存、资金、仓容及边境关系限制。',30,FG)
rect(p,411,483,1125,131);tx(p,438,508,1070,75,'出口收入 = 实际货值 − 对方关税\n进口支付货款；本国关税由税务系统入账。',29,FG)
tx(p,435,654,1060,118,'五类税：人头税、土地税、国内贸易税、关税、增值税。\n按发展条件开放；税负影响生产、贸易与公众信任。',28,MUTE)

# 09 — War.
p=new('02 / Mechanics · War & Diplomacy','战争轻量化，让谈判成为有价值的选择','无需明确部署；自动战斗保留不确定性，战争产生持续成本。')
pic(p,ASSET/'war.png',1110,253,305,538)
stripwidth=950
for y,t,b in [(260,'发起方式','可主动宣战，也可能遭邻国进攻；地方征召到常备动员逐步开放。'),(425,'胜负逻辑','科技、兵力、支持、补给、财政与防御综合影响随机胜算。'),(590,'成本与退出','耗粮、耗材、军费、伤亡和厌战；贸易中断，玩家可提出多种停战条件。')]:bullet(p,78,y,935,t,b)

# 10 — Progression.
p=new('02 / Progression','两种开局，同一条发展主线','长线目标是史前到未来；当前以八个简化阶段和设施前置链表达。')
card(p,64,265,710,235,'A','开拓 · 从零起步','36 人村落，先解决粮食与住房。')
card(p,806,265,730,235,'B','继承 · 经营既有国家','三城共 11,400 人，贵族与两个邻国已存在。')
rect(p,64,532,1472,243,CARD2)
tx(p,92,556,1400,60,'发展门槛由条件决定，而非年代自动跳转',34,SAGE,bold=True)
tx(p,92,631,1390,70,'单城 ≥ 10,000 人 + 知识与前置设施 → 工场建成 → 工业化 → 公立学校 → 公共教育',29,FG)
tx(p,92,718,1400,45,'基础住房、农田、伐木、水井和道路始终保留，后期仍可开拓新领地。',26,MUTE)

# 11 — Win / Loss.
p=new('02.3 / Win & Loss Conditions','当前是开放式经营，尚无正式通关结算','模板要求的胜负条件在此区分现有机制与建议设计。')
card(p,64,280,710,410,'01','当前可玩的目标','扩充聚落、解锁设施与制度、维持供给、财政和社会支持；没有固定胜利弹窗。')
card(p,806,280,730,410,'02','已存在的失败后果','饥荒导致人口下降，工程可能失败，战争造成伤亡和损耗；尚无统一 Game Over。',RED)
rect(p,64,727,1472,73,CARD2);tx(p,88,742,1410,47,'后续建议：加入“发展成就”与“国家崩溃”判定，并先验证可理解性与长期平衡。',27,GOLD)

# 12 — Aesthetic.
p=new('03.1 / Aesthetic Vision','暗色自然世界，细节随尺度展开','艺术目标：俯视像素地图、自然流动感与可辨识的地区差异。')
pic(p,mapimg,64,261,900,521)
for y,t,b in [(267,'视觉与配色','森林绿、深水色、灰岩色；暖沙金用于重点与反馈。'),(433,'界面语言','顶部保留核心数据；细节只在选取或点击后出现。'),(599,'氛围与边界','缓慢生长的文明感；现有为程序绘制精灵，人物与时代美术仍需精修。')]:bullet(p,1015,y,500,t,b)

# 13 — Narrative.
p=new('03.2 / Narrative','叙事来自玩家留下的建设与制度','采用系统生成的地方故事，而非预设主线剧情。')
for i,(t,b) in enumerate([('世界','随机生成地理为主，现实地理为启发；探索需要时间，已知世界逐步扩展。'),('玩家身份','以国家治理者的宏观视角，负责预算、建设、政策与制度变革。'),('故事动力','粮荒、迁入、改革、宗教文化、邻国冲突与停战，共同构成国家的历史。')]):card(p,64+i*501,282,470,455,f'0{i+1}',t,b)
tx(p,75,762,1460,45,'长期设定：现实文明与社会科学启发；完整现实文明名录及全历史社会形态库仍待扩展。',25,GOLD)

# 14 — MVP.
p=new('04.1 / Scope · MVP','三个必须可玩的支柱，现已具备','以下为当前已达到的 MVP 范围；不等于全时代内容已经完成。')
strip(p,268,'可探索、可建设','随机地图、计时探索、点击直接开工、库存与人口后果。','01')
strip(p,410,'可治理、可反馈','组合议案、政策传播、财政与税务、地区社会反应。','02')
strip(p,552,'可持续运行','两种开局、存档恢复、基础外交贸易、轻量战争与按需界面。','03')
label(p,77,735,'下一阶段重点',GOLD,205);tx(p,314,736,1180,52,'平衡、可读性、首次游玩引导；优先打磨现有循环。',30,FG)

# 15 — Assets.
p=new('04.2 / Asset List','资产已有可用基础，完成度按类型区分','已实现 = 原型可运行；待打磨不隐藏，也不虚报为最终成品。')
rows=[('代码','模拟、存档、税务、政策、贸易、战争','已实现',SAGE),('视觉','随机地形、64 类建筑绘制、界面与图表','已实现 / 待精修',SAGE),('反馈','新闻、报告、施工与战争弹窗','已实现',SAGE),('音频','配乐、环境声、操作与事件音效','待制作',GOLD),('内容','完整史前—未来、文明库与科技树','待扩展',GOLD),('测试','回归脚本、桌面与手机交互截图','已实现 / 继续验证',SAGE)]
for i,(kind,body,status,col) in enumerate(rows):
 y=267+i*82;rect(p,64,y,1472,68,CARD if i%2==0 else BG,12);tx(p,86,y+15,140,42,kind,28,FG,bold=True);tx(p,255,y+16,860,42,body,27,MUTE);tx(p,1178,y+17,335,40,status,25,col)

# 16 — Technical progress.
p=new('04 / Build & Validation','性能优化与验证，也属于项目进度','浏览器运行，无需后端；Canvas 地图与政府视角的汇总模拟。',notes='来源：artifacts/v43-engine-results.json（89 组）；原有浏览器 110 项 + map-cache-smoke 36 项 + systems-smoke 21 项 = 167。性能采用 artifacts/map-cache-results.json 当前数值；固定镜头、缓存预热、1440×900、额外450栋建筑，五组各24帧中位数。衡量主线程绘制调用，未等待GPU，不代表整机帧率。')
rect(p,64,263,690,513);tx(p,92,289,630,58,'按变化重绘，按系统分频',36,SAGE,bold=True)
tx(p,92,379,630,262,'地图：地形 / 道路 / 静态建筑 / 迷雾分层缓存。\n\n模拟：经济 0.05 年，战争 0.1 年，贸易与社会 0.25 年，自动规划 1 年。',30,FG)
tx(p,92,699,620,54,'动画与交互独立运行，余量随存档保留。',25,MUTE)
bench=json.loads((ROOT/'artifacts/map-cache-results.json').read_text())['benchmarks'][1]
rect(p,789,263,747,251);tx(p,818,283,690,50,'固定镜头大城市：绘制调用耗时',30,FG,bold=True)
maxv=45
for y,v,c,t in [(365,bench['raw'],MUTE,'直接绘制'),(433,bench['cached'],SAGE,'缓存预热后')]:
 tx(p,816,y-6,175,45,t,24,MUTE);rect(p,1000,y,round(v/maxv*350),32,c,8);tx(p,1364,y-8,148,49,f'{v:.1f} ms',27,c)
rect(p,789,539,747,237);tx(p,819,560,680,54,'89 组引擎  /  167 项浏览器',37,SAGE,bold=True)
tx(p,819,641,680,100,'已有回归结果均通过。\n性能数据不等于整体帧率；长期平衡尚未完成。',27,MUTE)

# 17 — Roles.
p=new('05 / Team Roles','按责任组织工作，正式署名待确认','当前信息不足以确认团队人数及姓名，以下为建议责任划分。')
for i,(t,b) in enumerate([('策划与产品','确定发展目标与规则\n讨论政策、经济和社会形态\n验收体验与迭代优先级'),('开发与验证','实现系统与交互\n维护存档、性能与测试\n将反馈落实为可玩版本'),('美术、音频与试玩','统一时代与像素风格\n补充音频资产\n通过真实试玩验证上手与平衡')]):card(p,64+i*501,280,470,448,f'0{i+1}',t,b)
tx(p,77,760,1450,45,'现有协作：用户主导方向与反馈，Codex 辅助实现与验证；不据此推定正式团队成员。',25,GOLD)

# 18 — Plan.
p=new('06 / Project Plan','未来 20 周建议排期','相对周 W1–W20；非已确认学期周数。校内展览日期需另行对齐。')
phases=[('W1–2','GDD 与范围锁定','确认胜负目标、术语、演示范围及资产清单。'),('W3–5','核心机制打磨','调整经济与仓储平衡，统一政策、税务、贸易反馈。'),('W6–8','可演示垂直切片','完成一段连贯发展路径，配套引导与稳定存档。'),('W9–11','首次外部试玩','记录卡点、理解误差与性能；修复高优先级问题。'),('W12–16','内容扩展','按试玩结果补充时代、事件与建筑，避免无边界扩张。'),('W17–20','最终打磨与展示','美术音频整合、长期回归、演示存档与展示材料。')]
for i,(week,t,b) in enumerate(phases):
 y=261+i*86;rect(p,64,y,1472,74,CARD,14);tx(p,84,y+14,180,44,week,28,GOLD,bold=True);tx(p,287,y+14,345,45,t,29,FG,bold=True);tx(p,650,y+17,854,44,b,25,MUTE)

# 19 — Dev log.
p=new('07 / Development Log','开发记录：用已知版本替代虚构周报','模板以周为单位记录；项目现有记录采用日期和版本，后续再映射课程周次。')
rows=[('11.09','v4.0','税制、宗教文化、贵族、战争与时代外观','60 组引擎 / 89 项浏览器'),('11.10','v4.1','速度、政策扩充、金融建筑与聚落命名','68 组引擎 / 110 项浏览器'),('11.11','v4.2','地图分层缓存、动画与遮挡验证','新增 36 项缓存检查'),('11.11','v4.3','分频、邻国增长、仓储、自主进出口与反馈','89 组引擎 / 167 项浏览器')]
for i,(date,ver,body,test) in enumerate(rows):
 y=267+i*125;rect(p,64,y,1472,105,CARD,18);tx(p,90,y+19,120,60,date,32,GOLD,serif=True);tx(p,237,y+20,122,55,ver,30,SAGE,bold=True);tx(p,398,y+17,1100,45,body,29,FG);tx(p,400,y+63,1080,35,test,22,MUTE)

# 20 — Remaining work.
p=new('Next / Iteration Priorities','下一稿，让已有系统更好理解、更有取舍','扩充内容之前，先以真实试玩检验玩法是否成立。')
for i,(t,b) in enumerate([('先解决可读性','把资源、税收、政策和战争的因果解释清楚；减少重复报告与不必要小字。'),('再验证长期平衡','测试缺粮、仓容、贸易盈亏、改革阻力与城市增长，避免可重复套利和发展死锁。'),('最后扩充深度','依据体验补充时代内容、动态价格与金融模型；继续完善人物、美术与声音。')]):card(p,64+i*501,275,470,451,f'0{i+1}',t,b)
tx(p,78,757,1445,48,'设计边界：政府是模拟核心；战争保持轻量；社会与外国主体优先采用可解释的汇总模型。',26,GOLD)

# 21 — Closing / sources.
p=new('Reference / Delivery','已经能够经营一个国家，下一步验证它是否有趣','项目状态：v4.3 可玩原型  ·  GDD 结构映射自用户提供的 Simple Version 模板。')
pic(p,mapimg,64,267,810,514)
for y,t,b in [(274,'运行与演示','现代浏览器打开本地项目；建议先用“继承”模式演示经济与外交。'),(438,'内容依据','README、项目讨论记录、实际代码、测试结果与项目内实机截图。'),(604,'资料与责任说明','本稿为当前项目进度整理；团队署名、正式学期周数与展览日期待确认。')]:bullet(p,936,y,576,t,b)

# Save native PowerPoint, matching reading copy, proof images, and a content manifest.
out=HERE/'世脉_GDD与项目进度_v4.3.pptx';prs.save(out)
for p in slides:p['image'].save(PREVIEW/f"slide-{p['index']:02d}.png")
slides[0]['image'].save(HERE/'世脉_GDD与项目进度_预览.pdf',save_all=True,append_images=[s['image'] for s in slides[1:]],resolution=120)
thumbs=Image.new('RGB',(4*400,math.ceil(len(slides)/4)*225),'#091810')
for i,p in enumerate(slides):thumbs.paste(p['image'].resize((400,225)),((i%4)*400,(i//4)*225))
thumbs.save(HERE/'幻灯片总览.jpg',quality=92)
manifest={'title':'世脉｜游戏设计与项目进度','version':'v4.3','date':'2026-11-11','slide_count':len(slides),'template':'Game Design Document (GDD) Template - Simple Version (1).docx','text_overflow':violations,'slides':[{'index':p['index'],'section':p['section'],'title':p['title'],'text':p['text']} for p in slides]}
(HERE/'presentation_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(HERE/'使用说明.txt').write_text('主文件：世脉_GDD与项目进度_v4.3.pptx\n共21页，16:9。文字、数据条与形状可编辑，图片为项目实机截图。\nPDF为同版式阅读预览，供不安装演示软件时查阅。\n中文字体使用 Hiragino Sans GB 与 Songti SC；其他设备可在演示软件中替换为思源黑体与思源宋体。\n说明：团队署名未获提供；未来20周为建议排期；正式胜负、长期平衡与完整宏观经济明确标为未完成。\n数据来源：项目 README、讨论记录、代码及 artifacts 目录已有测试结果，未以本次制作代替新一轮游戏验收。\n生成源码：build_presentation.py，依赖 python-pptx 与 Pillow。\n',encoding='utf-8')
print(json.dumps({'pptx':str(out),'slides':len(slides),'overflow':violations},ensure_ascii=False,indent=2))
if violations:raise SystemExit(1)
