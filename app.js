const map = L.map('map', { zoomControl: true }).setView([31.235,121.485], 12.6);
const openStreetMap = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);
const osmHumanitarian = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors, Tiles style by Humanitarian OpenStreetMap Team'
});
L.control.layers({'OpenStreetMap（标准）': openStreetMap, 'OpenStreetMap HOT（备用）': osmHumanitarian}, null, {position:'topright'}).addTo(map);
openStreetMap.on('tileerror', () => {
  if (!map.hasLayer(osmHumanitarian)) osmHumanitarian.addTo(map);
});
map.createPane('roadHighlightPane');
map.getPane('roadHighlightPane').style.zIndex='450';

const colors = {'室内影院':'#315b7d','露天影院':'#b56f4c','草创时期影院':'#c8953d','其他放映场所':'#77558a'};
const storageKey = 'shanghai-cinema-coordinate-corrections-v1';
const styleStorageKey = 'shanghai-cinema-marker-styles-v1';
const customPointsStorageKey = 'shanghai-cinema-custom-points-v1';
const hiddenPointsStorageKey = 'shanghai-cinema-hidden-points-v1';
const contributionDraftStorageKey = 'shanghai-cinema-contribution-drafts-v1';
const contributorNameStorageKey = 'shanghai-cinema-contributor-name-v1';
const collaborationConfig = window.CINEMA_MAP_COLLABORATION || {};
const onlineCollaborationRequested = Boolean(
  collaborationConfig.enabled &&
  collaborationConfig.supabaseUrl &&
  collaborationConfig.supabasePublishableKey
);
let collaborationClient = null;
const basePointIds = new Set(CINEMAS.map(item=>item.id));
let customPoints = [];
let hiddenPointIds = new Set();
let publishedHiddenPointIds = new Set();
let publishedMarkerStyles = {};
let contributionDrafts = [];
try { customPoints = JSON.parse(localStorage.getItem(customPointsStorageKey) || '[]'); } catch (_) { customPoints = []; }
try { hiddenPointIds = new Set(JSON.parse(localStorage.getItem(hiddenPointsStorageKey) || '[]')); } catch (_) { hiddenPointIds = new Set(); }
try { contributionDrafts = JSON.parse(localStorage.getItem(contributionDraftStorageKey) || '[]'); } catch (_) { contributionDrafts = []; }
customPoints.filter(item=>item&&item.id&&!basePointIds.has(item.id)).forEach(item=>CINEMAS.push(item));
const originalCoordinates = Object.fromEntries(CINEMAS.map(item => [item.id, {lat:item.lat, lng:item.lng}]));
let corrections = {};
let markerStyles = {};
try { corrections = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (_) { corrections = {}; }
try { markerStyles = JSON.parse(localStorage.getItem(styleStorageKey) || '{}'); } catch (_) { markerStyles = {}; }
CINEMAS.forEach(item => {
  const saved = corrections[item.id];
  if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng)) {
    item.lat = saved.lat;
    item.lng = saved.lng;
  }
});

