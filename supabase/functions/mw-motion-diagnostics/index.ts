// One-time staging Storage integration diagnostic. Not a production endpoint.
// Uses the same dedicated Vault token as the hourly maintenance job.
import {createClient} from "npm:@supabase/supabase-js@2.79.0";
import {verifyIsoVideo,signedRangeReader} from "../mw-motion-pilot/media-validation.mjs";
const STAGING="https://uuggbmccnyswiwkjgydo.supabase.co";
const FIXTURE="AAAAHGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQAAA1xtb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAD6AABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACh3RyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAD6AAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAIAAAACAAAAAAACRlZHRzAAAAHGVsc3QAAAAAAAAAAQAAA+gAAAAAAAEAAAAAAf9tZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAEAAAABAAFXEAAAAAAAtaGRscgAAAAAAAAAAdmlkZQAAAAAAAAAAAAAAAFZpZGVvSGFuZGxlcgAAAAGqbWluZgAAABR2bWhkAAAAAQAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAABanN0YmwAAADqc3RzZAAAAAAAAAABAAAA2m1wNHYAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAIAAgAEgAAABIAAAAAAAAAAETTGF2YzYxLjE5LjEwMSBtcGVnNAAAAAAAAAAAAAAAAAAY//8AAABgZXNkcwAAAAADgICATwABAASAgIBBIBEAAAAAAw1AAAABSAWAgIAvAAABsAEAAAG1iRMAAAEAAAABIADEjYgAFQEEBBRDAAABskxhdmM2MS4xOS4xMDEGgICAAQIAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAMNQAAAAUgAAAAYc3R0cwAAAAAAAAABAAAAAgAAIAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAAgAAAAEAAAAcc3RzegAAAAAAAAAAAAAAAgAAAB4AAAALAAAAFHN0Y28AAAAAAAAAAQAAA4gAAABhdWR0YQAAAFltZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAACxpbHN0AAAAJKl0b28AAAAcZGF0YQAAAAEAAAAATGF2ZjYxLjcuMTAzAAAACGZyZWUAAAAxbWRhdAAAAbMAEAcAAAG2FhUYTW38bbfvAADKRhNbfxtt+wAAAbZfCjsAAMpv";
function reply(status:number,data:unknown){return new Response(JSON.stringify(data),{
 status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
});}
Deno.serve(async req=>{
 if(req.method!=="POST")return reply(405,{error:"Method not allowed"});
 const url=Deno.env.get("SUPABASE_URL")||"";
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(url!==STAGING||!key)return reply(503,{error:"Staging unavailable"});
 const token=req.headers.get("x-mw-maintenance-key")||"";
 if(!/^[a-f0-9]{64}$/.test(token))return reply(403,{error:"Denied"});
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authorized,error:authError}=await admin
  .rpc("mw_motion_staging_cleanup_authorized",{candidate:token});
 if(authError||authorized!==true)return reply(403,{error:"Denied"});
 let body;
 try{body=await req.json();}catch{return reply(400,{error:"Bad request"});}
 if(body?.action!=="storage_roundtrip")return reply(400,{error:"Unknown diagnostic"});
 const path="__diagnostics__/"+crypto.randomUUID()+".mp4";
 const bytes=Uint8Array.from(atob(FIXTURE),c=>c.charCodeAt(0));
 let uploaded=false,removed=false,verified=null,error=null;
 try{
  const {error:uploadError}=await admin.storage.from("motion-private")
   .upload(path,bytes,{contentType:"video/mp4",upsert:false,cacheControl:"0"});
  if(uploadError)throw new Error("Upload failed");
  uploaded=true;
  const {data:signed,error:signedError}=await admin.storage.from("motion-private")
   .createSignedUrl(path,60);
  if(signedError||!signed?.signedUrl)throw new Error("Signing failed");
  const readRange=signedRangeReader({url:signed.signedUrl,bytes:bytes.length,
   expectedOrigin:STAGING});
  verified=await verifyIsoVideo({bytes:bytes.length,mime:"video/mp4",readRange});
 }catch(e){error=e instanceof Error?e.message:"Unknown diagnostic error";}
 finally{
  if(uploaded){
   const {error:removeError}=await admin.storage.from("motion-private").remove([path]);
   removed=!removeError;
   if(removeError)error="Storage cleanup failed";
  }
 }
 return reply(error?503:200,{verified:!error&&!!verified?.verifiedContainer,
  durationMs:verified?.durationMs??null,removed,error});
});
