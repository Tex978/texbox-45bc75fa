import { checkFileInfo, type ChatFile } from "./chat-files";
export function uploadChatFileBrowser(file:File,onProgress:(percent:number)=>void,signal:AbortSignal):Promise<ChatFile>{
  checkFileInfo({name:file.name,size:file.size,mime:file.type});
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open("POST","/api/chat/upload");xhr.timeout=10*60*1000;
    xhr.setRequestHeader("Content-Type",file.type||"application/octet-stream");xhr.setRequestHeader("X-File-Name",encodeURIComponent(file.name));xhr.setRequestHeader("X-File-Size",String(file.size));
    const abort=()=>xhr.abort();signal.addEventListener("abort",abort,{once:true});
    const finish=()=>signal.removeEventListener("abort",abort);
    xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded/e.total*100));};
    xhr.onload=()=>{finish();try{const data=JSON.parse(xhr.responseText);if(xhr.status<200||xhr.status>=300||!data.id)reject(new Error(data.error||"A feltöltés nem sikerült."));else resolve(data);}catch{reject(new Error("A feltöltés nem sikerült. Ellenőrizd a belépést és a NAS-t."));}};
    xhr.onerror=()=>{finish();reject(new Error("Megszakadt a kapcsolat a NAS-sal."));};
    xhr.ontimeout=()=>{finish();reject(new Error("A feltöltés túllépte az időkorlátot."));};
    xhr.onabort=()=>{finish();reject(new Error("A feltöltést megszakítottad."));};
    if(signal.aborted){finish();reject(new Error("A feltöltést megszakítottad."));return;}
    xhr.send(file);
  });
}
