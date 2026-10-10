'use client';
// Small dependency-free SVG chart shared by the Analytics tabs.
export function BarChart({title,unit,bars}:{title:string;unit:string;bars:{label:string;value:number;detail:string}[]}){
  const width=720,height=190,left=34,bottom=26,top=10,max=Math.max(1,...bars.map(b=>b.value)),inner=width-left-8,step=inner/Math.max(1,bars.length),barWidth=Math.max(2,Math.min(26,step*0.7));
  const every=Math.max(1,Math.ceil(bars.length/12));
  return <figure className="an-chart"><figcaption>{title}</figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${bars.map(b=>`${b.label} ${b.detail}`).join(', ')}`} preserveAspectRatio="none">
      {[0,0.5,1].map(f=><g key={f}><line className="an-grid" x1={left} x2={width-8} y1={top+(height-top-bottom)*(1-f)} y2={top+(height-top-bottom)*(1-f)}/><text className="an-axis" x={left-6} y={top+(height-top-bottom)*(1-f)+4} textAnchor="end">{Math.round(max*f*10)/10}</text></g>)}
      {bars.map((bar,index)=>{const h=(height-top-bottom)*(bar.value/max),x=left+index*step+(step-barWidth)/2;return <g key={bar.label+index}><rect className="an-bar" x={x} y={height-bottom-h} width={barWidth} height={Math.max(bar.value>0?2:0,h)} rx={3}><title>{`${bar.label}: ${bar.detail}`}</title></rect>{index%every===0&&<text className="an-axis" x={x+barWidth/2} y={height-8} textAnchor="middle">{bar.label}</text>}</g>;})}
    </svg><small>{unit}</small></figure>;
}
