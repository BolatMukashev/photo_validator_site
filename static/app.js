'use strict';
/* ================= НАСТРОЙКИ (меняйте здесь) ================= */
const SIZE={                 // сторона квадрата, px: min/max — допустимо, out — размер при обрезке
  lottery:{min:600,max:600,out:600},   // лотерея (DV): ровно 600×600
  visa:{min:600,max:1200,out:900}      // виза: от 600 до 1200
};
const lim=()=>$('#mLot').checked?SIZE.lottery:SIZE.visa;   // режим берётся из переключателя «виза / лотерея»
const OUT_DPI=300;           // dpi, записываемый в JPEG (на пиксели и сжатие не влияет)
const JPEG_QMAX=1;           // максимальное качество JPEG (0–1, 1 = как «качество 12» в Photoshop); при превышении 240 КБ качество снижается шагами по 0.02
const SHARPEN=.4;            // резкость после уменьшения (0 = выкл, 0.3–0.8 обычно). В Safari не работает
const SHARPEN_RADIUS=1;      // радиус резкости, px
const LEVEL=false;            // выравнивать наклон при обрезке (false = не поворачивать совсем)
const LEVEL_MIN_DEG=1;       // наклон меньше этого угла не исправляем
const LEVEL_MAX_DEG=3;       // наклон больше — скорее всего ошибка определения глаз, поворот не делаем
const LEVEL_STRENGTH=.7;     // какую долю угла исправлять (0–1)
const KEEP_READY=true;       // готовые квадратные фото нужных пропорций не пересчитывать (размер сохраняется)
const MAX_KB=240;            // максимальный размер файла, КБ
const MAX_RATIO=20;          // максимальная степень сжатия (N : 1)
const DPI_MIN=72;            // минимально «нормальный» dpi в тесте (у госдепа требований к dpi для цифровых файлов нет)
const HEAD_MIN=50, HEAD_MAX=69;  // высота головы, % от высоты кадра
const EYE_MIN=56, EYE_MAX=69;    // линия глаз, % от нижнего края
const TILT_MAX_DEG=5;        // максимальный наклон линии глаз, градусы
const TURN_MAX=.18;          // максимальное смещение оси лица от середины глаз (доля расстояния между глазами); работает, только если вы двигали пунктирную ось
const EAR_SHADOW_DROP=.05;   // тень на фоне у головы: насколько тёмнее чистого фона (доля), чтобы считаться тенью
const EAR_SHADOW_AREA=.02;   // допустимая доля «теневых» участков фона у головы (0.02 = 2%)
const MAX_AGE_DAYS=183;      // давность фото (~6 месяцев)
const MIN_YEAR=2010;         // даты раньше считаются заглушкой (2000 г. и т.п.)
const BG_LUM_MIN=230;        // фон светлый: яркость не ниже (0–255)
const BG_STD_MAX=20;         // фон ровный: разброс яркости не выше
const BG_SPREAD_MAX=25;      // фон нейтральный: разница между R, G, B не выше
const BG_EDGE=.05;           // ширина проверяемой полосы фона по краям, доля высоты кадра
const BG_SIDE_H=.4;          // боковые полосы берутся от верха кадра на эту долю высоты
const ENH_SRC=1200;            // сторона вырезки вокруг головы, отправляемой на улучшение (px)
const ENH_URL='/api/enhance';   // адрес серверного прокси (ключ OpenRouter хранится только на сервере)
const BG_CLIP_MAX=.99;       // «засвечен»: доля полностью белых пикселей фона выше этого
/* ============================================================== */
const $=s=>document.querySelector(s),cv=$('#cv'),c=cv.getContext('2d'),VIEW=448;
const HEAD='"Montserrat","Arial Black",Arial,sans-serif',BODY='"Inter",Arial,Helvetica,sans-serif',MONO='"IBM Plex Mono",ui-monospace,Menlo,monospace',FONT=BODY,COL={ok:'#008000',bad:'#FF0000',warn:'#FFA500',na:'#999999',top:'#FF0000',chin:'#000000',eye:'#008000',axis:'#000000',bg:'#FFFFFF',sunken:'#F0F0F0',edge:'#000000',text:'#000000',muted:'#444444'};   // токены RawBlock
const LAB=['Ширина фото','Высота фото','Размер файла','Степень компрессии','Горизонт. разрешение','Вертикал. разрешение','Верхняя точка головы','Нижняя точка головы','Размер головы','Линия глаз','Высота уровня глаз','Оба глаза открыты','Эффект красных глаз','Наклон или поворот головы','Лицо по центру фото','Тени на лице (боковой свет)','Формат фото','Цветовое пространство','Глубина цвета','Фон ровный, однородный','Фон нейтрального цвета','Фон светлый','Фон изменён или засвечен','Дата фото','Корректное имя файла'];
const NAMES=['макушку головы','подбородок','левый глаз','правый глаз'];
let W0=null,rotDeg=0,rotQ=0,W=null,M=null,P=[],LN=null,cxUser=false,hintOn=true,drag=null,cropped=false,res=null,busy=false,PRE=null;

