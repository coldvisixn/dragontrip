import { expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import VirtualList from './VirtualList';

it('keeps a large inventory bounded and exposes rows after scrolling',()=>{
  const items=Array.from({length:1000},(_,i)=>({id:String(i)}));
  render(<VirtualList items={items} rowHeight={56} label="Large inventory" itemKey={i=>i.id}
    renderItem={i=><button>Host {i.id}</button>}/>);
  expect(screen.getAllByRole('button').length).toBeLessThan(25);
  expect(screen.getByRole('button',{name:'Host 0'})).toBeVisible();
  expect(screen.queryByRole('button',{name:'Host 999'})).toBeNull();
  fireEvent.scroll(screen.getByLabelText('Large inventory'),{target:{scrollTop:999*56}});
  expect(screen.getByRole('button',{name:'Host 999'})).toBeVisible();
  expect(screen.getAllByRole('button').length).toBeLessThan(25);
});
