window.__ModuleLoader__.load({
  id: '@local/dsh-todo-note',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useSyncExternalStore } = React;
    // calendar-model:start — pure date math, also exercised by calendar.test.js.
    function localDayKey(date=new Date()) {
      return `${String(date.getFullYear()).padStart(4,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    }
    function calendarDate(year,month,day=1) {
      const date=new Date(0);date.setFullYear(year,month,day);date.setHours(12,0,0,0);return date;
    }
    function monthDays(year,month) {
      // Calendar dates have no timezone: even a locally skipped civil day must exist.
      const first=new Date(0);first.setUTCFullYear(year,month,1);first.setUTCHours(12,0,0,0);
      const last=new Date(0);last.setUTCFullYear(year,month+1,0);last.setUTCHours(12,0,0,0);
      const offset=(first.getUTCDay()+6)%7,count=last.getUTCDate();
      return Array.from({length:Math.ceil((offset+count)/7)*7},(_,index)=>{
        const day=index-offset+1;
        return day<1||day>count?null:{day,key:`${String(year).padStart(4,'0')}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`};
      });
    }
    function deadlineState(note,today) {
      if(!note.dueDate)return 'none';
      if(note.completed)return 'completed';
      return note.dueDate<today?'overdue':note.dueDate===today?'today':'upcoming';
    }
    function visibleNotes(notes,filter,search,selectedDate=null) {
      return notes.filter(n=>(filter==='all'||(filter==='done'?n.completed:!n.completed))&&(!selectedDate||n.dueDate===selectedDate)&&`${n.title}\n${n.body}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
        .sort((a,b)=>Number(a.completed)-Number(b.completed)||b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
    }
    // calendar-model:end
    const dictionaries = {
      en: {collapseCalendar:'Collapse calendar', dueDate:'Due date', clearDate:'Clear date', calendar:'Calendar', list:'Task list', today:'Today', overdue:'Overdue', dueToday:'Due today', prevMonth:'Previous month', nextMonth:'Next month', allDates:'All dates', dueOn:'Due on', noTasksOnDate:'No tasks due on this day.', weekday0:'Mo', weekday1:'Tu', weekday2:'We', weekday3:'Th', weekday4:'Fr', weekday5:'Sa', weekday6:'Su', title:'TODO Notes', todo:'TODO', add:'Add a task', task:'Task title', note:'Notes', notePlaceholder:'Details, ideas, or instructions for the agent…', save:'Save', cancel:'Cancel', edit:'Edit', remove:'Delete', all:'All', active:'To do', done:'Completed', empty:'No tasks here. Add one below to get started.', loading:'Loading…', refresh:'Refresh', search:'Search tasks and notes', closeSearch:'Close search', start:'Start agent conversation', open:'Open conversation', cwd:'Working directory', launchHelp:'Creates a new conversation and sends the saved note. Normal DSH permissions still apply.', launch:'Create and send', busy:'Working…', close:'Close', failed:'Request failed', count:'tasks', complete:'Mark completed', undo:'Mark incomplete', unsaved:'Save or cancel your changes first.', partial:'Conversation created, but the note could not be sent. Open it to continue.'},
      zh: {collapseCalendar:'收起日历', dueDate:'截止日期', clearDate:'清除日期', calendar:'日历', list:'待办列表', today:'今天', overdue:'已逾期', dueToday:'今天到期', prevMonth:'上个月', nextMonth:'下个月', allDates:'全部日期', dueOn:'到期', noTasksOnDate:'这一天没有到期的待办。', weekday0:'一', weekday1:'二', weekday2:'三', weekday3:'四', weekday4:'五', weekday5:'六', weekday6:'日', title:'TODO 笔记', todo:'TODO', add:'添加待办', task:'待办标题', note:'笔记', notePlaceholder:'详细说明、想法，或希望 agent 执行的内容…', save:'保存', cancel:'取消', edit:'编辑', remove:'删除', all:'全部', active:'待完成', done:'已完成', empty:'还没有待办，在底部添加一条吧。', loading:'正在加载…', refresh:'刷新', search:'搜索待办和笔记', closeSearch:'收起搜索', start:'发起 agent 对话', open:'打开对话', cwd:'工作目录', launchHelp:'创建新对话，并发送已保存的笔记。仍遵循 DSH 的常规权限设置。', launch:'创建并发送', busy:'处理中…', close:'关闭', failed:'请求失败', count:'项待办', complete:'标记完成', undo:'标记未完成', unsaved:'请先保存或取消修改。', partial:'对话已创建，但笔记未能发送。可以打开对话继续。'}
    };
    const css = `
.tn-calendar{margin:0 0 12px;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 60%,transparent)}.tn-cal-head{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px}.tn-cal-head strong{font-size:14px;font-weight:500}.tn-cal-head .tn-tools{gap:2px}.tn-cal-head button{font-size:12px;padding:2px 7px}.tn-cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}.tn-cal-weekday{text-align:center;font-size:11px;color:var(--dsw-alias-label-secondary);line-height:24px}.tn-page .tn-cal-day{position:relative;padding:4px 0 12px;min-height:34px;font-size:12px;border-color:transparent}.tn-cal-day[data-today=true]{border-color:var(--dsw-alias-brand-primary)}.tn-cal-day[aria-pressed=true]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);font-weight:600}.tn-cal-dot{position:absolute;bottom:4px;left:50%;width:4px;height:4px;border-radius:50%;transform:translateX(-50%);background:var(--dsw-alias-label-secondary)}.tn-cal-dot[data-pending=true]{background:var(--dsw-alias-brand-primary)}.tn-cal-caption{display:flex;align-items:center;justify-content:space-between;gap:6px;margin:8px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px}.tn-cal-caption button{font-size:11px;padding:2px 6px}.tn-deadline{margin:5px 0 0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:18px}.tn-deadline[data-state=overdue]{color:var(--dsw-alias-state-error-primary)}.tn-deadline[data-state=today]{color:var(--dsw-alias-brand-primary)}
.tn-floating{position:fixed;left:12px;bottom:64px;box-sizing:border-box;width:min(360px,calc(100vw - 24px));height:min(680px,calc(100dvh - 100px));border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-base);box-shadow:0 8px 28px color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);pointer-events:auto;overflow:hidden;z-index:20}
@supports(backdrop-filter:blur(16px)){.tn-floating{background:color-mix(in srgb,var(--dsw-alias-bg-base) 90%,transparent);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}}
.tn-page{box-sizing:border-box;height:100%;display:flex;flex-direction:column;overflow:hidden;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px}
.tn-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:18px 16px 10px;flex:none}.tn-head h1{font-size:20px;font-weight:500;line-height:28px;margin:0}.tn-tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.tn-head .tn-tools{gap:3px;flex-wrap:nowrap}
.tn-page button,.tn-entry{font:inherit;font-size:13px;cursor:pointer;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);padding:6px 10px;line-height:20px}.tn-page button:hover,.tn-entry:hover{background:var(--dsw-alias-bg-layer-2)}.tn-page button:disabled{cursor:default}.tn-page button:focus-visible,.tn-entry:focus-visible,.tn-page input:focus-visible,.tn-page textarea:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.tn-page .tn-primary{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);border-color:var(--dsw-alias-brand-primary)}.tn-page .tn-danger{color:var(--dsw-alias-state-error-primary)}.tn-page .tn-icon-button{padding:5px;border:0;width:30px;height:30px;display:flex;align-items:center;justify-content:center}.tn-entry{display:flex;gap:8px;align-items:center;justify-content:center;min-width:32px;padding:6px 8px;border:0}
.tn-toolbar{display:flex;gap:3px;padding:0 16px 8px;flex:none}.tn-toolbar button{font-size:12px;padding:4px 9px;border-color:transparent}.tn-toolbar button[aria-pressed=true]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary)}
.tn-page input:not([type=checkbox]),.tn-page textarea{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:9px 10px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font:inherit;font-size:13px;line-height:20px}.tn-search-wrap{padding:0 16px 10px;flex:none}.tn-page .tn-search{background:var(--dsw-alias-bg-layer-1)}
.tn-count{font-size:12px;color:var(--dsw-alias-label-secondary);margin:0;padding:0 16px 10px;flex:none}.tn-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:0 12px 12px}.tn-list{display:flex;flex-direction:column;gap:6px}.tn-row{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 65%,transparent);display:flex;align-items:flex-start;gap:10px;padding:12px}.tn-row input[type=checkbox]{accent-color:var(--dsw-alias-brand-primary);width:18px;height:18px;flex:none;margin:3px 0;cursor:pointer}.tn-row-main{flex:1;min-width:0}.tn-row-title{font-size:14px;font-weight:500;line-height:22px;overflow-wrap:anywhere;margin:0}.tn-row[data-done=true] .tn-row-title{text-decoration:line-through;color:var(--dsw-alias-label-secondary)}.tn-preview{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);margin:5px 0 8px;max-height:100px;overflow:auto}.tn-row .tn-tools{margin-top:8px;gap:5px}.tn-row button{padding:2px 6px;font-size:11px;border-color:transparent;color:var(--dsw-alias-label-secondary)}
.tn-editor{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:14px;display:flex;flex-direction:column;gap:12px;margin-bottom:12px}.tn-editor h2{margin:0;font-size:14px;font-weight:500}.tn-label{display:flex;flex-direction:column;gap:6px;font-size:13px;line-height:20px}.tn-page textarea{resize:vertical;min-height:120px}.tn-empty{padding:36px 16px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:13px}.tn-error{color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:20px;overflow-wrap:anywhere;margin:0;padding:0 16px 10px;flex:none}.tn-launch{margin-top:10px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:10px;font-size:13px}.tn-launch{display:flex;flex-direction:column;gap:10px}.tn-launch p{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
.tn-add{flex:none;padding:12px 16px 14px;border-top:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--dsw-alias-bg-base) 60%,transparent)}.tn-add-field{display:flex;gap:8px;align-items:center;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:2px 8px}.tn-add-field:focus-within{border-color:var(--dsw-alias-brand-primary)}.tn-add-plus{font-size:22px;color:var(--dsw-alias-brand-primary);line-height:24px}.tn-page .tn-add-field input{background:transparent;border:0;padding:9px 4px;min-width:0}.tn-page .tn-add-field input:focus-visible{outline:0}
`;
    return {
      inject: ['slots', 'locale', 'uiWorkspace'],
      apply(ctx) {
        for (const [language, dict] of Object.entries(dictionaries)) ctx.effect(() => ctx.locale.register('todoNote', language, dict));
        const translate = ctx.locale.bind('todoNote');
        let opened = false, trigger = null;
        const subscribers = new Set();
        const subscribe = fn => {subscribers.add(fn);return () => subscribers.delete(fn);};
        function show(value) {opened=value;for(const fn of subscribers)fn();if(!value)trigger?.focus();}
        ctx.effect(() => () => {opened=false;subscribers.clear();trigger=null;});
        function useT() {
          useSyncExternalStore(cb => ctx.locale.subscribe(cb), () => ctx.locale.getSnapshot());
          return translate;
        }
        async function request(input, signal) {
          const response = await fetch('/api/todo-note', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify(input), signal});
          const result = await response.json();
          if (!response.ok || !result.ok) {
            const error = new Error(result.error?.message || translate('failed'));
            error.sessionId = result.error?.sessionId;
            throw error;
          }
          return result;
        }
        function Glyph({kind}) {
          const path = kind==='calendar'?'M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1M4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2M14 17h2':kind==='search'?'m16 16 4 4':kind==='refresh'?'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1':kind==='close'?'m6 6 12 12M6 18 18 6':'M9 5h11M9 12h11M9 19h11M2 5l1.5 1.5L6 3M2 12l1.5 1.5L6 10M2 19l1.5 1.5L6 17';
          return h('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},kind==='search'&&h('circle',{cx:10.5,cy:10.5,r:6.5}),h('path',{d:path}));
        }
        function Footer({wide}) {
          const t=useT(), isOpen=useSyncExternalStore(subscribe,()=>opened);
          return h('button',{ref:el=>{trigger=el;},className:'tn-entry',title:t('title'),'aria-label':t('title'),'aria-expanded':isOpen,'aria-controls':'tn-floating-card',onClick:()=>show(!opened)},h('style',null,css),h(Glyph,{kind:'todo'}),wide&&h('span',null,t('todo')));
        }
        function Page() {
          const t=useT();
          const [notes,setNotes]=useState([]), [loading,setLoading]=useState(true), [busy,setBusy]=useState(false), [error,setError]=useState('');
          const [today,setToday]=useState(()=>localDayKey()), [calendarOpen,setCalendarOpen]=useState(false), [selectedDate,setSelectedDate]=useState(null), [month,setMonth]=useState(()=>({year:new Date().getFullYear(),month:new Date().getMonth()}));
          useEffect(()=>{const next=new Date();next.setHours(24,0,0,0);const timer=setTimeout(()=>setToday(localDayKey()),Math.max(100,next.getTime()-Date.now()+50));return()=>clearTimeout(timer);},[today]);
          const [filter,setFilter]=useState('all'), [search,setSearch]=useState(''), [searchOpen,setSearchOpen]=useState(false), [quickTitle,setQuickTitle]=useState('');
          const [draft,setDraft]=useState(null), [launching,setLaunching]=useState(null), [cwd,setCwd]=useState('/home/ubuntu/dsh-todo-note'), [partial,setPartial]=useState(null), [pendingIds,setPendingIds]=useState(new Set());
          const alive=useRef(false), operation=useRef(false), controllers=useRef(new Set()), pending=useRef(new Set()), composing=useRef(false), editingComposing=useRef(false), quickInput=useRef(null), searchInput=useRef(null), searchButton=useRef(null), calendarButton=useRef(null);
          async function run(input) {
            const controller=new AbortController();controllers.current.add(controller);
            try{return await request(input,controller.signal);}finally{controllers.current.delete(controller);}
          }
          async function refresh() {
            if(operation.current||pending.current.size)return;
            operation.current=true;setBusy(true);setError('');
            try{const r=await run({action:'list'});if(alive.current)setNotes(r.notes);}
            catch(e){if(alive.current&&e.name!=='AbortError')setError(e.message);}
            finally{operation.current=false;if(alive.current){setLoading(false);setBusy(false);}}
          }
          useEffect(()=>{
            alive.current=true;
            const controller=new AbortController();controllers.current.add(controller);setBusy(true);
            request({action:'list'},controller.signal)
              .then(r=>{if(alive.current&&!controller.signal.aborted)setNotes(r.notes);})
              .catch(e=>{if(alive.current&&!controller.signal.aborted)setError(e.message);})
              .finally(()=>{controllers.current.delete(controller);if(alive.current&&!controller.signal.aborted){setLoading(false);setBusy(false);}});
            return()=>{alive.current=false;for(const c of controllers.current)c.abort();controllers.current.clear();};
          },[]);
          useEffect(()=>{if(searchOpen)searchInput.current?.focus();},[searchOpen]);
          async function mutate(input,next) {
            if(operation.current||pending.current.has(input.id))return;
            operation.current=true;setBusy(true);setError('');setPartial(null);
            try{
              const result=await run(input);
              if(!alive.current)return;
              if(result.note)setNotes(items=>items.some(n=>n.id===result.note.id)?items.map(n=>n.id===result.note.id?result.note:n):[result.note,...items]);
              if(result.deleted)setNotes(items=>items.filter(n=>n.id!==result.id));
              if(next)next(result);
            }catch(e){if(alive.current&&e.name!=='AbortError'){setError(e.sessionId?t('partial')+' '+e.message:e.message);if(e.sessionId)setPartial(e.sessionId);}}
            finally{operation.current=false;if(alive.current)setBusy(false);}
          }
          async function toggle(note,completed) {
            if(operation.current||pending.current.has(note.id))return;
            pending.current.add(note.id);setPendingIds(new Set(pending.current));setError('');
            // Keep keyed rows mounted and never put the whole card into a dimmed loading state.
            setNotes(items=>items.map(n=>n.id===note.id?{...n,completed}:n));
            try{
              const result=await run({action:'update',id:note.id,completed});
              if(alive.current)setNotes(items=>items.map(n=>n.id===note.id?{...n,completed:result.note.completed,updatedAt:result.note.updatedAt}:n));
            }catch(e){if(alive.current&&e.name!=='AbortError'){setNotes(items=>items.map(n=>n.id===note.id?{...n,completed:note.completed}:n));setError(e.message);}}
            finally{pending.current.delete(note.id);if(alive.current)setPendingIds(new Set(pending.current));}
          }
          const visible=visibleNotes(notes,filter,search,calendarOpen?selectedDate:null);
          const dateCounts=new Map();
          for(const note of visibleNotes(notes,filter,search)){if(note.dueDate){const count=dateCounts.get(note.dueDate)||{total:0,pending:0};count.total++;if(!note.completed)count.pending++;dateCounts.set(note.dueDate,count);}}
          const activeLocale=ctx.locale.getSnapshot().active.startsWith('zh')?'zh-CN':'en-US';
          const monthLabel=new Intl.DateTimeFormat(activeLocale,{year:'numeric',month:'long'}).format(calendarDate(month.year,month.month));
          const button=(label,onClick,props={})=>h('button',{type:'button',disabled:busy,onClick,...props},label);
          const iconButton=(kind,label,onClick,props={})=>button(h(Glyph,{kind}),onClick,{className:'tn-icon-button',title:label,'aria-label':label,...props});
          const open=id=>{show(false);ctx.uiWorkspace.openSession(id);};
          function selectDraft(note){if(draft){setError(t('unsaved'));return;}setError('');setLaunching(null);setDraft({id:note.id,title:note.title,body:note.body,dueDate:note.dueDate||null});}
          function closeSearch(){setSearchOpen(false);setSearch('');searchButton.current?.focus();}
          function quickAdd(e){e.preventDefault();if(composing.current||operation.current||!quickTitle.trim())return;const title=quickTitle.trim();mutate({action:'create',title,...(calendarOpen&&selectedDate?{dueDate:selectedDate}:{})},()=>{setQuickTitle('');quickInput.current?.focus();});}
          function showToday(){const now=new Date();setToday(localDayKey(now));setMonth({year:now.getFullYear(),month:now.getMonth()});setSelectedDate(localDayKey(now));}
          function shiftMonth(delta){const date=calendarDate(month.year,month.month+delta);setMonth({year:date.getFullYear(),month:date.getMonth()});setSelectedDate(null);}
          function collapseCalendar(){setCalendarOpen(false);setSelectedDate(null);calendarButton.current?.focus();}
          function toggleCalendar(){if(calendarOpen){collapseCalendar();return;}showToday();setCalendarOpen(true);}
          function Calendar(){
            return h('div',{className:'tn-calendar','aria-label':t('calendar')},
              h('div',{className:'tn-cal-head'},h('strong',null,monthLabel),h('div',{className:'tn-tools'},
                button('‹',()=>shiftMonth(-1),{'aria-label':t('prevMonth'),disabled:month.year===1&&month.month===0}),
                button(t('today'),showToday,{disabled:false}),button('›',()=>shiftMonth(1),{'aria-label':t('nextMonth'),disabled:month.year===9999&&month.month===11}))),
              h('div',{className:'tn-cal-grid'},...Array.from({length:7},(_,i)=>h('span',{key:`weekday-${i}`,className:'tn-cal-weekday'},t(`weekday${i}`))),
                ...monthDays(month.year,month.month).map((day,index)=>day?button(h(React.Fragment,null,day.day,dateCounts.has(day.key)&&h('span',{className:'tn-cal-dot','data-pending':dateCounts.get(day.key).pending>0,'aria-hidden':true})),()=>setSelectedDate(day.key),{key:day.key,className:'tn-cal-day',disabled:false,'data-today':day.key===today,'aria-pressed':selectedDate===day.key,'aria-label':`${day.key} · ${dateCounts.get(day.key)?.total||0} ${t('count')}`}):h('span',{key:`empty-${index}`}))),
              h('div',{className:'tn-cal-caption'},h('span',null,selectedDate||t('allDates')),h('div',{className:'tn-tools'},button(t('allDates'),()=>setSelectedDate(null),{disabled:false}),button(t('collapseCalendar'),collapseCalendar,{disabled:false}))));
          }
          return h('section',{className:'tn-page','aria-label':t('title'),onFocusCapture:()=>{const current=localDayKey();if(current!==today)setToday(current);}}, h('style',null,css),
            h('header',{className:'tn-head'},h('h1',null,t('title')),h('div',{className:'tn-tools'},
              iconButton('search',t(searchOpen?'closeSearch':'search'),()=>searchOpen?closeSearch():setSearchOpen(true),{ref:searchButton,disabled:false,'aria-expanded':searchOpen,'aria-controls':'tn-search-input'}),
              iconButton('calendar',t(calendarOpen?'list':'calendar'),toggleCalendar,{ref:calendarButton,'aria-pressed':calendarOpen,disabled:false}),
              iconButton('refresh',t('refresh'),refresh,{disabled:busy||pendingIds.size>0}),iconButton('close',t('close'),()=>show(false),{disabled:false}))),
            searchOpen&&h('div',{className:'tn-search-wrap'},h('input',{id:'tn-search-input',ref:searchInput,className:'tn-search',type:'search',placeholder:t('search'),'aria-label':t('search'),value:search,onChange:e=>setSearch(e.target.value),onKeyDown:e=>{if(e.key==='Escape'&&!e.nativeEvent.isComposing&&e.keyCode!==229){e.stopPropagation();closeSearch();}}})),
            h('div',{className:'tn-toolbar'},...['all','active','done'].map(f=>button(t(f),()=>setFilter(f),{key:f,disabled:false,'aria-pressed':filter===f}))),
            h('p',{className:'tn-count','aria-live':'polite'},loading?t('loading'):`${notes.filter(n=>!n.completed).length} / ${notes.length} ${t('count')}`),
            error&&h('div',{role:'alert',className:'tn-error'},error,partial&&button(t('open'),()=>open(partial))),
            h('div',{className:'tn-scroll'},
              calendarOpen&&Calendar(),
              draft&&h('form',{className:'tn-editor',onCompositionStartCapture:()=>{editingComposing.current=true;},onCompositionEndCapture:()=>{editingComposing.current=false;},onKeyDown:e=>{if(e.key==='Enter'&&(e.nativeEvent.isComposing||editingComposing.current||e.keyCode===229))e.preventDefault();},onSubmit:e=>{e.preventDefault();if(editingComposing.current)return;if(draft.title.trim())mutate({action:'update',...draft,title:draft.title.trim()},()=>setDraft(null));}},h('h2',null,t('edit')),
                h('label',{className:'tn-label'},t('task'),h('input',{autoFocus:true,required:true,maxLength:500,value:draft.title,disabled:busy,onChange:e=>setDraft({...draft,title:e.target.value})})),
                h('label',{className:'tn-label'},t('dueDate'),h('input',{type:'date',min:'0001-01-01',max:'9999-12-31',value:draft.dueDate||'',disabled:busy,onChange:e=>setDraft({...draft,dueDate:e.target.value||null})})),
                draft.dueDate&&button(t('clearDate'),()=>setDraft({...draft,dueDate:null})),
                h('label',{className:'tn-label'},t('note'),h('textarea',{placeholder:t('notePlaceholder'),maxLength:100000,value:draft.body,disabled:busy,onChange:e=>setDraft({...draft,body:e.target.value})})),
                h('div',{className:'tn-tools'},h('button',{type:'submit',className:'tn-primary',disabled:busy||!draft.title.trim()},busy?t('busy'):t('save')),button(t('cancel'),()=>setDraft(null)))),
              h('div',{className:'tn-list'},...visible.map(n=>{
                const rowBusy=busy||pendingIds.has(n.id);
                return h('article',{key:n.id,className:'tn-row','data-done':n.completed,'aria-busy':pendingIds.has(n.id)},
                  h('input',{type:'checkbox',checked:n.completed,disabled:rowBusy,'aria-label':`${t(n.completed?'undo':'complete')}: ${n.title}`,onChange:e=>toggle(n,e.target.checked)}),
                  h('div',{className:'tn-row-main'},h('h2',{className:'tn-row-title'},n.title),n.dueDate&&h('p',{className:'tn-deadline','data-state':deadlineState(n,today)},`${deadlineState(n,today)==='overdue'?t('overdue'):deadlineState(n,today)==='today'?t('dueToday'):t('dueOn')} · ${n.dueDate}`),n.body&&h('p',{className:'tn-preview'},n.body),
                    h('div',{className:'tn-tools'},button(t('edit'),()=>selectDraft(n),{disabled:rowBusy}),button(t('start'),()=>{if(draft){setError(t('unsaved'));return;}setLaunching(n.id);},{disabled:rowBusy}),n.sessionId&&button(t('open'),()=>open(n.sessionId)),button(t('remove'),()=>{if(draft){setError(t('unsaved'));return;}mutate({action:'delete',id:n.id},()=>{if(launching===n.id)setLaunching(null);});},{className:'tn-danger',disabled:rowBusy})),
                    launching===n.id&&h('div',{className:'tn-launch'},h('p',null,t('launchHelp')),h('label',{className:'tn-label'},t('cwd'),h('input',{value:cwd,disabled:busy,onChange:e=>setCwd(e.target.value)})),h('div',{className:'tn-tools'},button(busy?t('busy'):t('launch'),()=>mutate({action:'start_chat',id:n.id,cwd:cwd.trim()},r=>{setLaunching(null);open(r.sessionId);}),{className:'tn-primary',disabled:rowBusy||!cwd.trim()}),button(t('cancel'),()=>setLaunching(null))))));
              }),!loading&&!visible.length&&h('div',{className:'tn-empty'},t(calendarOpen&&selectedDate?'noTasksOnDate':'empty')))),
            h('form',{className:'tn-add',onSubmit:quickAdd},h('div',{className:'tn-add-field'},h('span',{className:'tn-add-plus','aria-hidden':true},'+'),h('input',{ref:quickInput,type:'text',placeholder:calendarOpen&&selectedDate?`${t('add')} · ${selectedDate}`:t('add'),'aria-label':calendarOpen&&selectedDate?`${t('add')} · ${selectedDate}`:t('add'),maxLength:500,value:quickTitle,readOnly:busy,onChange:e=>setQuickTitle(e.target.value),onCompositionStart:()=>{composing.current=true;},onCompositionEnd:()=>{composing.current=false;},onKeyDown:e=>{if(e.key==='Enter'&&(e.nativeEvent.isComposing||composing.current||e.keyCode===229))e.preventDefault();}}),quickTitle.trim()&&h('button',{type:'submit',className:'tn-icon-button',title:t('add'),'aria-label':t('add'),disabled:busy},'↵'))));
        }
        function Card() {
          const isOpen=useSyncExternalStore(subscribe,()=>opened),card=useRef(null),cardComposing=useRef(false);
          useEffect(()=>{if(isOpen)card.current?.focus();},[isOpen]);
          if(!isOpen)return null;
          return h('aside',{id:'tn-floating-card',className:'tn-floating',ref:card,tabIndex:-1,'aria-label':translate('title'),onCompositionStartCapture:()=>{cardComposing.current=true;},onCompositionEndCapture:()=>{cardComposing.current=false;},onKeyDown:e=>{if(e.key==='Escape'&&!e.nativeEvent.isComposing&&!cardComposing.current&&e.keyCode!==229){e.stopPropagation();show(false);}}},h(Page));
        }
        ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'todo-note-card-calendar-v2',order:20},Card));
        ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({name:'sidebar.footer.action',id:'todo-note',order:10,label:()=>translate('todo')},Footer));
      }
    };
  }
});