/* ---------- загрузка ---------- */
async function loadFile(f){
  if(!f||busy)return;
  const bytes=await f.arrayBuffer();
  const bmp=await createImageBitmap(new Blob([bytes],{type:f.type})).catch(()=>null);
  if(!bmp)return alert('Не удалось открыть файл как изображение');
  W=document.createElement('canvas');W.width=bmp.width;W.height=bmp.height;W.getContext('2d').drawImage(bmp,0,0);
  M={name:f.name,bytes,size:f.size,mod:f.lastModified,dates:info(bytes).dates,user:null};
  W0=W;rotDeg=0;setRotUI();
  LN={top:.1*W.height,eye:.38*W.height,chin:.7*W.height,cx:W.width/2};hintOn=true;cxUser=false;cropped=false;res=null;setP();sync();
}
$('#bLoad').onclick=()=>{$('#f').value='';$('#f').click()};
$('#f').onchange=e=>loadFile(e.target.files[0]);
$('#view').ondragover=e=>e.preventDefault();
$('#view').ondrop=e=>{e.preventDefault();loadFile(e.dataTransfer.files[0])};

/* ---------- ручной поворот (до обрезки) ---------- */
const ROT_MAX=15;            // максимальный угол ручного поворота, градусы
function setRotUI(){$('#rS').value=rotDeg;$('#rV').textContent=(rotDeg>0?'+':'')+rotDeg.toFixed(1)+'°'}
function rotated(){          // повёрнутая копия оригинала W0 (размер кадра прежний, линии остаются на месте)
  if(!rotDeg)return W0;
  const w=W0.width,h=W0.height,o=document.createElement('canvas');o.width=w;o.height=h;
  const d=W0.getContext('2d').getImageData(0,0,w,Math.max(2,Math.round(h*.04))).data;let r=0,g=0,b=0;
  for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2]}
  const n=d.length/4,x=o.getContext('2d');
  x.fillStyle=`rgb(${r/n|0},${g/n|0},${b/n|0})`;x.fillRect(0,0,w,h);   // углы, открывшиеся после поворота, — цвет фона сверху
  x.imageSmoothingQuality='high';x.translate(w/2,h/2);x.rotate(rotDeg*Math.PI/180);x.translate(-w/2,-h/2);x.drawImage(W0,0,0);
  return o;
}
const applyRot=()=>{W=rotated()};
function setRot(v){
  if(!W0||cropped)return;
  rotDeg=Math.max(-ROT_MAX,Math.min(ROT_MAX,Math.round(v*10)/10));setRotUI();
  cancelAnimationFrame(rotQ);rotQ=requestAnimationFrame(()=>{applyRot();res=null;setP();sync()});
}
$('#rS').oninput=e=>setRot(+e.target.value);
$('#rL').onclick=()=>setRot(rotDeg-.5);
$('#rR').onclick=()=>setRot(rotDeg+.5);
$('#rZ').onclick=()=>setRot(0);

/* ---------- метаданные файла ---------- */
const asc=(u,a,n)=>String.fromCharCode(...u.slice(a,a+n));
function info(buf){
  const u=new Uint8Array(buf),v=new DataView(buf),r={fmt:'?',dpi:null,dates:[],icc:'',bits:null};
  try{
    if(u[0]==0xFF&&u[1]==0xD8){
      r.fmt='JPEG';let p=2,ex=null;
      while(p<u.length-10){
        if(u[p]!=0xFF){p++;continue}
        const m=u[p+1],len=v.getUint16(p+2);
        if(m==0xE0&&u[p+4]==0x4A&&u[p+11]==1)r.dpi=[v.getUint16(p+12),v.getUint16(p+14)];
        if(m==0xE1&&asc(u,p+4,4)=='Exif')ex=exif(v,u,p+10);
        if(m==0xE1&&asc(u,p+4,4)=='http'){for(const mm of asc(u,p+4,Math.min(len-2,30000)).matchAll(/(?:CreateDate|DateTimeOriginal|DateCreated|ModifyDate)\W{1,3}(\d{4}-\d\d-\d\d)/g))r.dates.push(mm[1])}
        if(m==0xE2)r.icc+=asc(u,p+4,Math.min(len,4000));
        if(m>=0xC0&&m<=0xCF&&m!=0xC4&&m!=0xC8&&m!=0xCC){r.bits=u[p+4]*u[p+9];break}
        p+=2+len;
      }
      if(ex){r.dates=r.dates.concat(ex.d);if(!r.dpi&&ex.x)r.dpi=ex.unit==3?[Math.round(ex.x*2.54),Math.round(ex.y*2.54)]:[Math.round(ex.x),Math.round(ex.y)]}
    }else if(u[0]==0x89&&u[1]==0x50){r.fmt='PNG';r.bits=u[24]*({0:1,2:3,3:1,4:2,6:4}[u[25]]||1)}
  }catch(e){}
  return r;
}
function exif(v,u,t){
  const le=v.getUint16(t)==0x4949,g16=o=>v.getUint16(o,le),g32=o=>v.getUint32(o,le),R={d:[]};
  const ifd=(o,f)=>{const n=g16(o);for(let i=0;i<n;i++){const e=o+2+i*12;f(g16(e),e)}};
  ifd(t+g32(t+4),(tag,e)=>{
    if(tag==0x011A||tag==0x011B){const q=t+g32(e+8);R[tag==0x011A?'x':'y']=g32(q)/g32(q+4)}
    if(tag==0x0128)R.unit=g16(e+8);
    if(tag==0x0132)R.d.push(asc(u,t+g32(e+8),10));
    if(tag==0x8769)ifd(t+g32(e+8),(tg,e2)=>{if(tg==0x9003||tg==0x9004)R.d.push(asc(u,t+g32(e2+8),10))});
  });
  return R;
}

