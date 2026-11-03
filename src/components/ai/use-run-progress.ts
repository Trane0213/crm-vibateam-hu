import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { getOwnRunProgress } from '@/lib/ai-os/runtime.functions';
export function useRunProgress(threadId: string | null, since: string | null) {
  const read=useServerFn(getOwnRunProgress);
  const [label,setLabel]=useState('A kérdésed feldolgozás alatt van.');
  useEffect(()=>{
    setLabel('A kérdésed feldolgozás alatt van.');
    if(!threadId || !since)return;
    let active=true; let pending=false;
    const poll=async()=>{if(pending)return;pending=true;try{const result=await read({data:{threadId,since}});if(active&&result)setLabel(result.label);}catch{/* no guessed progress */}finally{pending=false;}};
    void poll();const timer=setInterval(()=>void poll(),2000);
    return()=>{active=false;clearInterval(timer);};
  },[threadId,since,read]);
  return label;
}