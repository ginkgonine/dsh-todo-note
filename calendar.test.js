import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Exercise only pure calendar math from the actual artifact. No React/DOM mocks.
const source=await readFile(new URL('./client.js',import.meta.url),'utf8');
const start=source.indexOf('    function localDayKey');
const end=source.indexOf('    // calendar-model:end');
assert.ok(start>=0&&end>start);
const model=vm.runInNewContext(`(()=>{${source.slice(start,end)};return {localDayKey,calendarDate,monthDays,deadlineState,visibleNotes};})()`,{Date});

test('calendar month has Monday-first leading blanks and complete real dates',()=>{
  const days=model.monthDays(2026,9); // 2026-10-01 Thursday
  assert.equal(days.length,35);
  assert.equal(days.slice(0,3).every(day=>day===null),true);
  assert.equal(days[3].key,'2026-10-01');
  assert.equal(days.filter(Boolean).length,31);
  assert.equal(days.find(day=>day?.day===31).key,'2026-10-31');
  assert.equal(new Set(days.filter(Boolean).map(day=>day.key)).size,31);
});

test('leap years, century boundary, and early years do not roll to 1900',()=>{
  assert.equal(model.monthDays(2024,1).filter(Boolean).length,29);
  assert.equal(model.monthDays(2100,1).filter(Boolean).length,28);
  assert.equal(model.monthDays(2000,1).filter(Boolean).length,29);
  assert.equal(model.monthDays(1,0).find(Boolean).key,'0001-01-01');
  assert.equal(model.monthDays(9999,11).filter(Boolean).at(-1).key,'9999-12-31');
  assert.equal(model.localDayKey(model.calendarDate(2026,12,1)),'2027-01-01');
});

test('timezone-skipped civil days retain distinct deadline keys',()=>{
  const days=model.monthDays(2011,11).filter(Boolean);
  assert.equal(days.length,31);
  assert.equal(new Set(days.map(day=>day.key)).size,31);
  assert.equal(days.find(day=>day.day===30).key,'2011-12-30');
  assert.equal(days.find(day=>day.day===31).key,'2011-12-31');
});

test('deadline labels treat no deadline and completed items separately',()=>{
  assert.equal(model.deadlineState({},'2026-10-09'),'none');
  assert.equal(model.deadlineState({dueDate:null},'2026-10-09'),'none');
  assert.equal(model.deadlineState({dueDate:'2026-10-08'},'2026-10-09'),'overdue');
  assert.equal(model.deadlineState({dueDate:'2026-10-09'},'2026-10-09'),'today');
  assert.equal(model.deadlineState({dueDate:'2026-10-10'},'2026-10-09'),'upcoming');
  assert.equal(model.deadlineState({dueDate:'2026-10-08',completed:true},'2026-10-09'),'completed');
});

test('selected date composes with status/search; undated notes stay in all-date list',()=>{
  const notes=[
    {id:'a',title:'Alpha',body:'',completed:true,dueDate:'2026-10-09',createdAt:'2026-10-09'},
    {id:'b',title:'Beta',body:'Alpha details',completed:false,dueDate:'2026-10-09',createdAt:'2026-10-08'},
    {id:'c',title:'Other',body:'',completed:false,createdAt:'2026-10-10'},
    {id:'d',title:'Tomorrow',body:'',completed:false,dueDate:'2026-10-10',createdAt:'2026-10-09'},
  ];
  const ids=result=>Array.from(result,n=>n.id);
  assert.deepEqual(ids(model.visibleNotes(notes,'all','','2026-10-09')),['b','a']);
  assert.deepEqual(ids(model.visibleNotes(notes,'active','alpha','2026-10-09')),['b']);
  assert.deepEqual(ids(model.visibleNotes(notes,'done','','2026-10-09')),['a']);
  assert.deepEqual(ids(model.visibleNotes(notes,'all','')),['c','d','b','a']);
  assert.deepEqual(ids(model.visibleNotes(notes,'all','','2026-10-11')),[]);
  assert.deepEqual(notes.map(n=>n.id),['a','b','c','d']);
});