/* ---------- отрисовка ---------- */
function lay(){const s=Math.min(VIEW/W.width,VIEW/W.height);return{s,ox:(VIEW-W.width*s)/2,oy:(VIEW-W.height*s)/2}}
function paintView(g){
  g.fillStyle=COL.sunken;g.fillRect(0,0,VIEW,VIEW);
  if(!W){g.fillStyle=COL.text;g.font='13px '+MONO;g.textAlign='center';g.fillText('Нажмите «Загрузить» или перетащите фото сюда',VIEW/2,VIEW/2);g.textAlign='left';return}
  const L=lay(),h=W.height*L.s;
  g.imageSmoothingQuality='high';g.drawImage(W,L.ox,L.oy,W.width*L.s,h);
  g.fillStyle='rgba(0,0,0,.18)';g.fillRect(0,L.oy+h*(1-EYE_MAX/100),VIEW,h*(EYE_MAX-EYE_MIN)/100);
  if(LN){
    const Y=v=>L.oy+v*L.s,X=v=>L.ox+v*L.s,hl=(y,col)=>{g.beginPath();g.moveTo(0,y);g.lineTo(VIEW,y);g.lineWidth=3.5;g.strokeStyle='rgba(255,255,255,.9)';g.stroke();g.lineWidth=1.5;g.strokeStyle=col;g.stroke()};   // тёмная подложка — линии видны и на белом фоне
    g.setLineDash([3,4]);g.beginPath();g.moveTo(X(LN.cx),0);g.lineTo(X(LN.cx),VIEW);g.lineWidth=3.4;g.strokeStyle='rgba(255,255,255,.9)';g.stroke();g.lineWidth=1.4;g.strokeStyle=COL.axis;g.stroke();g.setLineDash([]);
    hl(Y(LN.top),COL.top);hl(Y(LN.chin),COL.chin);hl(Y(LN.eye),COL.eye);
  }
}
function draw(){c.setTransform(2,0,0,2,0,0);paintView(c)}
function sync(){
  ['#rS','#rL','#rR','#rZ'].forEach(s=>$(s).disabled=!W0||cropped||busy);
  const hn=$('#hint');hn.textContent=W&&hintOn?'Перетаскивайте линии: красная — макушка, чёрная — подбородок, зелёная — глаза, пунктир — ось лица':'';hn.hidden=!hn.textContent;
  const b=$('#banner');b.hidden=!res;
  const bad=!!res&&res.some(r=>r.s=='bad');
  $('#bEnh').hidden=!(busy||bad);$('#bEnh').disabled=busy;$('#bEnh').textContent=busy?'Исправляем…':'Исправить';
  let nx='';   // какая кнопка — следующий шаг: загрузили → «Обрезать» → «Проверить» → «Сохранить» (или «Исправить», если есть ошибки)
  if(W&&!busy)nx=!res?(cropped?'bCheck':'bCrop'):bad?'bEnh':cropped?'bSave':'bCrop';
  ['bCrop','bCheck','bSave','bEnh'].forEach(i=>$('#'+i).classList.toggle('nx',i==nx));
  $('#bLoad').classList.toggle('nx',!W&&!busy);   // до загрузки фото главный шаг — «Загрузить»
  $('#bCrop').classList.toggle('dim',cropped);   // уже обрезано: кнопка бледная, но нажать можно
  ['#bLoad','#bCrop','#bCheck','#bSave','#bClear'].forEach(s=>$(s).disabled=busy);
  if(res){const bad=res.some(r=>r.s=='bad');b.className=bad?'bad':'good';b.textContent=bad?'Фото не соответствует требованиям':'Фото соответствует требованиям'}
  $('#list').innerHTML=LAB.map((l,i)=>{const r=res&&res[i];return`<li title="${r&&r.t||''}"><span class="ic ${r?r.s:''}"></span><span>${l}</span><span>${r?r.v:''}</span></li>`}).join('');
  draw();
}

/* ---------- линии ---------- */
function toImg(e){const r=cv.getBoundingClientRect(),L=lay(),vx=(e.clientX-r.left)*VIEW/r.width,vy=(e.clientY-r.top)*VIEW/r.height;return{x:(vx-L.ox)/L.s,y:(vy-L.oy)/L.s,vx,vy}}
function findEye(cx,ey,d,sd){   // самое тёмное пятно (зрачок/радужка) рядом с линией глаз
  const w=Math.round(.7*d),h=Math.round(.28*d),xa=Math.round(sd<0?cx-.85*d:cx+.15*d),ya=Math.round(ey-.14*d);
  if(xa<0||ya<0||xa+w>W.width||ya+h>W.height||w<8||h<4)return null;
  const D=px(xa,ya,w,h),S=new Float64Array((w+1)*(h+1));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)S[(y+1)*(w+1)+x+1]=lum(D,(y*w+x)*4)+S[y*(w+1)+x+1]+S[(y+1)*(w+1)+x]-S[y*(w+1)+x];
  const r=Math.max(2,Math.round(.05*d));let best=1e12,bx=w/2,by=h/2;
  for(let y=r;y<h-r;y++)for(let x=r;x<w-r;x++){
    const v=S[(y+r+1)*(w+1)+x+r+1]-S[(y-r)*(w+1)+x+r+1]-S[(y+r+1)*(w+1)+x-r]+S[(y-r)*(w+1)+x-r];
    if(v<best){best=v;bx=x;by=y}}
  return{x:xa+bx,y:ya+by};
}
function setP(){   // из линий получаем 4 точки: макушка, подбородок, левый и правый глаз
  if(!W||!LN)return;
  const H=LN.chin-LN.top,d=Math.max(12,.3*H);
  let a={x:LN.cx-d/2,y:LN.eye},b={x:LN.cx+d/2,y:LN.eye};
  if(H>40){
    const ea=findEye(LN.cx,LN.eye,d,-1),eb=findEye(LN.cx,LN.eye,d,1);
    if(ea&&eb&&Math.abs(Math.atan2(eb.y-ea.y,eb.x-ea.x))<.2){const dy=(eb.y-ea.y)/2;a={x:ea.x,y:LN.eye-dy};b={x:eb.x,y:LN.eye+dy}}
  }
  P=[{x:LN.cx,y:LN.top},{x:LN.cx,y:LN.chin},a,b];
}
function hit(q){
  const L=lay();let best=null,bd=9;
  [['top','y'],['chin','y'],['eye','y'],['cx','x']].forEach(([k,ax])=>{
    const dd=Math.abs(ax=='y'?L.oy+LN[k]*L.s-q.vy:L.ox+LN[k]*L.s-q.vx);
    if(dd<bd){bd=dd;best=k}});
  return best;
}
cv.onpointerdown=e=>{if(!W||!LN||e.button||busy)return;drag=hit(toImg(e));if(drag){hintOn=false;if(drag=='cx')cxUser=true;cv.setPointerCapture(e.pointerId);sync()}};
cv.onpointermove=e=>{
  if(!W||!LN)return;const q=toImg(e);
  if(!drag){const k=hit(q);cv.style.cursor=!k?'default':k=='cx'?'ew-resize':'ns-resize';return}
  LN[drag]=drag=='cx'?Math.min(W.width,Math.max(0,q.x)):Math.min(W.height,Math.max(0,q.y));
  res=null;setP();sync();
};
cv.onpointerup=()=>drag=null;
cv.oncontextmenu=e=>e.preventDefault();

