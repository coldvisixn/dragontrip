import { useState, type ReactNode } from 'react';

/** Fixed-height windowing keeps inventory/task DOM proportional to the viewport. */
export default function VirtualList<T>({items,rowHeight,renderItem,itemKey,label}:{
  items:T[];rowHeight:number;renderItem:(item:T)=>ReactNode;itemKey:(item:T)=>string;label:string;
}) {
  const [top,setTop]=useState(0);
  const height=Math.min(420,items.length*rowHeight);
  const start=Math.max(0,Math.min(Math.floor(top/rowHeight),Math.max(0,items.length-1))-4);
  const end=Math.min(items.length,start+Math.ceil(height/rowHeight)+8);
  return <div className="virtual-list" aria-label={label} style={{height,overflowY:'auto'}}
    onScroll={e=>setTop(e.currentTarget.scrollTop)}>
    <div style={{height:items.length*rowHeight,position:'relative'}}>
      {items.slice(start,end).map((item,index)=><div key={itemKey(item)}
        style={{position:'absolute',left:0,right:0,top:(start+index)*rowHeight,height:rowHeight}}>
        {renderItem(item)}
      </div>)}
    </div>
  </div>;
}
