/* Laporan Aktifitas Pegawai - Frontend Vercel */
const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbxB66ZnG9mASzLYUUWLxH4bEjV_3EXxJRmVrWpYnEisOIMYcJX5Zyr8O3F5n-UWT2DpJA/exec",
  YEAR: 2026,
  UNIT: "Bagian Umum, Protokol dan Komunikasi Pimpinan"
};

const $ = s => document.querySelector(s);
const state = {
  employees: [],
  employee: null,
  quarter: "",
  month: "",
  weeks: [],
  ttdDataUrl: "",
  draftKey: ""
};

const months = {
  III: [["07","Juli"],["08","Agustus"],["09","September"]],
  IV: [["10","Oktober"],["11","November"],["12","Desember"]]
};

document.addEventListener("DOMContentLoaded", init);

async function init(){
  loadTheme();
  bind();

  // Apps Script mengembalikan { ok:true, data:[...] },
  // sehingga yang dimasukkan ke state.employees harus bagian "data".
  const response = await api("getEmployees");
  state.employees = Array.isArray(response?.data) ? response.data : [];

  populateEmployees();

  if(!state.employees.length){
    toast("Data pegawai belum berhasil dimuat. Periksa koneksi/API Apps Script.");
  }

  await restoreDraftIfPossible();
}

function bind(){
  $("#themeBtn").onclick = toggleTheme;
  $("#employeeSelect").onchange = employeeChanged;
  $("#quarterSelect").onchange = quarterChanged;
  $("#monthSelect").onchange = monthChanged;
  $("#continueBtn").onclick = startReport;
  $("#backBtn").onclick = () => showStep("startStep");
  $("#previewBtn").onclick = previewReport;
  $("#editBtn").onclick = () => showStep("reportStep");
  $("#printBtn").onclick = () => window.print();
  $("#downloadBtn").onclick = downloadPDF;
  $("#shareBtn").onclick = sharePDF;
  $("#whatsappBtn").onclick = whatsappShare;
}

function populateEmployees(){
  const s=$("#employeeSelect");
  s.innerHTML='<option value="">Pilih Nama Pegawai</option>';

  if(!Array.isArray(state.employees)) state.employees=[];

  state.employees.forEach(e=>{
    const o=document.createElement("option");
    o.value=e.no; o.textContent=e.nama;
    s.appendChild(o);
  });
}

function employeeChanged(){
  state.employee=state.employees.find(e=>String(e.no)===String($("#employeeSelect").value))||null;
  if(!state.employee){$("#employeeInfo").classList.add("hidden");return}
  $("#employeeInfo").innerHTML=`<b>${esc(state.employee.nama)}</b><br>NIP: ${esc(state.employee.nip||"-")} &nbsp;•&nbsp; ${esc(state.employee.pangkat_gol||"-")}<br>${esc(state.employee.jabatan||"-")} • ${esc(state.employee.lokasi_kerja||"-")}`;
  $("#employeeInfo").classList.remove("hidden");
  checkExisting();
}

function quarterChanged(){
  state.quarter=$("#quarterSelect").value;
  const s=$("#monthSelect"); s.disabled=!state.quarter;
  s.innerHTML='<option value="">Pilih Bulan Lapor</option>';
  (months[state.quarter]||[]).forEach(([num,name])=>{
    const o=document.createElement("option");o.value=num;o.textContent=`${name} ${CONFIG.YEAR}`;s.appendChild(o);
  });
  state.month=""; $("#existingReport").classList.add("hidden"); updateContinue();
}
async function monthChanged(){
  state.month=$("#monthSelect").value; await checkExisting(); updateContinue();
}
function updateContinue(){
  $("#continueBtn").disabled=!(state.employee&&state.quarter&&state.month);
}
async function checkExisting(){
  if(!state.employee||!state.month)return;
  const r=await api("checkLog",{no:state.employee.no,bulan:monthName(state.month)});
  if(r?.exists){
    $("#existingReport").innerHTML=`Laporan <b>${monthName(state.month)} ${CONFIG.YEAR}</b> atas nama <b>${esc(state.employee.nama)}</b> sudah tercatat di Log. Anda tetap dapat membuat ulang laporan.`;
    $("#existingReport").classList.remove("hidden");
  }
  updateContinue();
}