/* ---------- обрезка ---------- */
const safe=n=>n.replace(/\.[^.]*$/,'').replace(/[^A-Za-z0-9_-]+/g,'_')||'photo';
function sharpen(o,a,rad){   // нерезкая маска: orig + a*(orig - blur)
  if(!a)return;
  const N=o.width,g=o.getContext('2d'),b=document.createElement('canvas');b.width=b.height=N;
  const bg=b.getContext('2d');bg.filter=`blur(${rad}px)`;bg.drawImage(o,0,0);
  const A=g.getImageData(0,0,N,N),B=bg.getImageData(0,0,N,N);
  for(let i=0;i<A.data.length;i+=4)for(let c=0;c<3;c++){const v=A.data[i+c]+a*(A.data[i+c]-B.data[i+c]);A.data[i+c]=v<0?0:v>255?255:v}
  g.putImageData(A,0,0);
}
async function jpeg(o){
  let b;
  for(let q=JPEG_QMAX;q>=.4;q-=.02){b=await new Promise(r=>o.toBlob(r,'image/jpeg',Math.min(1,q)));if(b.size<=MAX_KB*1024-10000)break}
  const u=new Uint8Array(await b.arrayBuffer()),t='image/jpeg';
  if(u[2]==0xFF&&u[3]==0xE0&&u[6]==0x4A){u.set([1,OUT_DPI>>8,OUT_DPI&255,OUT_DPI>>8,OUT_DPI&255],13);return new Blob([u],{type:t})}   // OUT_DPI
  return new Blob([u.slice(0,2),new Uint8Array([255,224,0,16,74,70,73,70,0,1,1,1,OUT_DPI>>8,OUT_DPI&255,OUT_DPI>>8,OUT_DPI&255,0,0]),u.slice(2)],{type:t});
}
function pickFrame(H,fc,ey,iw,ih){   // квадратный кадр: голова ~60%, глаза в допустимой зоне, минимум пустых полей
  let best=null;
  for(let r=(HEAD_MIN+2)/100;r<=(HEAD_MAX-2)/100+.001;r+=.01)for(let e=1-(EYE_MAX-2)/100;e<=1-(EYE_MIN+2)/100+.001;e+=.01){   // r — доля головы, e — глаза от верха кадра
    const S=H/r,l=fc-S/2,tp=ey-e*S,
      ov=Math.max(0,Math.min(l+S,iw)-Math.max(l,0))*Math.max(0,Math.min(tp+S,ih)-Math.max(tp,0)),
      sc=(1-ov/(S*S))*100+(r-.6)**2+(e-.375)**2;
    if(!best||sc<best.sc)best={S,l,tp,sc};
  }
  return best;
}
async function crop(){
  if(!W)return alert('Сначала загрузите фото');
  if(P.length<4)return alert('Отметьте 4 точки: макушку, подбородок, левый и правый глаз');
  let [t,ch,a,b]=P;if(a.x>b.x)[a,b]=[b,a];
  const ex=(a.x+b.x)/2,ey=(a.y+b.y)/2,tilt=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI,
    ang=(!LEVEL||Math.abs(tilt)<LEVEL_MIN_DEG||Math.abs(tilt)>LEVEL_MAX_DEG?0:tilt*LEVEL_STRENGTH)*Math.PI/180;
  const rot=p=>{const dx=p.x-ex,dy=p.y-ey,co=Math.cos(-ang),si=Math.sin(-ang);return{x:ex+dx*co-dy*si,y:ey+dx*si+dy*co}};
  const T=rot(t),C=rot(ch),H=C.y-T.y,fc=cxUser?rot({x:LN.cx,y:ey}).x:ex;   // fc — центр кадра: ось лица, если её двигали, иначе середина глаз
  if(H<=10)return alert('Подбородок должен быть ниже макушки');
  if(!cropped)PRE={LN:{...LN},P:P.map(q=>({...q})),cx:cxUser,name:M.name};   // чтобы улучшение могло вернуться к оригиналу
  const iw=W.width,ih=W.height,hp=H/ih,ep=(ih-ey)/ih;
  // готовое фото нужного размера и пропорций — не пересэмплируем
  const keep=KEEP_READY&&(cropped||!M.enh)&&iw==ih&&iw>=lim().min&&iw<=lim().max&&hp>=(HEAD_MIN+1)/100&&hp<=(HEAD_MAX-1)/100&&ep>=(EYE_MIN+1)/100&&ep<=(EYE_MAX-1)/100&&Math.abs(ang)<.018;
  const best=keep?{S:iw,l:0,tp:0}:pickFrame(H,fc,ey,iw,ih);
  const S=best.S,left=best.l,top=best.tp,N=keep?iw:lim().out,k=N/S;
  const o=document.createElement('canvas');o.width=o.height=N;const x=o.getContext('2d');
  const bd=px(0,0,iw,Math.max(2,ih*.04));let r0=0,g0=0,b0=0;
  for(let i=0;i<bd.length;i+=4){r0+=bd[i];g0+=bd[i+1];b0+=bd[i+2]}
  const n0=bd.length/4;
  x.fillStyle=`rgb(${r0/n0|0},${g0/n0|0},${b0/n0|0})`;x.fillRect(0,0,N,N);x.imageSmoothingQuality='high';
  x.scale(k,k);x.translate(-left,-top);x.translate(ex,ey);x.rotate(keep?0:-ang);x.translate(-ex,-ey);x.drawImage(W,0,0);if(!keep)sharpen(o,SHARPEN,SHARPEN_RADIUS);
  const mp=[t,ch,a,b].map(p=>{const r=rot(p);return{x:(r.x-left)*k,y:(r.y-top)*k}});
  LN={top:mp[0].y,chin:mp[1].y,eye:(mp[2].y+mp[3].y)/2,cx:(fc-left)*k};cxUser=false;
  W=o;setP();const blob=await jpeg(o);
  M={name:safe(M.name)+'_dv.jpg',bytes:await blob.arrayBuffer(),size:blob.size,dates:M.dates,user:M.user,mod:M.mod,enh:M.enh,blob};
  cropped=true;res=null;sync();
}

