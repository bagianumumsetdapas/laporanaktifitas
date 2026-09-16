const CONFIG = {
  // Gunakan URL Google Sheet yang dibagikan user.
  SHEET_URL: "https://docs.google.com/spreadsheets/d/1nOKzfztcljU4GJg3ekf9LfBN1V2sGi3bFgZTN0DxX1Y/edit?usp=sharing",
  SHEET_NAME: "DB",
  YEAR: 2026,
  UNIT: "Bagian Umum, Protokol dan Komunikasi Pimpinan",
  // URL Web App Apps Script untuk pencatatan Log.
  // Isi setelah Code.gs dideploy sebagai Web App.
  LOG_API_URL: "https://script.google.com/macros/s/AKfycbyFd44Ra230wPktAsQ76N040fk6Vq4m1nh33BNAEP1OafwAcNUisTpaX5TR0xIPmIyr3w/exec"
};

const $ = s => document.querySelector(s);
const state = {employees:[],employee:null,quarter:"",month:"",weeks:[],ttdDataUrl:"",draftKey:""};
const months={III:[["07","Juli"],["08","Agustus"],["09","September"]],IV:[["10","Oktober"],["11","November"],["12","Desember"]]};
document.addEventListener("DOMContentLoaded",init);

async function init(){
  loadTheme(); bind();
  const rows = await loadSheetDirect();
  state.employees = rows;
  populateEmployees();
  if(!rows.length) toast("Data pegawai belum terbaca. Pastikan Sheet DB dapat diakses publik.");
  await restoreDraftIfPossible();
}

function bind(){
  $("#themeBtn").onclick=toggleTheme;
  $("#employeeSelect").onchange=employeeChanged;
  $("#quarterSelect").onchange=quarterChanged;
  $("#monthSelect").onchange=monthChanged;
  $("#continueBtn").onclick=startReport;
  $("#backBtn").onclick=()=>showStep("startStep");
  $("#previewBtn").onclick=previewReport;
  $("#editBtn").onclick=()=>showStep("reportStep");
  $("#printBtn").onclick=async()=>{await writeLog("Cetak");window.print();};
  $("#downloadBtn").onclick=downloadPDF;
  $("#shareBtn").onclick=sharePDF;
  $("#whatsappBtn").onclick=whatsappShare;
}

function sheetId(url){
  const m=String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if(!m) throw new Error("ID Google Sheet tidak ditemukan.");
  return m[1];
}

function loadSheetDirect(){
  return new Promise((resolve)=>{
    let id;
    try{id=sheetId(CONFIG.SHEET_URL)}catch(e){toast(e.message);resolve([]);return}

    const cb="__sheet_cb_"+Date.now()+"_"+Math.random().toString(36).slice(2);
    const script=document.createElement("script");
    const url=`https://docs.google.com/spreadsheets/d/${id}/gviz/tq`;

    const cleanup=()=>{clearTimeout(timer);delete window[cb];script.remove()};
    window[cb]=(response)=>{
      try{
        const table=response.table;
        if(!table || !table.rows) throw new Error("Respons Google Sheet tidak valid.");
        const headers=(table.cols||[]).map(c=>String(c.label||"").trim());
        const idx={};
        headers.forEach((h,i)=>idx[normalizeHeader(h)]=i);

        const required=["no","nama","nip","pangkat_gol","jabatan","lokasi_kerja","rencana_aksi","link_ttd"];
        const missing=required.filter(h=>idx[h]===undefined);
        if(missing.length) throw new Error("Kolom DB belum sesuai: "+missing.join(", "));

        const data=table.rows.map(r=>{
          const c=r.c||[];
          const val=k=>c[idx[k]]?.v==null?"":String(c[idx[k]].v);
          return {
            no:val("no"), nama:val("nama"), nip:val("nip"),
            pangkat_gol:val("pangkat_gol"), jabatan:val("jabatan"),
            lokasi_kerja:val("lokasi_kerja"), rencana_aksi:val("rencana_aksi"),
            link_ttd:val("link_ttd")
          };
        }).filter(x=>x.nama);

        cleanup(); resolve(data);
      }catch(e){cleanup();console.error(e);toast(e.message);resolve([])}
    };

    const query=encodeURIComponent(`select A,B,C,D,E,F,G,H`);
    script.src=`${url}?sheet=${encodeURIComponent(CONFIG.SHEET_NAME)}&tqx=responseHandler:${cb}&tq=${query}&_=${Date.now()}`;
    script.onerror=()=>{cleanup();toast("Google Sheet tidak dapat diakses. Ubah akses menjadi Siapa saja yang memiliki link → Pelihat.");resolve([])};
    document.head.appendChild(script);

    const timer=setTimeout(()=>{cleanup();toast("Koneksi Google Sheet timeout.");resolve([])},15000);
  });
}

