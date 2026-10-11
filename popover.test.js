import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Pure placement and event-path decisions only; no browser/React/DOM emulation.
const source=await readFile(new URL('./client.js',import.meta.url),'utf8');
const start=source.indexOf('    function popoverPlacement');
const end=source.indexOf('    // popover-model:end');
assert.ok(start>=0&&end>start);
const model=vm.runInNewContext(`(()=>{${source.slice(start,end)};return {popoverPlacement,pointerIsOutside};})()`);

test('card sits above its trigger so the TODO button remains available',()=>{
  const trigger={left:24,top:720};
  const placement=model.popoverPlacement(trigger,1280,800);
  const cardBottom=800-placement.bottom;
  assert.equal(cardBottom,trigger.top-8);
  assert.ok(cardBottom-placement.height>=12);
  assert.equal(placement.left,24);
  assert.equal(placement.width,360);
  assert.equal(placement.height,680);
});

test('small viewports and edge-aligned triggers keep card within visible bounds',()=>{
  for(const [rect,width,height] of [[{left:290,top:460},320,500],[{left:-20,top:180},480,240],[{left:1200,top:600},1280,720]]){
    const placement=model.popoverPlacement(rect,width,height);
    assert.ok(placement.left>=12);
    assert.ok(placement.left+placement.width<=width-12);
    assert.ok(height-placement.bottom-placement.height>=12);
    assert.ok(height-placement.bottom<=rect.top-8);
  }
});

test('inside clicks and trigger clicks are excluded from outside dismissal',()=>{
  const card=Symbol('card'),trigger=Symbol('trigger'),child=Symbol('child'),workspace=Symbol('workspace');
  assert.equal(model.pointerIsOutside([child,card],card,trigger),false);
  assert.equal(model.pointerIsOutside([child,trigger],card,trigger),false);
  assert.equal(model.pointerIsOutside([workspace],card,trigger),true);
});