const markers = new Map();
const list = document.querySelector('#placeList');
const search = document.querySelector('#search');
const category = document.querySelector('#category');
const shapeFilter = document.querySelector('#shapeFilter');
const onlyMapped = document.querySelector('#onlyMapped');
const filterStatus = document.querySelector('#filterStatus');
const filterResult = document.querySelector('#filterResult');
const resetFilters = document.querySelector('#resetFilters');
const count = document.querySelector('#count');
const selectedPlace = document.querySelector('#selectedPlace');
const editPosition = document.querySelector('#editPosition');
const cancelEdit = document.querySelector('#cancelEdit');
const resetPosition = document.querySelector('#resetPosition');
const exportCorrections = document.querySelector('#exportCorrections');
const markerColor = document.querySelector('#markerColor');
const markerShape = document.querySelector('#markerShape');
const applyMarkerStyle = document.querySelector('#applyMarkerStyle');
const resetMarkerStyle = document.querySelector('#resetMarkerStyle');
const sidebarWidth = document.querySelector('#sidebarWidth');
const sidebarWidthValue = document.querySelector('#sidebarWidthValue');
const listScrollUp = document.querySelector('#listScrollUp');
const listScrollDown = document.querySelector('#listScrollDown');
const roadSearch = document.querySelector('#roadSearch');
const searchRoad = document.querySelector('#searchRoad');
const roadResults = document.querySelector('#roadResults');
const clearRoadHighlight = document.querySelector('#clearRoadHighlight');
const roadSearchStatus = document.querySelector('#roadSearchStatus');
const timelineYearInput = document.querySelector('#timelineYear');
const timelineYearLabel = document.querySelector('#timelineYearLabel');
const timelineMode = document.querySelector('#timelineMode');
const previousYear = document.querySelector('#previousYear');
const nextYear = document.querySelector('#nextYear');
const playTimeline = document.querySelector('#playTimeline');
const timelineSummary = document.querySelector('#timelineSummary');
const newPointName = document.querySelector('#newPointName');
const newPointCategory = document.querySelector('#newPointCategory');
const newPointYear = document.querySelector('#newPointYear');
const newPointAddress = document.querySelector('#newPointAddress');
const newPointIntro = document.querySelector('#newPointIntro');
const startAddPoint = document.querySelector('#startAddPoint');
const cancelAddPoint = document.querySelector('#cancelAddPoint');
const addPointStatus = document.querySelector('#addPointStatus');
const deleteSelectedPoint = document.querySelector('#deleteSelectedPoint');
const restoreDeletedPoints = document.querySelector('#restoreDeletedPoints');
const toggleContributionMode = document.querySelector('#toggleContributionMode');
const collaborationSection = document.querySelector('#collaborationSection');
const collaborationBadge = document.querySelector('#collaborationBadge');
const contributionTools = document.querySelector('#contributionTools');
const contributorName = document.querySelector('#contributorName');
const contributionSource = document.querySelector('#contributionSource');
const contributionNote = document.querySelector('#contributionNote');
const submitPointChange = document.querySelector('#submitPointChange');
const submitNewPoint = document.querySelector('#submitNewPoint');
const submitPointRemoval = document.querySelector('#submitPointRemoval');
const exportContributionDrafts = document.querySelector('#exportContributionDrafts');
const collaborationStatus = document.querySelector('#collaborationStatus');
const contributionCurrentPoint = document.querySelector('#contributionCurrentPoint');
const collabPointName = document.querySelector('#collabPointName');
const collabPointAliases = document.querySelector('#collabPointAliases');
const collabPointCategory = document.querySelector('#collabPointCategory');
const collabPointYear = document.querySelector('#collabPointYear');
const collabPointAddress = document.querySelector('#collabPointAddress');
const collabPointIntro = document.querySelector('#collabPointIntro');
const collabRecordSource = document.querySelector('#collabRecordSource');
let selectedId = null;
let isPickingPosition = false;
let isAddingPoint = false;
let roadHighlightLayer = null;
let roadSearchFeatures = [];
let currentTimelineYear = 1949;
let timelineTimer = null;
let contributionMode = false;

restoreDeletedPoints.disabled=hiddenPointIds.size===0;
exportContributionDrafts.disabled=contributionDrafts.length===0;
contributorName.value=localStorage.getItem(contributorNameStorageKey)||'';

const savedSidebarWidth = Number(localStorage.getItem('shanghai-cinema-sidebar-width'));
if(Number.isFinite(savedSidebarWidth) && savedSidebarWidth >= 280 && savedSidebarWidth <= 560){
  sidebarWidth.value=String(savedSidebarWidth);
  sidebarWidthValue.textContent=`${savedSidebarWidth}px`;
  document.documentElement.style.setProperty('--sidebar-width',`${savedSidebarWidth}px`);
}

[...new Set(CINEMAS.map(x=>x.category))].forEach(c=>category.insertAdjacentHTML('beforeend', `<option value="${c}">${c}</option>`));

function getMarkerStyle(item){
  return markerStyles[item.id] || publishedMarkerStyles[item.id] || {color:colors[item.category]||'#315b7d',shape:'circle'};
}
function escapeHtml(value){
  return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}
function hasCoordinates(item){
  return Number.isFinite(item.lat) && Number.isFinite(item.lng);
}
function markerIcon(item){
  const style=getMarkerStyle(item);
  const shapes={
    circle:`<circle cx="12" cy="12" r="7.5" />`,
    square:`<rect x="4.5" y="4.5" width="15" height="15" rx="1" />`,
    triangle:`<polygon points="12,2.5 21.5,20.5 2.5,20.5" />`,
    diamond:`<polygon points="12,2 22,12 12,22 2,12" />`
  };
  const isNew=Number(item.year)===currentTimelineYear;
  const halo=isNew?'<circle cx="12" cy="12" r="10.5" fill="none" stroke="#d71920" stroke-width="2" />':'';
  return L.divIcon({className:'',html:`<svg width="24" height="24" viewBox="0 0 24 24" style="filter:drop-shadow(0 1px 2px #555)">${halo}<g fill="${style.color}" stroke="#fff" stroke-width="3" stroke-linejoin="round">${shapes[style.shape]||shapes.circle}</g></svg>`,iconSize:[24,24],iconAnchor:[12,12]});
}

