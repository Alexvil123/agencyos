import {test} from 'node:test';
import assert from 'node:assert/strict';
import {salesNeighbor,salesWindow} from '../src/lib/sales-grid-navigation';
test('Arrow navigation follows filtered row order and visible columns, stopping at sheet edges',()=>{
 const columns=[0,2,5];assert.deepEqual(salesNeighbor(2,2,4,columns,'down'),{row:3,column:2});assert.deepEqual(salesNeighbor(2,2,4,columns,'up'),{row:1,column:2});assert.deepEqual(salesNeighbor(2,2,4,columns,'right'),{row:2,column:5});assert.deepEqual(salesNeighbor(2,2,4,columns,'left'),{row:2,column:0});assert.equal(salesNeighbor(0,0,4,columns,'up'),null);assert.equal(salesNeighbor(3,5,4,columns,'right'),null);assert.equal(salesNeighbor(3,5,4,columns,'down'),null);
});
test('One scroll window reaches every row without rendering the entire large tab',()=>{
 for(const count of [0,458,1380]){const first=salesWindow(count,0,540);assert.equal(first.start,0);assert.ok(first.end<=32);const last=salesWindow(count,Math.max(0,count*36-540),540);assert.equal(last.end,count);assert.equal(last.before+(last.end-last.start)*36+last.after,count*36);assert.ok(last.end-last.start<=32);}
});
