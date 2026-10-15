'use client';
import {useEffect,useRef} from 'react';

export type ChoiceColor={background?:string;color?:string};
const HUES:[RegExp,number][]=[[/not interested|negative|reject|lost|cancel|declin|no response|fail|not reachable|^no$/,355],[/complet|done|won|success|positive|interested|closed|convert|approved|^yes$/,145],[/pending|hold|wait|follow|call ?back|later|progress|process|review/,38],[/appoint|schedul|visit|meeting|demo|book/,215],[/new|lead|open/,270]];
// Google does not expose a dropdown chip's colour through the Sheets API, so the CRM picks a stable colour from the option text.
function chipHue(text:string){const value=text.trim().toLowerCase();for(const [pattern,hue] of HUES)if(pattern.test(value))return hue;let hash=0;for(const ch of value)hash=(hash*31+ch.charCodeAt(0))%360;return hash;}
export function chipProps(text:string,sheet?:ChoiceColor):{className:string;style?:React.CSSProperties;'data-hue'?:number}{
  if(sheet?.background&&sheet.background.toLowerCase()!=='#ffffff')return {className:'sales-chip',style:{backgroundColor:sheet.background,color:sheet.color||undefined}};
  const hue=chipHue(text);return {className:'sales-chip','data-hue':hue,style:{'--h':hue} as React.CSSProperties};
}
// Dropdown-chip menu for sheet cells that have a "list of items" validation, like the options list in Google Sheets.
export function SalesChoiceMenu({rect,choices,current,colors,onPick,onClose}:{rect:DOMRect;choices:string[];current:string;colors:Map<string,ChoiceColor>;onPick:(value:string)=>void;onClose:()=>void}){
  const list=useRef<HTMLDivElement>(null);
  useEffect(()=>{const buttons=list.current?.querySelectorAll<HTMLButtonElement>('button');(buttons&&([...buttons].find(b=>b.dataset.value===current)||buttons[0]))?.focus();},[current]);
  const left=Math.max(8,Math.min(rect.left,window.innerWidth-244)),below=window.innerHeight-rect.bottom,top=below>260?rect.bottom+4:Math.max(8,rect.top-Math.min(280,choices.length*38+56)-4);
  function move(e:React.KeyboardEvent){
    if(e.key==='Escape'){e.preventDefault();onClose();return;}
    if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
    e.preventDefault();const buttons=[...(list.current?.querySelectorAll<HTMLButtonElement>('button')||[])],index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
  }
  return <>
    <div className="sales-colfilter-backdrop" onMouseDown={onClose}/>
    <div className="sales-choice-menu" role="listbox" aria-label="Choose a value" ref={list} style={{left,top,maxHeight:Math.max(200,Math.min(340,window.innerHeight-top-12))}} onKeyDown={move}>
      {choices.map(choice=><button key={choice} role="option" aria-selected={choice===current} data-value={choice} className={choice===current?'selected':''} onClick={()=>onPick(choice)}><span {...chipProps(choice,colors.get(choice))}>{choice}</span>{choice===current&&<small>current</small>}</button>)}
      {current&&<button className="sales-choice-clear" data-value="" onClick={()=>onPick('')}>Clear value</button>}
    </div>
  </>;
}