function startReport(){
  state.draftKey=`LAPORAN-${state.employee.no}-${state.month}-${state.quarter}-${CONFIG.YEAR}`;
  state.weeks=[1,2,3,4].map(i=>({
    week:i,activity:state.employee.rencana_aksi||"",location:state.employee.lokasi_kerja||"",photo1:"",photo2:""
  }));
  renderWeeks();
  $("#reportTitle").textContent=`${state.employee.nama} — ${monthName(state.month)} ${CONFIG.YEAR}`;
  showStep("reportStep");
  saveDraft();
}

function renderWeeks(){
  const wrap=$("#weeks");wrap.innerHTML="";
  state.weeks.forEach((w,i)=>{
    const card=document.createElement("article");card.className="week-card";
    card.innerHTML=`
      <div class="week-head"><h3>Minggu ${roman(w.week)} ${monthName(state.month)} ${CONFIG.YEAR}</h3><small>2 foto aktivitas</small></div>
      <div class="week-body">
        <div class="activity-grid">
          <div><div class="field-title">Kegiatan / Rencana Aksi</div><textarea class="editable activity-input" data-i="${i}">${esc(w.activity)}</textarea></div>
          <div><div class="field-title">Lokasi</div><input class="editable location-input" data-i="${i}" value="${esc(w.location)}"></div>
        </div>
        <div class="photos">
          ${photoBox(i,1,w.photo1)}
          ${photoBox(i,2,w.photo2)}
        </div>
      </div>`;
    wrap.appendChild(card);
  });
  document.querySelectorAll(".activity-input").forEach(x=>x.oninput=e=>{state.weeks[e.target.dataset.i].activity=e.target.value;debouncedSave()});
  document.querySelectorAll(".location-input").forEach(x=>x.oninput=e=>{state.weeks[e.target.dataset.i].location=e.target.value;debouncedSave()});
  document.querySelectorAll(".file-input").forEach(x=>x.onchange=handlePhoto);
  document.querySelectorAll(".remove-photo").forEach(x=>x.onclick=removePhoto);
  updateProgress();
}
function photoBox(i,n,data){
  return `<div class="photo-box ${data?'has-photo':''}" data-box="${i}-${n}">
    <div class="photo-label">Foto ${n}</div>
    <div class="photo-frame">${data?`<img src="${data}" alt="Foto ${n}">`:`<div class="photo-empty"><b>📷</b>Belum ada foto</div>`}</div>
    <div class="photo-controls">
      <label class="file-btn">📷 Ambil / Pilih Foto<input class="file-input" type="file" accept="image/*" capture="environment" data-i="${i}" data-n="${n}"></label>
      <button class="remove-photo" type="button" data-i="${i}" data-n="${n}">Hapus</button>
    </div>
  </div>`;
}
async function handlePhoto(e){
  const f=e.target.files?.[0];if(!f)return;
  showLoading(true,"Mengolah foto...");
  try{
    const data=await compressImage(f);
    const i=+e.target.dataset.i,n=+e.target.dataset.n;
    state.weeks[i][n===1?"photo1":"photo2"]=data;
    renderWeeks();await saveDraft();toast("Foto tersimpan di perangkat.");
  }catch(err){toast("Foto gagal diproses.");console.error(err)}
  showLoading(false);
}
function removePhoto(e){
  const i=+e.currentTarget.dataset.i,n=+e.currentTarget.dataset.n;
  state.weeks[i][n===1?"photo1":"photo2"]="";
  renderWeeks();saveDraft();
}
function compressImage(file,max=1500,quality=.78){
  return new Promise((resolve,reject)=>{
    const img=new Image(),url=URL.createObjectURL(file);
    img.onload=()=>{
      let w=img.width,h=img.height,scale=Math.min(1,max/Math.max(w,h));w=Math.round(w*scale);h=Math.round(h*scale);
      const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);
      URL.revokeObjectURL(url);resolve(c.toDataURL("image/jpeg",quality));
    };img.onerror=reject;img.src=url;
  });
}