function fillContributionFields(item){
  contributionCurrentPoint.textContent=`当前点位：${item.name}`;
  collabPointName.value=item.name||'';
  collabPointAliases.value=item.aliases||'';
  collabPointCategory.value=[...collabPointCategory.options].some(option=>option.value===item.category)?item.category:'其他放映场所';
  collabPointYear.value=item.year||'';
  collabPointAddress.value=item.address||'';
  collabPointIntro.value=item.intro||'';
  collabRecordSource.value=item.source||'';
}
function popup(item){
  const coordinates=hasCoordinates(item)?`${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}`:'尚未定位';
  return `<div class="popup"><h3>${escapeHtml(item.name)}</h3><div class="type">${escapeHtml(item.category)} · ${escapeHtml(item.year || '年代待补')}</div><p><span class="label">历史名称：</span>${escapeHtml(item.aliases || '暂无记录')}</p><p><span class="label">历史地址：</span>${escapeHtml(item.address)}</p><p>${escapeHtml(item.intro)}</p><p class="warning">定位：${escapeHtml(item.precision)}，资料仍需回看原页核验。</p><p class="label">当前坐标：${coordinates}</p><div class="source">${escapeHtml(item.source)}</div></div>`;
}

function setSelected(id, center=false){
  selectedId=id;
  const item=CINEMAS.find(x=>x.id===id);
  if(!item)return;
  const locationText=hasCoordinates(item)?`（${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}）`:'（尚未定位，可点击“在地图上重新选点”）';
  selectedPlace.textContent=`已选择：${item.name}${locationText}${corrections[id]?' · 坐标已修正':''}${markerStyles[id]?' · 样式已修改':''}`;
  selectedPlace.classList.remove('editing');
  editPosition.disabled=false;
  resetPosition.disabled=!corrections[id];
  const style=getMarkerStyle(item);
  markerColor.value=style.color;
  markerShape.value=style.shape;
  markerColor.disabled=false;
  markerShape.disabled=false;
  applyMarkerStyle.disabled=false;
  resetMarkerStyle.disabled=!markerStyles[id];
  deleteSelectedPoint.disabled=false;
  list.querySelectorAll('.place').forEach(n=>n.classList.toggle('active',n.dataset.id===id));
  fillContributionFields(item);
  if(center&&hasCoordinates(item)){
    map.setView([item.lat,item.lng],15);
    markers.get(id)?.openPopup();
  }
}

function setPicking(active){
  if(active&&isAddingPoint)setAdding(false);
  isPickingPosition=active;
  document.querySelector('#map').classList.toggle('map-picking',active);
  editPosition.hidden=active;
  cancelEdit.hidden=!active;
  if(active){
    const item=CINEMAS.find(x=>x.id===selectedId);
    selectedPlace.textContent=`正在调整“${item.name}”：请在地图上点击正确位置`;
    selectedPlace.classList.add('editing');
  } else if(selectedId) setSelected(selectedId);
}

function setAdding(active){
  isAddingPoint=active;
  document.querySelector('#map').classList.toggle('map-picking',active||isPickingPosition);
  startAddPoint.hidden=active;
  cancelAddPoint.hidden=!active;
  addPointStatus.textContent=active?'请在地图上点击新点位的准确位置。':'新增点位先作为本机草稿保存，提交审核后才会公开。';
}

function persistCustomPoints(){
  localStorage.setItem(customPointsStorageKey,JSON.stringify(customPoints));
}

function saveCorrection(item){
  corrections[item.id]={id:item.id,name:item.name,lat:item.lat,lng:item.lng,updatedAt:new Date().toISOString()};
  localStorage.setItem(storageKey,JSON.stringify(corrections));
}

function addMarker(item){
  if(!hasCoordinates(item)||markers.has(item.id)||hiddenPointIds.has(item.id)||publishedHiddenPointIds.has(item.id))return null;
  const marker=L.marker([item.lat,item.lng],{icon:markerIcon(item)}).bindPopup(popup(item),{maxWidth:330});
  marker.on('click',()=>setSelected(item.id));
  marker.addTo(map);
  markers.set(item.id,marker);
  return marker;
}

function addMarkers(){
  CINEMAS.forEach(addMarker);
}