/* ---------- проверка ---------- */
const px=(x,y,w,h)=>{x=Math.max(0,Math.round(x));y=Math.max(0,Math.round(y));w=Math.max(1,Math.min(W.width-x,Math.round(w)));h=Math.max(1,Math.min(W.height-y,Math.round(h)));return W.getContext('2d').getImageData(x,y,w,h).data};
const lum=(d,i)=>.299*d[i]+.587*d[i+1]+.114*d[i+2];
const meanL=d=>{let s=0;for(let i=0;i<d.length;i+=4)s+=lum(d,i);return s/(d.length/4)};
function eyeOpen(e,d){const D=px(e.x-.22*d,e.y-.1*d,.44*d,.2*d),m=meanL(D);let k=0;for(let i=0;i<D.length;i+=4)if(lum(D,i)<m*.55)k++;return k/(D.length/4)>=.09}
function redEye(e,d){const r=.07*d,D=px(e.x-r,e.y-r,2*r,2*r);let k=0;for(let i=0;i<D.length;i+=4)if(D[i]>110&&D[i]>1.9*D[i+1]&&D[i]>1.9*D[i+2])k++;return k/(D.length/4)>.2}
function bgStats(){
  const w=W.width,h=W.height,s=Math.round(Math.max(2,h*BG_EDGE));
  let n=0,r=0,g=0,b=0,l=0,l2=0,clip=0;
  for(const D of [px(0,0,w,s),px(0,0,s,h*BG_SIDE_H),px(w-s,0,s,h*BG_SIDE_H)])for(let i=0;i<D.length;i+=4){
    const L=lum(D,i);n++;r+=D[i];g+=D[i+1];b+=D[i+2];l+=L;l2+=L*L;if(Math.min(D[i],D[i+1],D[i+2])>=254)clip++}
  const m=l/n;return{lum:m,std:Math.sqrt(Math.max(0,l2/n-m*m)),spread:Math.max(r,g,b)/n-Math.min(r,g,b)/n,clip:clip/n};
}
function earShadow(ex,ey,H){   // тень на фоне рядом с головой (на уровне ушей): нейтрально-серые участки темнее чистого фона
  const x0=Math.max(0,Math.round(ex-.8*H)),x1=Math.min(W.width,Math.round(ex+.8*H)),y0=Math.max(0,Math.round(ey-.05*H)),y1=Math.min(W.height,Math.round(ey+.4*H));
  const w=x1-x0,h=y1-y0;if(w<20||h<10||H<20)return null;
  const D=px(x0,y0,w,h),st=Math.max(1,Math.round(H/150)),gw=Math.floor(w/st),gh=Math.floor(h/st),cell=new Float32Array(gw*gh).fill(-1),Ls=[];
  for(let gy=0;gy<gh;gy++)for(let gx=0;gx<gw;gx++){
    const x=gx*st,y=gy*st;if(Math.abs(x+x0-ex)<.26*H)continue;   // середину лица пропускаем
    const i=(y*w+x)*4,r=D[i],g=D[i+1],b=D[i+2],l=lum(D,i);
    if(Math.max(r,g,b)-Math.min(r,g,b)<22&&l>110){cell[gy*gw+gx]=l;Ls.push(l)}   // нейтральный и не тёмный = фон
  }
  if(Ls.length<50)return null;
  Ls.sort((p,q)=>p-q);const R=Ls[Math.floor(Ls.length*.85)],lo=R*.6,hi=R*(1-EAR_SHADOW_DROP);
  const f=new Uint8Array(gw*gh);for(let i=0;i<f.length;i++)f[i]=cell[i]>=lo&&cell[i]<hi?1:0;
  let cnt=0;
  for(let y=1;y<gh-1;y++)for(let x=1;x<gw-1;x++){   // только «толстые» пятна: тонкая кромка волос не считается
    let ok=1;for(let dy=-1;dy<=1&&ok;dy++)for(let dx=-1;dx<=1;dx++)if(!f[(y+dy)*gw+x+dx]){ok=0;break}
    cnt+=ok;
  }
  return{frac:cnt/Ls.length,R};
}
let bgOff=false;
function pickDate(ds,mod){
  const ok=s=>{const t=Date.parse(s);return t>=Date.UTC(MIN_YEAR,0,1)&&t<=Date.now()+864e5};   // отбрасываем заглушки (2000 г. и т.п.) и будущее
  const ex=(ds||[]).map(s=>s.replace(/:/g,'-')).filter(ok).sort().pop();
  if(ex)return{d:ex,src:'EXIF'};
  const m=isFinite(mod)&&mod>0?new Date(mod).toISOString().slice(0,10):'';
  return m&&ok(m)?{d:m,src:'дата изменения файла'}:{d:null};
}
async function check(){
  const I=info(M.bytes),w=W.width,h=W.height,sc=!$('#mPho').checked,R=[];
  const add=(v,ok,warn)=>R.push({v,s:warn?'warn':ok?'ok':'bad'}),yn=(b,t='Да',f='Нет')=>b?t:f;
  const [t,ch,A,B]=P,a=A.x<B.x?A:B,b=A.x<B.x?B:A,d=Math.hypot(b.x-a.x,b.y-a.y),ex=(a.x+b.x)/2,ey=(a.y+b.y)/2;
  const headPct=(ch.y-t.y)/h*100,eyeBot=h-ey,eyePct=eyeBot/h*100,ang=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
  const cx=cxUser?(ex+(t.x+ch.x)/2)/2:ex,ratio=w*h*3/M.size,dp=I.dpi;
  add(w+' px',w>=lim().min&&w<=lim().max);
  add(h+' px',h>=lim().min&&h<=lim().max&&w==h);
  add(Math.round(M.size/1024)+' KB',M.size<=MAX_KB*1024);
  add(Math.round(ratio)+' : 1',ratio<=MAX_RATIO);
  add(dp?dp[0]+' dpi':'н/д',dp&&dp[0]>=DPI_MIN,!dp);
  add(dp?dp[1]+' dpi':'н/д',dp&&dp[1]>=DPI_MIN,!dp);
  add(Math.round(h-t.y)+' px',t.y>=0);
  add(Math.round(h-ch.y)+' px',ch.y<=h&&ch.y>t.y);
  add(Math.round(headPct)+' %',headPct>=HEAD_MIN&&headPct<=HEAD_MAX);
  add(Math.round(eyeBot)+' px',eyeBot>0&&eyeBot<h);
  add(Math.round(eyePct)+' %',eyePct>=EYE_MIN&&eyePct<=EYE_MAX);
  add(yn(eyeOpen(a,d)&&eyeOpen(b,d)),eyeOpen(a,d)&&eyeOpen(b,d));
  const re=redEye(a,d)||redEye(b,d);add(yn(re,'Да','Нет'),!re);
  const off=Math.abs(ex-(t.x+ch.x)/2)/d,turn=Math.abs(ang)>TILT_MAX_DEG||(cxUser&&off>TURN_MAX);add(yn(turn),!turn);
  R[R.length-1].t=`наклон линии глаз ${ang.toFixed(1)}° (порог ${TILT_MAX_DEG}°)`+(cxUser?`; смещение оси от середины глаз ${(off*100).toFixed(0)}% (порог ${TURN_MAX*100}%)`:'; ось лица не двигали — поворот не оценивается');
  add(yn(Math.abs(cx-w/2)/w<=.05),Math.abs(cx-w/2)/w<=.05);
  const lt=meanL(px(ex-.6*d,ey+.15*d,.55*d,.6*d)),rt=meanL(px(ex+.05*d,ey+.15*d,.55*d,.6*d)),fsh=Math.min(lt,rt)/Math.max(lt,rt)<.72,es=earShadow(ex,ey,ch.y-t.y),esh=!!es&&es.frac>EAR_SHADOW_AREA;
  add(yn(fsh),!fsh);
  R[R.length-1].t=`яркость сторон лица ${(Math.min(lt,rt)/Math.max(lt,rt)*100).toFixed(0)}% (порог ≥72%)`;
  add(I.fmt,I.fmt=='JPEG');
  const bad=/Display P3|Adobe RGB|ProPhoto|2020|Wide/i.test(I.icc);add(bad?'не sRGB':'sRGB',!bad);
  add(I.bits?I.bits+' bit':'н/д',I.bits==24,!I.bits);
  if(bgOff){for(let i=0;i<4;i++)R.push({v:'—',s:'na'})}
  else{
    const g=bgStats();
    const even=g.std<=BG_STD_MAX&&!esh;   // тень у головы (за ушами) тоже делает фон неоднородным
    add(yn(even),even);
    add(yn(g.spread<=BG_SPREAD_MAX),g.spread<=BG_SPREAD_MAX);
    add(yn(g.lum>=BG_LUM_MIN),g.lum>=BG_LUM_MIN);
    const fake=g.clip>BG_CLIP_MAX;   // порог «засветки»: доля полностью белых пикселей фона
    add(sc?'н/п':yn(fake),sc||!fake);
    [`разброс яркости ${g.std.toFixed(1)} (порог ≤${BG_STD_MAX}); тень у головы: `+(es?`${(es.frac*100).toFixed(1)}% (порог ≤${EAR_SHADOW_AREA*100}%)`:'не оценена'),`разброс цвета ${g.spread.toFixed(1)} (порог ≤${BG_SPREAD_MAX})`,`яркость ${g.lum.toFixed(0)} из 255 (порог ≥${BG_LUM_MIN})`,`доля белого ${(g.clip*100).toFixed(1)}% (порог ≤${BG_CLIP_MAX*100}%)`].forEach((t,i)=>R[R.length-4+i].t=t);   // подсказка при наведении на строку
  }
  const dg=`в метаданных: ${(M.dates||[]).join(', ')||'нет'}; дата файла: ${isFinite(M.mod)&&M.mod>0?new Date(M.mod).toISOString().slice(0,10):'нет'}`;
  let pd=M.user?{d:M.user,src:'введена вручную'}:pickDate(M.dates,M.mod);
  if(!pd.d&&M.enh)pd={d:M.enh,src:'дата улучшения фото (в оригинале даты нет)'};
  if(sc)add('н/п',true);
  else if(!pd.d){add('нет',false,true);R[R.length-1].t='Дата не найдена ('+dg+'). Клик — ввести вручную'}
  else{const age=(Date.now()-Date.parse(pd.d))/864e5,fresh=age>=-1&&age<=MAX_AGE_DAYS;add(pd.d,fresh);R[R.length-1].t='Источник: '+pd.src+' ('+dg+'). Клик — ввести вручную'}
  add(yn(/^[A-Za-z0-9_.\-]{1,64}\.jpe?g$/i.test(M.name)),/^[A-Za-z0-9_.\-]{1,64}\.jpe?g$/i.test(M.name));
  res=R;sync();
}
$('#bCrop').onclick=crop;
$('#bCheck').onclick=()=>{if(!W)return alert('Сначала загрузите фото');if(P.length<4)return alert('Отметьте 4 точки: макушку, подбородок, левый и правый глаз');check()};
['mLot','mPho'].forEach(i=>$('#'+i).onchange=()=>{if(res&&!busy)check()});

