import { createFileRoute } from "@tanstack/react-router";
export const Route=createFileRoute("/api/chat/upload")({server:{handlers:{POST:async({request})=>{
  const {uploadChatFile,requestToken,sameOrigin,fileError}=await import("@/lib/chat-files.server");
  try{sameOrigin(request);const name=decodeURIComponent(request.headers.get("x-file-name")??"");const size=Number(request.headers.get("x-file-size"));return Response.json(await uploadChatFile(requestToken(request),{name,size,mime:request.headers.get("content-type")??""},request.body),{headers:{"Cache-Control":"no-store"}});}catch(e){return fileError(e);}
}}}});