function normalizeHeader(v){
  return String(v||"").trim().toLowerCase().replace(/\s+/g,"_");
}

function populateEmployees(){
  const s=$("#employeeSelect");
  s.innerHTML='<option value="">Pilih Nama Pegawai</option>';
  state.employees.forEach(e=>{
    const o=document.createElement("option");o.value=e.no;o.textContent=e.nama;s.appendChild(o);
  });
}

function employeeChanged(){
  state.ttdDataUrl="";
  state.employee=state.employees.find(e=>String(e.no)===String($("#employeeSelect").value))||null;
  if(!state.employee){$("#employeeInfo").classList.add("hidden");return}
  $("#employeeInfo").innerHTML=`<b>${esc(state.employee.nama)}</b><br>NIP: ${esc(state.employee.nip||"-")} &nbsp;•&nbsp; ${esc(state.employee.pangkat_gol||"-")}<br>${esc(state.employee.jabatan||"-")} • ${esc(state.employee.lokasi_kerja||"-")}`;
  $("#employeeInfo").classList.remove("hidden");
  checkExisting();
}
function quarterChanged(){
  state.quarter=$("#quarterSelect").value;
  state.ttdDataUrl="";
  const s=$("#monthSelect");s.disabled=!state.quarter;s.innerHTML='<option value="">Pilih Bulan Lapor</option>';
  (months[state.quarter]||[]).forEach(([num,name])=>{const o=document.createElement("option");o.value=num;o.textContent=`${name} ${CONFIG.YEAR}`;s.appendChild(o)});
  state.month="";$("#existingReport").classList.add("hidden");updateContinue();
}
async function monthChanged(){state.month=$("#monthSelect").value;await checkExisting();updateContinue()}
function updateContinue(){$("#continueBtn").disabled=!(state.employee&&state.quarter&&state.month)}

async function checkExisting(){
  $("#existingReport").classList.add("hidden");
  if(!state.employee||!state.month)return;
  // Tidak perlu mengecek Log untuk dapat membuat laporan.
}

function logApiReady(){
  return !!(CONFIG.LOG_API_URL && !CONFIG.LOG_API_URL.includes("PASTE_APPS_SCRIPT_WEB_APP_URL_HERE"));
}