/* ---------- улучшение фото (OpenRouter через сервер) ---------- */
async function enhance(){
  if(!W||busy)return;
  busy=true;sync();
  try{
    // если фото уже обрезано — берём исходник (W0 с поворотом) и его линии, а не уменьшенную копию
    const back=cropped&&PRE,src=back?rotated():W,L0=back?PRE.LN:LN,PP=back?PRE.P:P,cxu=back?PRE.cx:cxUser;
    let [t,ch,a,b]=PP;if(a.x>b.x)[a,b]=[b,a];
    const ex=(a.x+b.x)/2,ey=(a.y+b.y)/2,H=ch.y-t.y,fc=cxu?L0.cx:ex;
    if(H<=10)throw new Error('подбородок должен быть ниже макушки');
    const iw=src.width,ih=src.height,f=pickFrame(H,fc,ey,iw,ih);
    const N=Math.max(64,Math.min(Math.round(f.S),ENH_SRC)),k=N/f.S;   // не увеличиваем: если область меньше 1200 px, остаётся как есть
    const o=document.createElement('canvas');o.width=o.height=N;const x=o.getContext('2d');
    const bd=src.getContext('2d').getImageData(0,0,iw,Math.max(2,Math.round(ih*.04))).data;let r0=0,g0=0,b0=0;
    for(let i=0;i<bd.length;i+=4){r0+=bd[i];g0+=bd[i+1];b0+=bd[i+2]}
    const n0=bd.length/4;x.fillStyle=`rgb(${r0/n0|0},${g0/n0|0},${b0/n0|0})`;x.fillRect(0,0,N,N);   // поля за краем исходника — цвет фона сверху
    x.imageSmoothingQuality='high';x.scale(k,k);x.translate(-f.l,-f.tp);x.drawImage(src,0,0);
    const body=await new Promise(r=>o.toBlob(r,'image/png'));
    const rs=await fetch(ENH_URL,{method:'POST',headers:{'Content-Type':'image/png'},body});
    if(!rs.ok){let m=rs.statusText;try{m=(await rs.json()).detail||m}catch(e){}throw new Error(m)}
    const out=await rs.blob(),bmp=await createImageBitmap(out),n=document.createElement('canvas');
    n.width=bmp.width;n.height=bmp.height;n.getContext('2d').drawImage(bmp,0,0);
    const kx=n.width/N,ky=n.height/N,ln=v=>(v-f.tp)*k*ky;   // линии в координатах вырезки, затем под фактический размер ответа
    LN={top:ln(L0.top),eye:ln(L0.eye),chin:ln(L0.chin),cx:(fc-f.l)*k*kx};
    const day=new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
    M={...M,name:back?PRE.name:M.name,bytes:await out.arrayBuffer(),size:out.size,blob:undefined,enh:day};
    W0=W=n;cropped=false;rotDeg=0;setRotUI();cxUser=false;   // улучшенный кадр — новый «оригинал», дальше «Обрезать» и «Проверить»
    res=null;hintOn=false;setP();
    await crop();   // кадр уже собран вокруг головы — сразу финальное уменьшение; остаётся нажать «Проверить»
  }catch(e){alert('Не удалось улучшить фото: '+e.message)}
  finally{busy=false;sync()}
}
$('#bEnh').onclick=enhance;