function render(){
  const q=search.value.trim().toLowerCase();
  const cat=category.value;
  const selectedShape=shapeFilter.value;
  const filtered=CINEMAS.filter(x=>{
    if(hiddenPointIds.has(x.id)||publishedHiddenPointIds.has(x.id))return false;
    const text=[x.name,x.aliases,x.address,x.intro].join(' ').toLowerCase();
    const openingYear=Number(x.year);
    const timeMatch=timelineMode.value==='new'?openingYear===currentTimelineYear:openingYear<=currentTimelineYear;
    const itemShape=getMarkerStyle(x).shape;
    const shapeMatch=selectedShape==='all'||itemShape===selectedShape||(selectedShape==='quadrilateral'&&['square','diamond'].includes(itemShape));
    return timeMatch&&shapeMatch&&(!q||text.includes(q))&&(cat==='all'||x.category===cat)&&(!onlyMapped.checked||hasCoordinates(x));
  });
  const activeFilters=[q,cat!=='all',selectedShape!=='all',onlyMapped.checked,currentTimelineYear!==1949,timelineMode.value!=='cumulative'].filter(Boolean).length;
  filterStatus.textContent=activeFilters?`${activeFilters}项已启用`:'全部点位';
  filterResult.textContent=`找到 ${filtered.length} 条，其中 ${filtered.filter(hasCoordinates).length} 条有坐标`;
  count.textContent=`${filtered.length} 个点位`;
  timelineSummary.textContent=timelineMode.value==='new'?`${currentTimelineYear}年：新开影院 ${filtered.length} 个`:`截至${currentTimelineYear}年：地图显示 ${filtered.length} 个点位`;
  list.innerHTML=filtered.map(x=>`<article class="place${x.id===selectedId?' active':''}" data-id="${escapeHtml(x.id)}"><div class="place-title">${escapeHtml(x.name)}${!hasCoordinates(x)?' · 待选点':''}${x.collaborationApproved?' · 协作收录':(!basePointIds.has(x.id)?' · 手动新增':'')}${corrections[x.id]?' · 坐标已修正':''}${markerStyles[x.id]?' · 样式已修改':''}</div><div class="place-meta">${escapeHtml(x.category)} · ${escapeHtml(x.year || '年代待补')}</div><div class="place-meta">${escapeHtml(x.address)}</div><div class="place-status">${escapeHtml(x.precision)} · ${escapeHtml(x.status)}</div></article>`).join('');
  list.querySelectorAll('.place').forEach(el=>el.addEventListener('click',()=>setSelected(el.dataset.id,true)));
  const visibleIds=new Set(filtered.map(x=>x.id));
  CINEMAS.forEach(item=>{
    const marker=markers.get(item.id);
    if(!marker)return;
    marker.setIcon(markerIcon(item));
    if(visibleIds.has(item.id)){
      if(!map.hasLayer(marker))marker.addTo(map);
      marker.setOpacity(timelineMode.value==='cumulative'&&Number(item.year)<currentTimelineYear ? 0.65 : 1);
    }else if(map.hasLayer(marker))map.removeLayer(marker);
  });
}

addMarkers();
render();
[search,category,shapeFilter,onlyMapped].forEach(el=>el.addEventListener('input',render));
resetFilters.addEventListener('click',()=>{
  stopTimeline();
  search.value='';
  category.value='all';
  shapeFilter.value='all';
  onlyMapped.checked=false;
  timelineMode.value='cumulative';
  setTimelineYear(1949);
});
function stopTimeline(){
  if(timelineTimer){clearInterval(timelineTimer);timelineTimer=null;}
  playTimeline.textContent='▶ 播放';
}
function setTimelineYear(year){
  currentTimelineYear=Math.max(1874,Math.min(1949,Number(year)));
  timelineYearInput.value=String(currentTimelineYear);
  timelineYearLabel.textContent=String(currentTimelineYear);
  render();
}
timelineYearInput.addEventListener('input',()=>{stopTimeline();setTimelineYear(timelineYearInput.value);});
timelineMode.addEventListener('change',render);
previousYear.addEventListener('click',()=>{stopTimeline();setTimelineYear(currentTimelineYear-1);});
nextYear.addEventListener('click',()=>{stopTimeline();setTimelineYear(currentTimelineYear+1);});
playTimeline.addEventListener('click',()=>{
  if(timelineTimer){stopTimeline();return;}
  if(currentTimelineYear>=1949)setTimelineYear(1874);
  playTimeline.textContent='Ⅱ 暂停';
  timelineTimer=setInterval(()=>{
    if(currentTimelineYear>=1949){stopTimeline();return;}
    setTimelineYear(currentTimelineYear+1);
  },700);
});
sidebarWidth.addEventListener('input',()=>{
  const width=Number(sidebarWidth.value);
  sidebarWidthValue.textContent=`${width}px`;
  document.documentElement.style.setProperty('--sidebar-width',`${width}px`);
  localStorage.setItem('shanghai-cinema-sidebar-width',String(width));
  map.invalidateSize();
});
function scrollPointList(direction){
  const distance=Math.max(180,Math.round(list.clientHeight*0.8));
  list.scrollBy({top:direction*distance,behavior:'smooth'});
}
listScrollUp.addEventListener('click',()=>scrollPointList(-1));
listScrollDown.addEventListener('click',()=>scrollPointList(1));

function setCollaborationStatus(message,type=''){
  collaborationStatus.textContent=message;
  collaborationStatus.className=`collaboration-status${type?` ${type}`:''}`;
}