function writeLog(status="Selesai"){
  if(!logApiReady() || !state.employee || !state.month) return Promise.resolve(false);

  return new Promise(resolve=>{
    const cb="__log_cb_"+Date.now()+"_"+Math.random().toString(36).slice(2);
    const script=document.createElement("script");
    let finished=false;
    let timer;
    const done=(ok)=>{
      if(finished)return;
      finished=true;
      clearTimeout(timer);
      delete window[cb];
      script.remove();
      resolve(ok);
    };

    window[cb]=(res)=>done(!!(res&&res.ok));
    script.onerror=()=>done(false);

    const u=new URL(CONFIG.LOG_API_URL);
    u.searchParams.set("action","writeLog");
    u.searchParams.set("callback",cb);
    u.searchParams.set("no",state.employee.no||"");
    u.searchParams.set("nama",state.employee.nama||"");
    u.searchParams.set("jabatan",state.employee.jabatan||"");
    u.searchParams.set("bulan",`${monthName(state.month)} ${CONFIG.YEAR}`);
    u.searchParams.set("status",status);
    u.searchParams.set("_",Date.now());

    script.src=u.toString();
    document.head.appendChild(script);
    timer=setTimeout(()=>done(false),10000);
  });
}
function startReport(){
  if(!state.employee||!state.month)return;
  state.draftKey=`LAPORAN-${state.employee.no}-${state.month}`;
  state.weeks=Array.from({length:4},(_,i)=>({week:i+1,activity:state.employee.rencana_aksi||"",location:state.employee.lokasi_kerja||"",photo1:"",photo2:""}));
  $("#reportTitle").textContent=`${state.employee.nama} — ${monthName(state.month)} ${CONFIG.YEAR}`;
  renderWeeks();showStep("reportStep");saveDraft();
}
function renderWeeks(){
  const wrap=$("#weeks");wrap.innerHTML="";
  state.weeks.forEach((w,i)=>{
    const card=document.createElement("div");card.className="week-card";
    card.innerHTML=`<div class="week-head"><div class="week-title">Minggu ${roman(w.week)}</div><span class="week-badge">${monthName(state.month)} ${CONFIG.YEAR}</span></div>
      <div class="week-grid">
        <label class="field full"><span>Kegiatan</span><textarea data-i="${i}" data-key="activity" placeholder="Tuliskan kegiatan...">${esc(w.activity)}</textarea></label>
        <label class="field full"><span>Lokasi</span><input data-i="${i}" data-key="location" value="${escAttr(w.location)}" placeholder="Lokasi kegiatan"></label>
        <div class="field full"><span>2 Foto Kegiatan</span><div class="photos">
          ${photoBox(i,1,w.photo1)}${photoBox(i,2,w.photo2)}
        </div></div>
      </div>`;
    wrap.appendChild(card);
  });
  wrap.querySelectorAll("textarea,input[data-key]").forEach(el=>el.addEventListener("input",e=>{
    const i=+e.target.dataset.i;state.weeks[i][e.target.dataset.key]=e.target.value;debouncedSave();updateProgress();
  }));
  wrap.querySelectorAll(".photo-input").forEach(el=>el.addEventListener("change",onPhoto));
  wrap.querySelectorAll(".photo-remove").forEach(el=>el.addEventListener("click",removePhoto));
  updateProgress();
}
function photoBox(i,n,data){
  return `<div class="photo-box">${data?`<img src="${data}" alt="Foto ${i+1}.${n}"><button class="photo-remove" type="button" data-i="${i}" data-n="${n}">×</button>`:`<div class="photo-empty"><b>Foto ${i+1}.${n}</b>Klik untuk memilih foto dari galeri</div>`}<input class="photo-input" type="file" accept="image/*" data-i="${i}" data-n="${n}"></div>`;
}
async function onPhoto(e){
  const file=e.target.files?.[0];if(!file)return;
  const i=+e.target.dataset.i,n=+e.target.dataset.n;showLoading(true,"Memproses foto...");
  try{state.weeks[i][n===1?"photo1":"photo2"]=await compressImage(file);renderWeeks();await saveDraft();toast("Foto tersimpan sementara di perangkat.")}catch(err){console.error(err);toast("Foto gagal diproses.")}finally{showLoading(false)}
}
function removePhoto(e){const i=+e.currentTarget.dataset.i,n=+e.currentTarget.dataset.n;state.weeks[i][n===1?"photo1":"photo2"]="";renderWeeks();saveDraft()}
function compressImage(file,max=1500,quality=.78){
  return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{let w=img.width,h=img.height,s=Math.min(1,max/Math.max(w,h));w=Math.round(w*s);h=Math.round(h*s);const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);URL.revokeObjectURL(url);resolve(c.toDataURL("image/jpeg",quality))};img.onerror=reject;img.src=url})
}
let saveTimer;function debouncedSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveDraft,400)}
async function saveDraft(){if(!state.draftKey)return;try{await idbSet(state.draftKey,{employeeNo:state.employee.no,quarter:state.quarter,month:state.month,weeks:state.weeks,ttdDataUrl:state.ttdDataUrl||""});$("#saveStatus").textContent=`Draft tersimpan ${new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}`}catch(e){console.warn(e)}}
async function restoreDraftIfPossible(){try{const keys=await idbKeys();const key=keys.find(k=>k.startsWith("LAPORAN-"));if(!key)return;const d=await idbGet(key);if(!d)return;const emp=state.employees.find(e=>String(e.no)===String(d.employeeNo));if(!emp)return;if(confirm(`Draft terakhir ditemukan untuk ${emp.nama}, ${monthName(d.month)} ${CONFIG.YEAR}. Lanjutkan draft tersebut?`)){state.employee=emp;state.quarter=d.quarter;state.month=d.month;state.weeks=d.weeks;state.ttdDataUrl=d.ttdDataUrl||"";state.draftKey=key;$("#employeeSelect").value=emp.no;$("#quarterSelect").value=d.quarter;quarterChanged();$("#monthSelect").value=d.month;$("#employeeInfo").innerHTML=`<b>${esc(emp.nama)}</b><br>NIP: ${esc(emp.nip||"-")} &nbsp;•&nbsp; ${esc(emp.pangkat_gol||"-")}<br>${esc(emp.jabatan||"-")} • ${esc(emp.lokasi_kerja||"-")}`;$("#employeeInfo").classList.remove("hidden");renderWeeks();$("#reportTitle").textContent=`${emp.nama} — ${monthName(d.month)} ${CONFIG.YEAR}`;showStep("reportStep")}}catch(e){console.warn(e)}}