/* ---------- сохранение (JPEG + отчёт JPEG) ---------- */
const dl=(b,n)=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3e3)};
function ico(g,x,y,s){   // квадратный маркер статуса (без скруглений)
  const c=COL[s];g.strokeStyle=c;g.lineWidth=2;g.strokeRect(x-6.5,y-6.5,13,13);g.lineWidth=1.8;g.beginPath();
  if(s=='ok'){g.moveTo(x-3.5,y);g.lineTo(x-1,y+3);g.lineTo(x+3.5,y-3)}
  else if(s=='bad'){g.moveTo(x-3,y-3);g.lineTo(x+3,y+3);g.moveTo(x+3,y-3);g.lineTo(x-3,y+3)}
  else if(s=='na'){g.moveTo(x-3,y);g.lineTo(x+3,y)}
  else{g.moveTo(x,y-3.5);g.lineTo(x,y+.5);g.moveTo(x,y+3);g.lineTo(x,y+3.6)}
  g.stroke();
}
function reportBlob(){
  const o=document.createElement('canvas');o.width=1520;o.height=1200;const g=o.getContext('2d');g.scale(2,2);
  g.fillStyle=COL.bg;g.fillRect(0,0,760,600);
  g.textAlign='left';g.fillStyle=COL.text;g.font='900 22px '+HEAD;g.fillText('ПРОВЕРКА ФОТО',10,29);
  const w1=g.measureText('ПРОВЕРКА ФОТО   ').width;g.font='13px '+BODY;g.fillStyle=COL.muted;g.fillText('Виза и лотерея Green Card',10+w1,29);
  g.fillStyle=COL.text;g.fillRect(0,36,760,3);
  g.save();g.translate(8,44);g.beginPath();g.rect(0,0,VIEW,VIEW);g.clip();paintView(g);
  const bad=res.some(r=>r.s=='bad'),col=bad?COL.bad:COL.ok;
  g.fillStyle='#fff';g.strokeStyle=col;g.lineWidth=3;g.beginPath();g.rect(18,VIEW-68,412,46);g.fill();g.stroke();
  g.fillStyle=col;g.font='900 15px '+HEAD;g.textAlign='center';g.fillText(bad?'Фото не соответствует требованиям':'Фото соответствует требованиям',224,VIEW-40);g.restore();
  g.strokeStyle=COL.text;g.lineWidth=4;g.strokeRect(6,42,VIEW+4,VIEW+4);
  g.textAlign='left';g.fillStyle=COL.muted;g.font='10px '+MONO;
  g.fillText(M.name+'  |  проверено: '+new Date().toLocaleString('ru-RU')+'  |  '+($('#mLot').checked?'лотерея':'виза')+', '+($('#mPho').checked?'фото':'скан'),8,514);
  g.fillStyle='#fff';g.strokeStyle=COL.text;g.lineWidth=3;g.beginPath();g.rect(465.5,45.5,285,497);g.fill();g.stroke();
  LAB.forEach((l,i)=>{const y=60+i*18.6;ico(g,486,y,res[i].s);g.font='12px '+BODY;g.fillStyle=COL.text;g.fillText(l,501,y+4);g.font='11px '+MONO;g.fillStyle=COL.text;g.fillText(res[i].v,675,y+4);
    g.strokeStyle='#CCCCCC';g.lineWidth=1;g.beginPath();g.moveTo(477,y+9.3);g.lineTo(741,y+9.3);g.stroke()});
  g.strokeStyle=COL.text;g.lineWidth=3;g.beginPath();g.moveTo(467,516.5);g.lineTo(750,516.5);g.stroke();
  const cb=(x,y,l,on)=>{g.strokeStyle=COL.text;g.lineWidth=2.5;g.strokeRect(x+1,y-6,13,13);if(on){g.fillStyle=COL.text;g.fillRect(x+1,y-6,13,13);g.strokeStyle='#fff';g.lineWidth=2;g.beginPath();g.moveTo(x+4,y);g.lineTo(x+7,y+3);g.lineTo(x+12,y-3);g.stroke()}
    g.fillStyle=COL.text;g.font='600 12px '+BODY;g.fillText(l,x+22,y+4)};
  cb(480,530,'Лотерея',$('#mLot').checked);cb(600,530,'Фото',$('#mPho').checked);
  return new Promise(r=>o.toBlob(r,'image/jpeg',.93));
}
$('#bSave').onclick=async()=>{
  if(!W)return alert('Сначала загрузите фото');
  if(!cropped)return alert('Сначала нажмите «Обрезать» — сохраняется обрезанное фото');
  if(P.length<4)return alert('Отметьте точки');
  if(!res)await check();
  const base=safe(M.name).replace(/_dv$/,'');
  dl(M.blob,base+'_dv.jpg');
  setTimeout(async()=>dl(await reportBlob(),base+'_dv_result.jpg'),500);
};

/* ---------- прочее ---------- */
$('#bClear').onclick=()=>{W=W0=M=null;rotDeg=0;setRotUI();P=[];LN=null;res=null;cropped=false;sync()};
$('#ver').onclick=()=>{bgOff=!bgOff;if(res)check()};   // секрет: клик по версии в подвале включает/выключает проверку фона
$('#list').onclick=e=>{
  const li=e.target.closest('li');
  if(!li||!M||[...li.parentNode.children].indexOf(li)!=23)return;
  const v=prompt('Дата съёмки (ГГГГ-ММ-ДД):',M.user||'');
  if(v&&/^\d{4}-\d\d-\d\d$/.test(v)&&!isNaN(Date.parse(v))){M.user=v;if(res)check()}
};
$('#bHelp').onclick=()=>$('#dlg').showModal();$('#dOk').onclick=()=>$('#dlg').close();
sync();
if(document.fonts)document.fonts.ready.then(sync);   // перерисовать canvas, когда подгрузятся шрифты