function pointSnapshot(item){
  const style=getMarkerStyle(item);
  return {
    id:item.id,
    name:item.name||'',
    aliases:item.aliases||'',
    category:item.category||'其他放映场所',
    year:item.year||'',
    address:item.address||'',
    lat:hasCoordinates(item)?item.lat:null,
    lng:hasCoordinates(item)?item.lng:null,
    precision:item.precision||'待核验',
    status:item.status||'协作建议',
    intro:item.intro||'',
    source:item.source||'',
    markerStyle:{color:style.color,shape:style.shape}
  };
}

function contributionPayload(item){
  const payload=pointSnapshot(item);
  if(selectedId!==item.id)return payload;
  payload.name=collabPointName.value.trim()||item.name;
  payload.aliases=collabPointAliases.value.trim();
  payload.category=collabPointCategory.value;
  payload.year=collabPointYear.value.trim();
  payload.address=collabPointAddress.value.trim();
  payload.intro=collabPointIntro.value.trim();
  payload.source=collabRecordSource.value.trim();
  return payload;
}

function applyPublishedContribution(row){
  const payload=row.payload&&typeof row.payload==='object'?row.payload:{};
  const targetId=row.target_id||payload.id||`COLLAB-${row.id}`;
  if(row.action==='remove'){
    if(targetId)publishedHiddenPointIds.add(targetId);
    return;
  }
  publishedHiddenPointIds.delete(targetId);
  let item=CINEMAS.find(point=>point.id===targetId);
  if(row.action==='add'&&!item){
    item={
      id:targetId,
      name:payload.name||'未命名协作点位',
      aliases:payload.aliases||'',
      category:payload.category||'其他放映场所',
      year:payload.year||'',
      address:payload.address||'地址待补',
      lat:payload.lat!==null&&payload.lat!==''&&Number.isFinite(Number(payload.lat))?Number(payload.lat):null,
      lng:payload.lng!==null&&payload.lng!==''&&Number.isFinite(Number(payload.lng))?Number(payload.lng):null,
      precision:payload.precision||'协作提交，待持续核验',
      status:payload.status||'已通过协作审核',
      intro:payload.intro||'详细资料待补。',
      source:payload.source||row.evidence_url||'协作提交',
      collaborationApproved:true
    };
    CINEMAS.push(item);
    originalCoordinates[item.id]={lat:item.lat,lng:item.lng};
  }else if(item&&row.action==='update'){
    const allowed=['name','aliases','category','year','address','lat','lng','precision','status','intro','source'];
    allowed.forEach(key=>{
      if(Object.prototype.hasOwnProperty.call(payload,key)&&payload[key]!==undefined)item[key]=payload[key];
    });
    if(payload.lat!==null&&payload.lat!==''&&Number.isFinite(Number(payload.lat)))item.lat=Number(payload.lat);
    if(payload.lng!==null&&payload.lng!==''&&Number.isFinite(Number(payload.lng)))item.lng=Number(payload.lng);
    item.collaborationApproved=true;
    originalCoordinates[item.id]={lat:item.lat,lng:item.lng};
  }
  if(item&&payload.markerStyle?.color&&payload.markerStyle?.shape){
    publishedMarkerStyles[item.id]={color:payload.markerStyle.color,shape:payload.markerStyle.shape};
  }
  if(item&&corrections[item.id]){
    item.lat=corrections[item.id].lat;
    item.lng=corrections[item.id].lng;
  }
}

async function loadPublishedContributions(){
  if(!collaborationClient)return;
  setCollaborationStatus('正在同步已通过审核的协作资料……');
  const table=collaborationConfig.table||'cinema_contributions';
  const {data,error}=await collaborationClient
    .from(table)
    .select('id,action,target_id,payload,contributor,evidence_url,note,created_at')
    .eq('status','approved')
    .order('created_at',{ascending:true});
  if(error)throw error;
  publishedHiddenPointIds=new Set();
  publishedMarkerStyles={};
  (data||[]).forEach(applyPublishedContribution);
  markers.forEach(marker=>{if(map.hasLayer(marker))map.removeLayer(marker);});
  markers.clear();
  addMarkers();
  render();
  collaborationBadge.textContent='在线协作';
  setCollaborationStatus(`已连接协作资料库，并载入 ${data?.length||0} 条已审核修改。`,'success');
}

function setContributionMode(active){
  contributionMode=active;
  document.body.classList.toggle('contribution-mode',active);
  toggleContributionMode.classList.toggle('active',active);
  toggleContributionMode.textContent=active?'退出贡献模式':'参与补充资料';
  contributionTools.hidden=!active;
  collaborationSection.open=true;
  if(!active){
    if(isAddingPoint)setAdding(false);
    if(isPickingPosition)setPicking(false);
    setCollaborationStatus(collaborationClient?'当前为查阅模式；已审核资料会自动同步。':'当前为查阅模式；尚未连接在线资料库。');
  }else{
    setCollaborationStatus(collaborationClient?'请先修改、新增或选择一个点位，再提交审核。':'当前未连接在线资料库；提交内容会保存在本机，可导出交给管理员。');
  }
}