let saveTimer;
function debouncedSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveDraft,400)}
async function saveDraft(){
  if(!state.draftKey)return;
  try{
    await idbSet(state.draftKey,{employeeNo:state.employee.no,quarter:state.quarter,month:state.month,weeks:state.weeks});
    $("#saveStatus").textContent=`Draft tersimpan ${new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}`;
  }catch(e){console.warn(e)}
}
async function restoreDraftIfPossible(){
  const keys=await idbKeys();
  const key=keys.find(k=>k.startsWith("LAPORAN-"));
  if(!key)return;
  const d=await idbGet(key);if(!d)return;
  const emp=state.employees.find(e=>String(e.no)===String(d.employeeNo));if(!emp)return;
  if(confirm(`Draft terakhir ditemukan untuk ${emp.nama}, ${monthName(d.month)} ${CONFIG.YEAR}. Lanjutkan draft tersebut?`)){
    state.employee=emp;state.quarter=d.quarter;state.month=d.month;state.weeks=d.weeks;state.draftKey=key;
    $("#employeeSelect").value=emp.no;$("#quarterSelect").value=d.quarter;quarterChanged();$("#monthSelect").value=d.month;
    $("#employeeInfo").innerHTML=`<b>${esc(emp.nama)}</b><br>NIP: ${esc(emp.nip||"-")} &nbsp;•&nbsp; ${esc(emp.pangkat_gol||"-")}<br>${esc(emp.jabatan||"-")} • ${esc(emp.lokasi_kerja||"-")}`;$("#employeeInfo").classList.remove("hidden");
    renderWeeks();$("#reportTitle").textContent=`${emp.nama} — ${monthName(d.month)} ${CONFIG.YEAR}`;showStep("reportStep");
  }
}
function idb(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open("LaporanAktifitasDB",1);
    r.onupgradeneeded=()=>r.result.createObjectStore("drafts");
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
}
async function idbSet(k,v){const db=await idb();return new Promise((res,rej)=>{const t=db.transaction("drafts","readwrite");t.objectStore("drafts").put(v,k);t.oncomplete=res;t.onerror=()=>rej(t.error)})}
async function idbGet(k){const db=await idb();return new Promise((res,rej)=>{const r=db.transaction("drafts").objectStore("drafts").get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idbKeys(){const db=await idb();return new Promise((res,rej)=>{const r=db.transaction("drafts").objectStore("drafts").getAllKeys();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idbDelete(k){const db=await idb();db.transaction("drafts","readwrite").objectStore("drafts").delete(k)}

async function previewReport(){
  if(state.weeks.some(w=>!w.photo1||!w.photo2)){toast("Setiap minggu wajib memiliki 2 foto.");return}
  buildPreview();showStep("previewStep");
}
function buildPreview(){
  const p=$("#pdfPreview");p.innerHTML="";
  const emp=state.employee;
  // 1 halaman identitas + 2 minggu per halaman, lalu pengesahan.
  const chunks=[[0,1],[2,3]];
  chunks.forEach((pair,pi)=>{
    const page=document.createElement("div");page.className="pdf-page";
    page.innerHTML=pdfHeader(emp,pi===0);
    pair.forEach(i=>page.insertAdjacentHTML("beforeend",weekPdf(state.weeks[i],i)));
    if(pi===1) page.insertAdjacentHTML("beforeend",signatureHtml(emp));
    page.insertAdjacentHTML("beforeend",`<div class="page-foot"><span>Laporan Aktifitas Pegawai • ${CONFIG.UNIT}</span><span>Halaman ${pi+1}</span></div>`);
    p.appendChild(page);
  });
}
function pdfHeader(emp,first){
  return `<div class="pdf-head"><div class="pdf-logo">LA</div><div class="pdf-title"><h1>LAPORAN AKTIFITAS PEGAWAI</h1><p>${CONFIG.UNIT}</p></div></div>
  ${first?`<div class="ident">
    <div class="k">Nama</div><div>${esc(emp.nama)}</div><div class="k">NIP</div><div>${esc(emp.nip||"-")}</div>
    <div class="k">Pangkat/Gol</div><div>${esc(emp.pangkat_gol||"-")}</div><div class="k">Jabatan</div><div>${esc(emp.jabatan||"-")}</div>
    <div class="k">Lokasi Kerja</div><div>${esc(emp.lokasi_kerja||"-")}</div><div class="k">Bulan Lapor</div><div>${monthName(state.month)} ${CONFIG.YEAR}</div>
  </div>`:""}
  `;
}
function weekPdf(w,i){
  return `<div class="section-band">MINGGU ${roman(w.week)} • ${monthName(state.month)} ${CONFIG.YEAR}</div>
  <div class="pdf-body-label">Kegiatan</div><div class="pdf-text">${esc(w.activity).replace(/\n/g,"<br>")}</div>
  <div class="pdf-body-label">Lokasi</div><div class="pdf-location">${esc(w.location)}</div>
  <div class="pdf-photos"><div class="pdf-photo"><img src="${w.photo1}" alt="Foto ${i+1}.1"></div><div class="pdf-photo"><img src="${w.photo2}" alt="Foto ${i+1}.2"></div></div>`;
}
function signatureHtml(emp){
  const date=lastDayOfMonth(+state.month,CONFIG.YEAR);
  return `<div class="signature"><div class="city">Pasuruan, ${date}</div>${state.ttdDataUrl?`<img src="${state.ttdDataUrl}" alt="Tanda tangan">`:`<div style="height:28mm"></div>`}<div class="name">${esc(emp.nama)}</div><div>NIP. ${esc(emp.nip||"-")}</div></div>`;
}

async function loadTTD(){
  if(state.ttdDataUrl)return;
  if(!state.employee?.link_ttd)return;
  const r=await api("getTtd",{url:state.employee.link_ttd});
  if(r?.dataUrl)state.ttdDataUrl=r.dataUrl;
}

async function downloadPDF(){
  await loadTTD();buildPreview();showLoading(true,"Membuat PDF...");
  try{
    const {jsPDF}=window.jspdf, pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
    const pages=[...document.querySelectorAll(".pdf-page")];
    for(let i=0;i<pages.length;i++){
      const canvas=await html2canvas(pages[i],{scale:2,useCORS:true,backgroundColor:"#ffffff"});
      const img=canvas.toDataURL("image/jpeg",.94);
      if(i)pdf.addPage();
      pdf.addImage(img,"JPEG",0,0,210,297);
    }
    const filename=`${safeName(state.employee.nama)} - ${monthName(state.month)} ${CONFIG.YEAR}.pdf`;
    pdf.save(filename);
    await logCompleted();
    await idbDelete(state.draftKey);
    $("#exportNote").textContent=`Dokumen ${filename} berhasil dibuat.`;
    toast("PDF berhasil diunduh.");
  }catch(e){console.error(e);toast("PDF gagal dibuat. Coba lagi.");}
  showLoading(false);
}
async function makePDFBlob(){
  await loadTTD();buildPreview();
  const {jsPDF}=window.jspdf,pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
  const pages=[...document.querySelectorAll(".pdf-page")];
  for(let i=0;i<pages.length;i++){
    const canvas=await html2canvas(pages[i],{scale:2,useCORS:true,backgroundColor:"#fff"});
    if(i)pdf.addPage();pdf.addImage(canvas.toDataURL("image/jpeg",.94),"JPEG",0,0,210,297);
  }
  return {blob:pdf.output("blob"),filename:`${safeName(state.employee.nama)} - ${monthName(state.month)} ${CONFIG.YEAR}.pdf`};
}
async function sharePDF(){
  showLoading(true,"Menyiapkan PDF...");
  try{
    const x=await makePDFBlob();const file=new File([x.blob],x.filename,{type:"application/pdf"});
    if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({title:"Laporan Aktifitas Pegawai",text:`Laporan ${state.employee.nama} - ${monthName(state.month)} ${CONFIG.YEAR}`,files:[file]});await logCompleted();await idbDelete(state.draftKey)}
    else{toast("Perangkat/browser tidak mendukung berbagi file. Gunakan Download PDF.");}
  }catch(e){if(e.name!=="AbortError")toast("Gagal membagikan PDF.");}
  showLoading(false);
}
async function whatsappShare(){
  const text=encodeURIComponent(`Laporan Aktifitas Pegawai\nNama: ${state.employee.nama}\nBulan: ${monthName(state.month)} ${CONFIG.YEAR}\n\nPDF telah disiapkan melalui aplikasi. Silakan lampirkan file PDF yang telah diunduh.`);
  window.open(`https://wa.me/?text=${text}`,"_blank");
}
async function logCompleted(){
  const r=await api("writeLog",{no:state.employee.no,nama:state.employee.nama,jabatan:state.employee.jabatan,bulan:`${monthName(state.month)} ${CONFIG.YEAR}`,status:"Selesai"});
  if(r?.ok===false)console.warn(r.message);
}
function showStep(id){
  ["startStep","reportStep","previewStep"].forEach(x=>$("#"+x).classList.toggle("hidden",x!==id));
  window.scrollTo({top:0,behavior:"smooth"});
}
function updateProgress(){
  const done=state.weeks.filter(w=>w.photo1&&w.photo2).length;
  $("#progressText").textContent=`${done} dari 4 minggu selesai`;
  $("#progressBar").style.width=`${done*25}%`;
}
function monthName(n){return (months.III.concat(months.IV).find(x=>x[0]===String(n))||["",""])[1]}
function roman(n){return ["","I","II","III","IV"][n]}
function lastDayOfMonth(m,y){const d=new Date(y,m,0);return d.toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"})}
function safeName(s){return String(s||"Pegawai").replace(/[\\/:*?"<>|]/g," ").replace(/\s+/g," ").trim()}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
async function api(action,data={}){
  if(!CONFIG.API_URL||CONFIG.API_URL.startsWith("PASTE_")){toast("Isi API_URL Apps Script di app.js terlebih dahulu.");return null}
  try{
    const url=new URL(CONFIG.API_URL);url.searchParams.set("action",action);Object.entries(data).forEach(([k,v])=>url.searchParams.set(k,v??""));
    const r=await fetch(url.toString(),{method:"GET",cache:"no-store"});
    const payload=await r.json();

    if(payload?.ok===false){
      console.error("Apps Script API:",payload.message);
      toast(payload.message || "API Apps Script mengembalikan error.");
    }

    return payload;
  }catch(e){
    console.error("API error:",e);
    toast("Tidak dapat terhubung ke server Apps Script.");
    return null;
  }
}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),3000)}
function showLoading(v,text="Memproses..."){$("#loading").classList.toggle("hidden",!v);$("#loading span").textContent=text}
function toggleTheme(){document.body.classList.toggle("dark");localStorage.setItem("la-theme",document.body.classList.contains("dark")?"dark":"light");$("#themeBtn").textContent=document.body.classList.contains("dark")?"☀":"☾"}
function loadTheme(){if(localStorage.getItem("la-theme")==="dark"){document.body.classList.add("dark");$("#themeBtn").textContent="☀"}}