function idb(){return new Promise((resolve,reject)=>{const r=indexedDB.open("LaporanAktifitasDB",1);r.onupgradeneeded=()=>r.result.createObjectStore("drafts");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function idbSet(k,v){const db=await idb();return new Promise((res,rej)=>{const t=db.transaction("drafts","readwrite");t.objectStore("drafts").put(v,k);t.oncomplete=res;t.onerror=()=>rej(t.error)})}
async function idbGet(k){const db=await idb();return new Promise((res,rej)=>{const r=db.transaction("drafts").objectStore("drafts").get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idbKeys(){const db=await idb();return new Promise((res,rej)=>{const r=db.transaction("drafts").objectStore("drafts").getAllKeys();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}

function updateProgress(){const done=state.weeks.filter(w=>w.photo1&&w.photo2).length;$("#progressText").textContent=`${done} dari 4 minggu selesai`;$("#progressBar").style.width=`${done/4*100}%`}
async function previewReport(){if(!state.employee||!state.quarter||!state.month){toast("Nama, triwulan, dan bulan wajib dipilih.");showStep("startStep");return}if(state.weeks.some(w=>!w.photo1||!w.photo2)){toast("Setiap minggu wajib memiliki 2 foto.");return}showLoading(true,"Menyiapkan pratinjau...");try{await loadTTD();buildPreview();showStep("previewStep")}finally{showLoading(false)}}
function buildPreview(){
  const p=$("#pdfPreview");p.innerHTML="";const emp=state.employee;
  const chunks=[[0,1],[2,3]];
  chunks.forEach((pair,pi)=>{const page=document.createElement("div");page.className="pdf-page";page.innerHTML=pdfHeader(emp,pi===0);pair.forEach(i=>page.insertAdjacentHTML("beforeend",weekPdf(state.weeks[i],i)));if(pi===1)page.insertAdjacentHTML("beforeend",signatureHtml(emp));page.insertAdjacentHTML("beforeend",`<div class="page-foot"><span>Laporan Aktifitas Pegawai • ${CONFIG.UNIT}</span><span>Halaman ${pi+1}</span></div>`);p.appendChild(page)})
}
function pdfHeader(emp,first){return `<div class="pdf-head"><div class="pdf-logo"><img src="images/Lambang_Kabupaten_Pasuruan.png" alt="Lambang Kabupaten Pasuruan"></div><div class="pdf-title"><h1>LAPORAN AKTIFITAS PEGAWAI</h1><p>${CONFIG.UNIT}</p></div></div>${first?`<div class="ident"><div class="k">Nama</div><div>${esc(emp.nama)}</div><div class="k">NIP</div><div>${esc(emp.nip||"-")}</div><div class="k">Pangkat/Gol</div><div>${esc(emp.pangkat_gol||"-")}</div><div class="k">Jabatan</div><div>${esc(emp.jabatan||"-")}</div><div class="k">Lokasi Kerja</div><div>${esc(emp.lokasi_kerja||"-")}</div><div class="k">Bulan Lapor</div><div>${monthName(state.month)} ${CONFIG.YEAR}</div></div>`:""}`}
function weekPdf(w,i){return `<div class="section-band">MINGGU ${roman(w.week)} • ${monthName(state.month)} ${CONFIG.YEAR}</div><div class="pdf-body-label">Kegiatan</div><div class="pdf-text">${esc(w.activity).replace(/\n/g,"<br>")}</div><div class="pdf-body-label">Lokasi</div><div class="pdf-location">${esc(w.location)}</div><div class="pdf-photos"><div class="pdf-photo"><img src="${w.photo1}" alt="Foto ${i+1}.1"></div><div class="pdf-photo"><img src="${w.photo2}" alt="Foto ${i+1}.2"></div></div>`}
function signatureHtml(emp){const date=lastDayOfMonth(+state.month,CONFIG.YEAR);return `<div class="signature"><div class="city">Pasuruan, ${date}</div>${state.ttdDataUrl?`<img src="${state.ttdDataUrl}" alt="Tanda tangan">`:`<div style="height:28mm"></div>`}<div class="name">${esc(emp.nama)}</div><div>NIP. ${esc(emp.nip||"-")}</div></div>`}

async function loadTTD(){
  if(state.ttdDataUrl||!state.employee?.link_ttd)return;
  const id=driveId(state.employee.link_ttd);
  if(!id)return;
  try{
    if(logApiReady()){
      const data=await fetchDriveImage(id);
      if(data){state.ttdDataUrl=data;return}
    }
  }catch(e){console.warn("Proxy TTD:",e)}
  try{
    state.ttdDataUrl=await driveImageData(id);
  }catch(e){console.warn("TTD fallback:",e)}
}
function driveId(url){
  const m=String(url||"").match(/(?:\/d\/|id=|open\?id=)([a-zA-Z0-9_-]+)/);
  return m?m[1]:"";
}
function fetchDriveImage(id){
  return new Promise((resolve,reject)=>{
    const cb="__img_cb_"+Date.now()+"_"+Math.random().toString(36).slice(2);
    const script=document.createElement("script");
    let timer;
    const done=(value,ok)=>{
      clearTimeout(timer);delete window[cb];script.remove();
      ok?resolve(value):reject(new Error("Gagal mengambil gambar dari Apps Script"));
    };
    window[cb]=(res)=>done(res&&res.ok&&res.dataUrl?res.dataUrl:"",!!(res&&res.ok&&res.dataUrl));
    script.onerror=()=>done("",false);
    const u=new URL(CONFIG.LOG_API_URL);
    u.searchParams.set("action","getDriveImage");
    u.searchParams.set("callback",cb);
    u.searchParams.set("id",id);
    u.searchParams.set("_",Date.now());
    script.src=u.toString();
    document.head.appendChild(script);
    timer=setTimeout(()=>done("",false),15000);
  });
}
function driveImageData(id){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.crossOrigin="anonymous";
    img.onload=()=>{
      try{
        const c=document.createElement("canvas");
        c.width=img.naturalWidth;c.height=img.naturalHeight;
        c.getContext("2d").drawImage(img,0,0);
        resolve(c.toDataURL("image/png"));
      }catch(e){reject(e)}
    };
    img.onerror=reject;
    img.src=`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1000`;
  });
}

async function downloadPDF(){
  await loadTTD();buildPreview();showLoading(true,"Membuat PDF...");
  try{
    const {jsPDF}=window.jspdf,pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
    const pages=[...document.querySelectorAll(".pdf-page")];
    for(let i=0;i<pages.length;i++){
      const canvas=await html2canvas(pages[i],{scale:2,useCORS:true,backgroundColor:"#fff"});
      if(i)pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg",.94),"JPEG",0,0,210,297);
    }
    const filename=`${safeName(state.employee.nama)} - ${monthName(state.month)} ${CONFIG.YEAR}.pdf`;
    pdf.save(filename);
    const logged=await writeLog("PDF Diunduh");
    $("#exportNote").textContent=`Dokumen ${filename} berhasil dibuat.${logged?" Aktivitas sudah tercatat di Log.":""}`;
    toast(logged?"PDF berhasil diunduh dan dicatat di Log.":"PDF berhasil diunduh.");
  }catch(e){console.error(e);toast("PDF gagal dibuat. Coba lagi")}finally{showLoading(false)}
}
async function makePDFBlob(){await loadTTD();buildPreview();const {jsPDF}=window.jspdf,pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});const pages=[...document.querySelectorAll(".pdf-page")];for(let i=0;i<pages.length;i++){const canvas=await html2canvas(pages[i],{scale:2,useCORS:true,backgroundColor:"#fff"});if(i)pdf.addPage();pdf.addImage(canvas.toDataURL("image/jpeg",.94),"JPEG",0,0,210,297)}return{blob:pdf.output("blob"),filename:`${safeName(state.employee.nama)} - ${monthName(state.month)} ${CONFIG.YEAR}.pdf`}}
async function sharePDF(){
  showLoading(true,"Menyiapkan PDF...");
  try{
    const x=await makePDFBlob();
    const file=new File([x.blob],x.filename,{type:"application/pdf"});
    const shareData={
      title:"Laporan Aktifitas Pegawai",
      text:`Laporan ${state.employee.nama} - ${monthName(state.month)} ${CONFIG.YEAR}`,
      files:[file]
    };
    if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share(shareData);
      await writeLog("PDF Dibagikan");
      toast("PDF siap dibagikan.");
      return;
    }
    // Browser yang tidak mendukung file sharing: unduh PDF, lalu buka menu berbagi teks.
    const a=document.createElement("a");
    a.href=URL.createObjectURL(x.blob);a.download=x.filename;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),30000);
    const text=encodeURIComponent(`Laporan Aktifitas Pegawai\nNama: ${state.employee.nama}\nPeriode: ${monthName(state.month)} ${CONFIG.YEAR}\nPDF sudah diunduh, silakan lampirkan ke WhatsApp/Drive/email.`);
    if(navigator.share){
      try{await navigator.share({title:"Laporan Aktifitas Pegawai",text})}catch(e){if(e.name!=="AbortError")console.warn(e)}
    }else{
      window.open(`https://wa.me/?text=${text}`,"_blank");
    }
    await writeLog("PDF Dibagikan");
    toast("PDF sudah diunduh dan siap dibagikan.");
  }catch(e){
    if(e.name!=="AbortError"){console.error(e);toast("Gagal menyiapkan PDF untuk dibagikan.")}}
  finally{showLoading(false)}
}
function showStep(id){["startStep","reportStep","previewStep"].forEach(x=>$("#"+x).classList.toggle("hidden",x!==id));window.scrollTo({top:0,behavior:"smooth"})}
function loadTheme(){if(localStorage.getItem("la-theme")==="dark"){document.body.classList.add("dark");$("#themeBtn").textContent="☀"}}
function toggleTheme(){document.body.classList.toggle("dark");localStorage.setItem("la-theme",document.body.classList.contains("dark")?"dark":"light");$("#themeBtn").textContent=document.body.classList.contains("dark")?"☀":"☾"}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),3500)}
function showLoading(v,text="Memproses..."){$("#loading").classList.toggle("hidden",!v);$("#loading span").textContent=text}
function monthName(m){return ({'07':'Juli','08':'Agustus','09':'September','10':'Oktober','11':'November','12':'Desember'})[String(m)]||"-"}
function roman(n){return ["","I","II","III","IV"][n]||n}
function lastDayOfMonth(m,y){return new Date(y,m,0).toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"})}
function safeName(v){return String(v||"Pegawai").replace(/[\\/:*?"<>|]+/g," ").replace(/\s+/g," ").trim()}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function escAttr(v){return esc(v).replace(/`/g,"&#96;")}