async function queueContribution(action){
  const item=CINEMAS.find(point=>point.id===selectedId);
  if(!item){
    setCollaborationStatus('请先在点位列表或地图上选择一条记录。','error');
    return;
  }
  if(action==='add'&&!customPoints.some(point=>point.id===item.id)){
    setCollaborationStatus('“提交新增点位”只用于你刚刚手动新增的点位；现有资料请使用“提交当前点位修改”。','error');
    return;
  }
  if(action!=='remove'&&!collabPointName.value.trim()){
    setCollaborationStatus('点位名称不能为空。','error');
    collabPointName.focus();
    return;
  }
  const note=contributionNote.value.trim();
  if(action==='remove'&&!note){
    setCollaborationStatus('建议删除时，请填写原因和资料依据。','error');
    contributionNote.focus();
    return;
  }
  const contributor=contributorName.value.trim()||'匿名贡献者';
  localStorage.setItem(contributorNameStorageKey,contributorName.value.trim());
  const row={
    action,
    target_id:item.id,
    payload:action==='remove'?{id:item.id,name:item.name}:contributionPayload(item),
    contributor,
    evidence_url:contributionSource.value.trim()||null,
    note:note||null,
    status:'pending'
  };
  [submitPointChange,submitNewPoint,submitPointRemoval].forEach(button=>button.disabled=true);
  try{
    if(collaborationClient){
      const table=collaborationConfig.table||'cinema_contributions';
      const {error}=await collaborationClient.from(table).insert(row);
      if(error)throw error;
      setCollaborationStatus(`“${item.name}”的建议已提交，等待管理员审核。`,'success');
    }else{
      contributionDrafts.push({...row,id:`LOCAL-${Date.now()}`,created_at:new Date().toISOString()});
      localStorage.setItem(contributionDraftStorageKey,JSON.stringify(contributionDrafts));
      exportContributionDrafts.disabled=false;
      collaborationBadge.textContent=`本地草稿 ${contributionDrafts.length}`;
      setCollaborationStatus(`“${item.name}”已保存为本机待提交建议；可导出 JSON 交给管理员。`,'success');
    }
    contributionNote.value='';
    contributionSource.value='';
  }catch(error){
    setCollaborationStatus(`提交失败：${error.message||'在线资料库暂时无法连接'}`,'error');
  }finally{
    [submitPointChange,submitNewPoint,submitPointRemoval].forEach(button=>button.disabled=false);
  }
}

function exportLocalContributionDrafts(){
  if(!contributionDrafts.length)return;
  const payload={schemaVersion:1,project:'上海电影历史地图',exportedAt:new Date().toISOString(),contributions:contributionDrafts};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download='上海电影地图_协作建议.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

async function initializeCollaboration(){
  if(!onlineCollaborationRequested){
    collaborationBadge.textContent=contributionDrafts.length?`本地草稿 ${contributionDrafts.length}`:'本地草稿';
    setContributionMode(false);
    return;
  }
  try{
    if(!window.supabase?.createClient){
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        script.onload=resolve;
        script.onerror=()=>reject(new Error('在线协作组件被浏览器拦截'));
        document.head.appendChild(script);
      });
    }
    collaborationClient=window.supabase.createClient(collaborationConfig.supabaseUrl,collaborationConfig.supabasePublishableKey);
    await loadPublishedContributions();
  }catch(error){
    collaborationBadge.textContent='连接失败';
    setCollaborationStatus(`协作资料库连接失败：${error.message||'请检查配置'}`,'error');
  }
}

toggleContributionMode.addEventListener('click',()=>setContributionMode(!contributionMode));
submitPointChange.addEventListener('click',()=>queueContribution('update'));
submitNewPoint.addEventListener('click',()=>queueContribution('add'));
submitPointRemoval.addEventListener('click',()=>queueContribution('remove'));
exportContributionDrafts.addEventListener('click',exportLocalContributionDrafts);

function clearRoad(){
  if(roadHighlightLayer){map.removeLayer(roadHighlightLayer);roadHighlightLayer=null;}
  clearRoadHighlight.disabled=true;
}

function highlightRoad(feature){
  clearRoad();
  roadHighlightLayer=L.geoJSON(feature,{
    pane:'roadHighlightPane',
    style:{color:'#d71920',weight:8,opacity:.9,lineCap:'round',lineJoin:'round'},
    pointToLayer:(_,latlng)=>L.circle(latlng,{pane:'roadHighlightPane',radius:180,color:'#d71920',weight:5,fillColor:'#e53935',fillOpacity:.2})
  }).addTo(map);
  const bounds=roadHighlightLayer.getBounds();
  if(bounds.isValid())map.fitBounds(bounds.pad(.18),{maxZoom:17});
  clearRoadHighlight.disabled=false;
  const name=feature.properties?.display_name||feature.properties?.name||roadSearch.value.trim();
  const isPoint=feature.geometry?.type==='Point';
  roadSearchStatus.textContent=isPoint?`已定位：${name}。地图服务仅返回中心位置，使用红圈标示。`:`已用红线高亮：${name}`;
  roadSearchStatus.className='road-search-status success';
}

