import { useState } from "react";
import { Download, FileText, Trash2, X } from "lucide-react";
import { Button } from "./ui/button";
import { chatFileUrl, type ChatFile } from "@/lib/chat-files";
export function ChatAttachments({files,onDelete}:{files:ChatFile[];onDelete?:(id:string)=>void}){
  const [expanded,setExpanded]=useState<string|null>(null);
  const [failed,setFailed]=useState<string[]>([]);
  return <div className="chat-files">{files.map(f=><div className="chat-file" key={f.id}>
    {f.deleted||f.missing||failed.includes(f.id)?<p role="status">{f.name} — {f.deleted?"Törölt fájl":"A fájl nem érhető el."}</p>:<>
      {f.kind==="image"&&<a href={chatFileUrl(f.id)} onClick={e=>{e.preventDefault();setExpanded(f.id);}} aria-label={`${f.name} teljes nézet`}><img src={chatFileUrl(f.id)} alt={f.name} loading="lazy" onError={()=>setFailed(v=>[...v,f.id])}/></a>}
      {f.kind==="video"&&<video src={chatFileUrl(f.id)} controls preload="metadata" playsInline onError={()=>setFailed(v=>[...v,f.id])}/>}
      <div className="chat-file-info"><FileText size={16}/><span>{f.name}<small>{(f.size/1024/1024).toLocaleString("hu-HU",{maximumFractionDigits:1})} MB</small></span><Button variant="ghost" size="icon" asChild><a href={chatFileUrl(f.id,true)} download aria-label={`${f.name} letöltése`} title="Letöltés"><Download size={17}/></a></Button></div>
      {onDelete&&<Button type="button" variant="ghost" size="sm" onClick={()=>{if(window.confirm(`Végleg törlöd a NAS-ról ezt a fájlt: ${f.name}?`))onDelete(f.id);}}><Trash2 size={15}/>Fájl törlése</Button>}
    </>}
  </div>)}{expanded&&<div className="chat-image-full" role="dialog" aria-modal="true" aria-label="Kép teljes nézet" onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();setExpanded(null);}}}><Button type="button" variant="outline" size="icon" autoFocus aria-label="Kép bezárása" onClick={()=>setExpanded(null)}><X size={20}/></Button><img src={chatFileUrl(expanded)} alt={files.find(f=>f.id===expanded)?.name??"Kép"}/></div>}</div>;
}
