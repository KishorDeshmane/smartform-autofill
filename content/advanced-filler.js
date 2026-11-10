(function(root){
  /** Resolves after the specified delay. */
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  /** Queries deep DOM scopes when available, otherwise the current document. */
  const all=s=>root.SFFADeepDOM?root.SFFADeepDOM.queryAll(s):Array.from(document.querySelectorAll(s));
  /** Delegates visibility checks to the deep-DOM or form-detector helper. */
  const visible=el=>root.SFFADeepDOM?root.SFFADeepDOM.visible(el):root.SFFAFormDetector.isVisible(el);
  /** Applies required/optional fill scope to an individual control. */
  function inFieldScope(el,scope){
    if(!scope||(scope.includeRequired!==false&&scope.includeOptional!==false))return true;
    const group=el.closest('[role="group"], [role="radiogroup"], fieldset');
    const required=!!el.required||el.getAttribute('aria-required')==='true'||group?.getAttribute('aria-required')==='true';
    return required?scope.includeRequired!==false:scope.includeOptional!==false;
  }
  /** Checks that a widget is connected and not disabled or read-only. */
  const enabled=el=>el?.isConnected&&!el.matches(':disabled')&&el.getAttribute('aria-disabled')!=='true'&&!el.readOnly;
  /** Dispatches a bubbling, composed event using the element's own window. */
  function emit(el,type,init={}){const w=el.ownerDocument.defaultView;el.dispatchEvent(new w.Event(type,{bubbles:true,composed:true,...init}));}
  /** Writes a value through native setters where possible and dispatches input/change events. */
  function write(el,value){
    if(!enabled(el))return false;
    const w=el.ownerDocument.defaultView;
    if(el.matches('input,textarea')){
      const proto=el.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:w.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,'value').set.call(el,String(value));
    }else{
      el.focus();
      let edited=false;
      try {
        const sel=w.getSelection();
        const range=w.document.createRange(); range.selectNodeContents(el);
        sel.removeAllRanges(); sel.addRange(range);
        edited=!!w.document.execCommand?.('insertText',false,String(value));
      } catch (_) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
      if(!edited) {
        el.dispatchEvent(new w.InputEvent('beforeinput',{bubbles:true,composed:true,cancelable:true,inputType:'insertText',data:String(value)}));
        el.textContent=String(value);
      }
    }
    emit(el,'input');emit(el,'change');return (el.matches('input,textarea')?el.value:el.textContent)===String(value);
  }
  /** Combines field metadata and label text for heuristic field classification. */
  function signature(el){return [el.name,el.id,el.getAttribute('aria-label'),el.getAttribute('autocomplete'),...(Array.from(el.labels||[]).map(l=>l.textContent))].join(' ').toLowerCase();}
  /** Classifies fields that need special handling, such as passwords and one-time codes. */
  function sensitiveKind(el){
    if(el.type==='password'&&/password|pwd|passcode|current-password|new-password/.test(signature(el)))return 'password';
    if(el.autocomplete==='one-time-code'||/\botp\b|verification.?code|one.?time.?password/.test(signature(el)))return 'otp';
    return null;
  }
  /** Attempts a sample value for supported simple HTML patterns; returns null otherwise. */
  function patternValue(pattern){
    if(!pattern||pattern.length>200||/[()|]/.test(pattern)||/\\[1-9]/.test(pattern))return null;
    let s=pattern.replace(/^\^/,'').replace(/\$$/,'');let out='';
    while(s.length){
      let m=/^(\[[^\]]+\]|\\[dws]|\\.|[A-Za-z0-9 _@.\-])(?:\{(\d+)(?:,(\d*))?\}|([+?*]))?/.exec(s);
      if(!m)return null;
      let token=m[1],char=token==='\\d'?'7':token==='\\w'?'A':token==='\\s'?' ':token.startsWith('[')?(token.includes('A-Z')?'A':token.includes('a-z')?'a':token.includes('0-9')?'7':token[1]):token.startsWith('\\')?token[1]:token;
      if(token.startsWith('[^'))return null;
      const count=m[2]!==undefined?Number(m[2]):m[4]==='+'?1:m[4]==='*'||m[4]==='?'?0:1;
      if(count>256||out.length+count>512)return null;
      out+=char.repeat(count);s=s.slice(m[0].length);
    }
    try{return new RegExp('^(?:'+pattern+')$','u').test(out)?out:null;}catch(_){return null;}
  }
  /** Adjusts a proposed value to supported field constraints and bounds where possible. */
  function valueFor(el,proposed){
    let value=String(proposed==null?'QA test':proposed);
    if(el.type==='color')return /^#[0-9a-f]{6}$/i.test(value)?value:'#3366cc';
    if(el.type==='time'){
      /** Parses HH:MM[:SS] as seconds after midnight, or null when the value is invalid. */
      const parse=v=>{const m=/^(\d\d):(\d\d)(?::(\d\d))?$/.exec(v||'');return m?Number(m[1])*3600+Number(m[2])*60+Number(m[3]||0):null;};
      const min=parse(el.min),max=parse(el.max);let n=parse(value)??36000;
      const step=el.step==='any'?1:(Number(el.step)||60),base=min??parse(el.getAttribute('value'))??0;
      if(min!==null&&max!==null&&min>max)n=min;else n=Math.max(min??0,Math.min(max??86399,n));
      n=base+Math.round((n-base)/step)*step;if(max!==null&&(!el.min||min<=max)&&n>max)n-=step;
      if(n<0||n>86399)return '';
      return `${String(Math.floor(n/3600)).padStart(2,'0')}:${String(Math.floor(n/60)%60).padStart(2,'0')}`+(n%60?`:${String(n%60).padStart(2,'0')}`:'');
    }
    if(el.type==='range'){
      const min=el.min!==''?Number(el.min):0,max=el.max!==''?Number(el.max):100,step=el.step==='any'?0:(Number(el.step)||1);
      let n=Number(value);if(!Number.isFinite(n))n=(min+max)/2;n=Math.max(min,Math.min(max,n));
      if(step)n=min+Math.floor((n-min)/step)*step;return String(n);
    }
    if(el.pattern){try{if(!new RegExp('^(?:'+el.pattern+')$','u').test(value))value=patternValue(el.pattern)??value;}catch (_) { /* Best-effort fallback: failure is intentionally non-fatal. */ }}
    if(el.minLength>0&&value.length<el.minLength)value=value.padEnd(Math.min(el.minLength,512),'a');
    if(el.maxLength>=0)value=value.slice(0,el.maxLength);
    return value;
  }
  /** Selects matching options up to count, dispatches events, and reports selection success. */
  function chooseMany(el,values,count=2){
    if(!enabled(el))return false;
    if(!Array.isArray(values)||!values.some(v=>v!=null&&String(v).trim()!==''))return false;
    const options=Array.from(el.options).filter(o=>o.value&&!o.disabled&&!o.parentElement?.disabled&&!o.hidden&&!/^(select|choose)\b/i.test(o.text));
    const targets=(Array.isArray(values)?values:[values]).filter(v=>v!=null).map(v=>String(v).toLowerCase());
    let chosen=options.filter(o=>targets.includes(o.value.toLowerCase())||targets.includes(o.text.trim().toLowerCase()));
    if(!chosen.length)chosen=options.slice(0,Math.max(1,Math.min(10,count)));
    for(const o of el.options)o.selected=chosen.includes(o);emit(el,'input');emit(el,'change');
    return chosen.length>0&&chosen.every(o=>o.selected)&&Array.from(el.selectedOptions).length===chosen.length;
  }
  /** Opens a custom dropdown, selects a matching or first available option, and logs the outcome. */
  async function customChoice(field,data,log,settings={}){
    const el=field.element;if(!enabled(el))return {ok:false};
    const doc=el.ownerDocument,scope=el.getRootNode();
    const input=el.matches('input')?el:el.querySelector('input:not([readonly])');
    const desired=data[field.type];
    if(!field.type||desired==null||(Array.isArray(desired)&&!desired.length))return {ok:false,reason:'No mapped value for custom control'};
    const values=Array.isArray(desired)?desired:[desired];
    const multiple=el.getAttribute('aria-multiselectable')==='true'||el.hasAttribute('data-multiple')||!!el.querySelector('[aria-multiselectable="true"]');
    const rounds=multiple?Math.max(1,Math.min(10,settings.multiSelectCount||2)):1;
    let count=0,chosenText='';
    for(let round=0;round<rounds;round++){
      const before=new Set(all('[role="option"], .select-option, .ant-select-item-option, .MuiAutocomplete-option').filter(visible));
      el.click();
      if(input&&!input.readOnly){
        const query=values[round%values.length]??settings.autocompleteQuery??'a';write(input,String(query));
      }
      let options=[];const deadline=Date.now()+3000;
      while(Date.now()<deadline){
        const id=(el.getAttribute('aria-controls')||el.getAttribute('aria-owns')||input?.getAttribute('aria-controls')||'').split(/\s+/)[0];
        const list=id?(scope.getElementById?.(id)||doc.getElementById(id)):null;
        options=list?Array.from(list.querySelectorAll('[role="option"],li[data-value],.select-option,.ant-select-item-option,.MuiAutocomplete-option')):all('[role="option"], .select-option, .ant-select-item-option, .MuiAutocomplete-option').filter(o=>!before.has(o));
        if (!list && options.length > 0) {
          const visibleLists = all('[role="listbox"], [role="menu"], .dropdown-menu').filter(visible);
          if (visibleLists.length !== 1) options = [];
        }
        options=options.filter(o=>visible(o)&&!o.disabled&&o.getAttribute('aria-disabled')!=='true'&&o.getAttribute('aria-selected')!=='true'&&o.textContent.trim());
        if(options.length)break;await sleep(100);
      }
      if(!options.length)break;
      const target=String(values[round%values.length]??'').toLowerCase();
      const choice=(target&&options.find(o=>o.textContent.trim().toLowerCase()===target))||options[0];
      chosenText=choice.textContent.trim();choice.click();await sleep(180);
      const selected=choice.getAttribute('aria-selected')==='true'||[el.value,el.textContent,input?.value].some(v=>v&&String(v).includes(chosenText));
      if(!selected)break;count++;
    }
    if(el.getAttribute('aria-expanded')==='true')el.dispatchEvent(new el.ownerDocument.defaultView.KeyboardEvent('keydown',{key:'Escape',bubbles:true,composed:true}));
    return {ok:count>0,chosenText,count};
  }
  /** Fills supported custom widgets, skips unrelated controls, and stops when cancelled. */
  async function runWidgets(data,settings={},config={},isCancelled=()=>false){
    const results=[];const done=new Set();const widgets=all('[contenteditable="true"], [role="checkbox"], [role="switch"], [role="radio"], [role="slider"], [role="spinbutton"]');
    for(const el of widgets){
      if(!visible(el)||el.matches('input,textarea,select')||!enabled(el)||!inFieldScope(el,config.fieldScope))continue;
      const context=(el.getAttribute('aria-label')+' '+el.id+' '+el.className+' '+(el.parentElement?.textContent||'')).toLowerCase();
      const explicitWidget=el.hasAttribute('data-sffa-fill') || el.hasAttribute('data-test-fill') || /agree|consent|accept|terms|confirm|declare|rating|score|rich.?text|description|comment|note/.test(context);
      if(!explicitWidget && ['checkbox','switch','radio'].includes(el.getAttribute('role'))) { results.push({element:el.id||el.getAttribute('role'),kind:el.getAttribute('role'),ok:false,reason:'Skipped unrelated custom preference widget'}); continue; }
      if(isCancelled())throw Error('Run cancelled');
      const role=el.getAttribute('role');let ok=false,reason='Widget did not confirm the requested state';
      try{
        if(el.getAttribute('contenteditable')==='true'){
          if(el.parentElement?.closest('[contenteditable="true"]'))continue;
          ok=write(el,settings.richTextValue||'Sample QA content for verification.');await sleep(100);ok=ok&&el.textContent.trim().length>0;
        }else if(role==='checkbox'||role==='switch'||role==='radio'){
          if(role==='radio'){
            const group=el.closest('[role="radiogroup"]')||el.closest('fieldset')||el.parentElement;const groupKey=group?.getAttribute('data-group')||group?.id||group;if(done.has(groupKey))continue;done.add(groupKey);
          }
          if(el.getAttribute('aria-checked')!=='true')el.click();await sleep(100);ok=el.getAttribute('aria-checked')==='true';
        }else{
          const current=Number(el.getAttribute('aria-valuenow')),min=Number(el.getAttribute('aria-valuemin')||0),max=Number(el.getAttribute('aria-valuemax')||100);
          const target=Math.max(min,Math.min(max,(min+max)/2));
          el.focus();const w=el.ownerDocument.defaultView;
          el.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true,composed:true}));
          for(let i=0;i<20&&Number(el.getAttribute('aria-valuenow'))<target;i++){
            const previous=el.getAttribute('aria-valuenow');el.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,composed:true}));await sleep(15);if(el.getAttribute('aria-valuenow')===previous)break;
          }
          const now=Number(el.getAttribute('aria-valuenow'));ok=el.hasAttribute('aria-valuenow')&&Number.isFinite(now)&&now>=min&&now<=max&&(now!==current||current===target);
        }
      }catch(e){reason=e.message;}
      results.push({element:el.id||role||'rich text',kind:role||'richtext',ok,reason:ok?'Verified DOM state':reason});
    }
    return results;
  }
  /** Applies configured credential values to detected login and OTP fields. */
  async function credentials(settings={},config={}){
    const results=[];const credential=config.credentials||{};
    const password=credential.testPassword,otp=credential.testOtp;
    const safePassword=typeof password==='string'&&password.length>=4&&!/^(password|password123|123456|qwerty)/i.test(password)?password:null;
    const safeOtp=typeof otp==='string'&&/^[0-9]{4,8}$/.test(otp)?otp:null;
    const fields=all('input').filter(el=>visible(el)&&inFieldScope(el,config.fieldScope));
    const otpFields=fields.filter(el=>sensitiveKind(el)==='otp');
    const otpBoxes=otpFields.filter(el=>el.maxLength===1||el.getAttribute('maxlength')==='1');
    for(const el of fields){
      const kind=sensitiveKind(el);if(!kind||!enabled(el))continue;
      let value=kind==='password'?safePassword:safeOtp;
      if(kind==='otp'&&otpBoxes.length>1&&otpBoxes.includes(el))value=typeof safeOtp==='string'?safeOtp[otpBoxes.indexOf(el)]:null;
      const ok=value!=null&&value!==''&&write(el,value);
      results.push({element:el.id||kind,kind,ok,reason:ok?'Configured test value entered (redacted)':'No usable per-site test value configured'});
    }
    return results;
  }
  /** Runs configured row-add actions until target counts are reached or cancellation occurs. */
  async function repeatRows(config={},cancelled=()=>false){
    const results=[];
    if(config.fieldScope&&(config.fieldScope.includeRequired===false||config.fieldScope.includeOptional===false))return [{element:'repeat rows',kind:'repeatRows',ok:false,reason:'Skipped because row controls cannot be assigned safely to required/optional scope'}];
    for(const rule of config.repeatRows||[]){
      const count=Math.max(0,Math.min(10,Number(rule.count)||0));let added=0;
      for(let i=0;i<count;i++){
        if(cancelled())throw Error('Run cancelled');
        const candidates=all(rule.buttonSelector).filter(visible);if(candidates.length!==1||!enabled(candidates[0]))break;
        const before=all(rule.rowSelector).length;candidates[0].click();
        const deadline=Date.now()+2500;while(Date.now()<deadline&&all(rule.rowSelector).length<=before)await sleep(100);
        if(all(rule.rowSelector).length<=before)break;added++;
      }
      results.push({element:rule.buttonSelector,kind:'repeatRows',ok:added===count,reason:`Added ${added}/${count} configured rows`});
    }
    return results;
  }
  root.SFFAAdvancedFiller={valueFor,patternValue,chooseMany,customChoice,runWidgets,credentials,repeatRows,sensitiveKind,write};
})(window);