async function findRoad(){
  const query=roadSearch.value.trim();
  if(!query){roadSearchStatus.textContent='请先输入路名。';roadSearchStatus.className='road-search-status error';return;}
  searchRoad.disabled=true;
  roadSearchStatus.textContent='正在上海范围内查找道路……';
  roadSearchStatus.className='road-search-status';
  roadResults.hidden=true;
  try{
    const params=new URLSearchParams({format:'geojson',limit:'8',polygon_geojson:'1',countrycodes:'cn',q:`${query}, 上海市`});
    const response=await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`,{headers:{Accept:'application/geo+json'}});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    const all=data.features||[];
    const roads=all.filter(feature=>{
      const p=feature.properties||{};
      return p.category==='highway'||p.addresstype==='road'||['road','street','residential','primary','secondary','tertiary','trunk'].includes(p.type);
    });
    roadSearchFeatures=roads.length?roads:all;
    if(!roadSearchFeatures.length){
      clearRoad();
      roadSearchStatus.textContent=`没有找到“${query}”。如果是历史路名，请改用对应的现代路名。`;
      roadSearchStatus.className='road-search-status error';
      return;
    }
    roadResults.replaceChildren();
    roadSearchFeatures.forEach((feature,index)=>{
      const option=document.createElement('option');
      option.value=String(index);
      option.textContent=feature.properties?.display_name||feature.properties?.name||`${query}（结果 ${index+1}）`;
      roadResults.appendChild(option);
    });
    roadResults.hidden=roadSearchFeatures.length<2;
    highlightRoad(roadSearchFeatures[0]);
  }catch(error){
    clearRoad();
    roadSearchStatus.textContent='道路查询服务暂时无法连接，请稍后重试。';
    roadSearchStatus.className='road-search-status error';
  }finally{
    searchRoad.disabled=false;
  }
}

searchRoad.addEventListener('click',findRoad);
roadSearch.addEventListener('keydown',event=>{if(event.key==='Enter')findRoad();});
roadResults.addEventListener('change',()=>highlightRoad(roadSearchFeatures[Number(roadResults.value)]));
clearRoadHighlight.addEventListener('click',()=>{
  clearRoad();
  roadSearchStatus.textContent='已清除道路高亮。';
  roadSearchStatus.className='road-search-status';
});
startAddPoint.addEventListener('click',()=>{
  const name=newPointName.value.trim();
  if(!name){
    addPointStatus.textContent='请先填写点位名称。';
    newPointName.focus();
    return;
  }
  if(isPickingPosition)setPicking(false);
  setAdding(true);
});
cancelAddPoint.addEventListener('click',()=>setAdding(false));
editPosition.addEventListener('click',()=>selectedId&&setPicking(true));
cancelEdit.addEventListener('click',()=>setPicking(false));

map.on('click',event=>{
  if(isAddingPoint){
    const item={
      id:`USR-${Date.now()}`,
      name:newPointName.value.trim(),
      aliases:'',
      category:newPointCategory.value,
      year:newPointYear.value.trim(),
      address:newPointAddress.value.trim()||'地址待补',
      lat:Number(event.latlng.lat.toFixed(6)),
      lng:Number(event.latlng.lng.toFixed(6)),
      precision:'手动选点',
      status:'用户在地图中手动新增',
      intro:newPointIntro.value.trim()||'详细资料待补。',
      source:'手动新增点位'
    };
    customPoints.push(item);
    CINEMAS.push(item);
    originalCoordinates[item.id]={lat:item.lat,lng:item.lng};
    persistCustomPoints();
    const marker=addMarker(item);
    setAdding(false);
    newPointName.value='';
    newPointYear.value='';
    newPointAddress.value='';
    newPointIntro.value='';
    setSelected(item.id,true);
    render();
    marker?.openPopup();
    addPointStatus.textContent=`已新增“${item.name}”作为本机草稿；请在“多人协作”中提交审核。`;
    return;
  }
  if(!isPickingPosition||!selectedId)return;
  const item=CINEMAS.find(x=>x.id===selectedId);
  item.lat=Number(event.latlng.lat.toFixed(6));
  item.lng=Number(event.latlng.lng.toFixed(6));
  let marker=markers.get(item.id);
  if(!marker){
    marker=L.marker([item.lat,item.lng],{icon:markerIcon(item)}).bindPopup(popup(item),{maxWidth:330});
    marker.on('click',()=>setSelected(item.id));
    marker.addTo(map);
    markers.set(item.id,marker);
  }else{
    marker.setLatLng([item.lat,item.lng]).setPopupContent(popup(item));
  }
  saveCorrection(item);
  setPicking(false);
  render();
  marker.openPopup();
});

deleteSelectedPoint.addEventListener('click',()=>{
  if(!selectedId)return;
  if(isPickingPosition)setPicking(false);
  if(isAddingPoint)setAdding(false);
  const item=CINEMAS.find(x=>x.id===selectedId);
  if(!item)return;
  const isCustom=!basePointIds.has(item.id);
  const wording=isCustom?'这个手动新增点位会从当前浏览器中删除。':'资料原记录不会被破坏，你可以稍后恢复。';
  if(!window.confirm(`确定删除“${item.name}”吗？\n${wording}`))return;
  const marker=markers.get(item.id);
  if(marker&&map.hasLayer(marker))map.removeLayer(marker);
  if(isCustom){
    markers.delete(item.id);
    customPoints=customPoints.filter(point=>point.id!==item.id);
    const index=CINEMAS.findIndex(point=>point.id===item.id);
    if(index>=0)CINEMAS.splice(index,1);
    delete originalCoordinates[item.id];
    delete corrections[item.id];
    delete markerStyles[item.id];
    persistCustomPoints();
    localStorage.setItem(storageKey,JSON.stringify(corrections));
    localStorage.setItem(styleStorageKey,JSON.stringify(markerStyles));
  }else{
    hiddenPointIds.add(item.id);
    localStorage.setItem(hiddenPointsStorageKey,JSON.stringify([...hiddenPointIds]));
    restoreDeletedPoints.disabled=false;
  }
  selectedId=null;
  selectedPlace.textContent=`已删除“${item.name}”。`;
  deleteSelectedPoint.disabled=true;
  editPosition.disabled=true;
  resetPosition.disabled=true;
  applyMarkerStyle.disabled=true;
  resetMarkerStyle.disabled=true;
  markerColor.disabled=true;
  markerShape.disabled=true;
  render();
});

restoreDeletedPoints.addEventListener('click',()=>{
  const restored=hiddenPointIds.size;
  hiddenPointIds.clear();
  localStorage.setItem(hiddenPointsStorageKey,'[]');
  restoreDeletedPoints.disabled=true;
  CINEMAS.forEach(addMarker);
  render();
  addPointStatus.textContent=`已恢复 ${restored} 个资料点位。`;
});

resetPosition.addEventListener('click',()=>{
  if(!selectedId)return;
  const item=CINEMAS.find(x=>x.id===selectedId);
  const original=originalCoordinates[selectedId];
  item.lat=original.lat;
  item.lng=original.lng;
  delete corrections[selectedId];
  localStorage.setItem(storageKey,JSON.stringify(corrections));
  const marker=markers.get(item.id);
  if(hasCoordinates(item)){
    marker?.setLatLng([item.lat,item.lng]).setPopupContent(popup(item));
    setSelected(selectedId,true);
  }else{
    if(marker){map.removeLayer(marker);markers.delete(item.id);}
    setSelected(selectedId,false);
  }
  render();
});

applyMarkerStyle.addEventListener('click',()=>{
  if(!selectedId)return;
  markerStyles[selectedId]={color:markerColor.value,shape:markerShape.value,updatedAt:new Date().toISOString()};
  localStorage.setItem(styleStorageKey,JSON.stringify(markerStyles));
  const item=CINEMAS.find(x=>x.id===selectedId);
  markers.get(selectedId)?.setIcon(markerIcon(item));
  setSelected(selectedId);
  render();
});

resetMarkerStyle.addEventListener('click',()=>{
  if(!selectedId)return;
  delete markerStyles[selectedId];
  localStorage.setItem(styleStorageKey,JSON.stringify(markerStyles));
  const item=CINEMAS.find(x=>x.id===selectedId);
  markers.get(selectedId)?.setIcon(markerIcon(item));
  setSelected(selectedId);
  render();
});

exportCorrections.addEventListener('click',()=>{
  const coordinateRows=Object.values(corrections);
  const styleRows=Object.entries(markerStyles).map(([id,style])=>({id,name:CINEMAS.find(x=>x.id===id)?.name||'',...style}));
  if(!coordinateRows.length&&!styleRows.length&&!customPoints.length&&!hiddenPointIds.size){selectedPlace.textContent='目前还没有点位修正可以导出。';return;}
  const payload={exportedAt:new Date().toISOString(),coordinateCorrections:coordinateRows,markerStyleCorrections:styleRows,customPoints,hiddenSourcePointIds:[...hiddenPointIds]};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='上海电影地图_点位修正.json';
  a.click();
  URL.revokeObjectURL(url);
});

initializeCollaboration();
