'use client';
import {useState} from 'react';
import {SocialPanel} from './social-panel';
import {WorkAnalytics} from './work-analytics';
// Analytics is about social media performance (Instagram, Facebook, YouTube). Team workload figures stay one tab away.
export function AnalyticsPanel({preview=false}:{preview?:boolean}){
  const [tab,setTab]=useState<'social'|'work'>('social');
  return <div className="analytics">
    <div className="tabs" role="tablist" aria-label="Analytics sections">
      <button role="tab" aria-selected={tab==='social'} className={tab==='social'?'selected':''} onClick={()=>setTab('social')}>Social media</button>
      <button role="tab" aria-selected={tab==='work'} className={tab==='work'?'selected':''} onClick={()=>setTab('work')}>Team work</button>
    </div>
    {tab==='social'?<SocialPanel preview={preview}/>:<WorkAnalytics preview={preview}/>}
  </div>;
}
