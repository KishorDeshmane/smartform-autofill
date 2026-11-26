(function(root){
  // [name, resource URL pattern, inline-script call pattern, severity]. Only real script/frame/image/style URLs and
  // inline script code are checked, so a page that merely mentions "hotjar" or "intercom" in its text is not flagged.
  const trackerRules=[
    ['Google Analytics',/google-analytics\.com|googletagmanager\.com/i,/\bgtag\s*\(|\bga\s*\(\s*['"]create/,'Medium'],
    ['Meta Pixel',/connect\.facebook\.net/i,/\bfbq\s*\(/,'Medium'],
    ['Hotjar',/(?:static|script)\.hotjar\.com/i,/\b_hjSettings\b|\bhj\s*\(\s*['"]/,'High'],
    ['FullStory',/fullstory\.com/i,/\b_fs_org\b|\bFS\.(?:identify|event)\s*\(/,'High'],
    ['Mixpanel',/mixpanel\.com|mxpnl\.com/i,/\bmixpanel\.(?:init|track)\s*\(/,'Medium'],
    ['TikTok Pixel',/analytics\.tiktok\.com/i,/\bttq\.(?:load|track|page)\s*\(/,'Medium'],
    ['Intercom',/widget\.intercom\.io|js\.intercomcdn\.com/i,/\bintercomSettings\b|\bIntercom\s*\(\s*['"]/,'Medium'],
    ['Clarity',/clarity\.ms/i,/\bclarity\s*\(\s*['"]/,'Medium']
  ];
  // Script types that hold data or templates, not code.
  const NON_CODE_SCRIPT=/json|template|text\/(?:html|x-|plain)|importmap|speculationrules/i;
  /** Creates a finding record with the supplied severity, remediation, and OWASP category. */
  const finding=(id,title,severity,description,remediation,owasp='A05:2021',confidence='Medium')=>({id,title,severity,confidence,description,remediation,owasp});
  /** Runs heuristic page checks and returns findings, warnings, and a bounded score. */
  function scan(){
    let findings=[];
    const warnings=[], doc=root.document;
    // Code of inline scripts only (no data blocks, no visible page text).
    const inlineCode=Array.from(doc.scripts).filter(s=>!s.src&&!NON_CODE_SCRIPT.test(s.type||'')).map(s=>s.textContent||'').join('\n');
    const secure=location.protocol==='https:';
    if(!secure&&doc.querySelector('input[type=password],input[autocomplete*=cc- i]')) findings.push(finding('insecure-credentials','Credentials or payment fields on HTTP','High','Sensitive fields are present on a non-HTTPS page.','Serve the page over HTTPS.','A02:2021'));
    doc.querySelectorAll('form').forEach(f=>{try{if(new URL(f.getAttribute('action')||location.href,location.href).protocol==='http:')findings.push(finding('mixed-form','Form submits over HTTP','High','The form action uses an unencrypted HTTP URL.','Use an HTTPS form action.','A02:2021'))}catch (_) { /* Best-effort fallback: failure is intentionally non-fatal. */ }});
    doc.querySelectorAll('input[type="password"]').forEach(input=>{
      const autocomplete=(input.getAttribute('autocomplete')||'').toLowerCase();
      if(!autocomplete||autocomplete==='off')findings.push(finding('password-autocomplete','Password field has missing or disabled autocomplete guidance','Low','Password autocomplete settings may interfere with password managers or safe credential handling.','Use an appropriate autocomplete token such as current-password or new-password.','A07:2021','Low'));
    });
    doc.querySelectorAll('a[target="_blank"]').forEach(link=>{
      const rel=new Set((link.getAttribute('rel')||'').toLowerCase().split(/\s+/));
      // Current browsers already treat target=_blank as noopener, so this is only a hardening hint for old browsers.
      if(!rel.has('noopener')&&!rel.has('noreferrer'))findings.push(finding('blank-target-noopener','New-tab link lacks rel=noopener','Low','A target="_blank" link does not declare opener isolation. Current browsers add it by default; older browsers do not.','Add rel="noopener" (and noreferrer if referrer removal is desired).','A05:2021','Low'));
    });
    doc.querySelectorAll('script[src],link[href],img[src],iframe[src]').forEach(el=>{const u=el.src||el.href;if(secure&&/^http:/.test(u))findings.push({...finding('mixed-content','Mixed-content resource','High','A file (script, style, image or frame) loads over unencrypted HTTP on this HTTPS page.','Use HTTPS resources.','A05:2021'),affected:[u]})});
    doc.querySelectorAll('[onclick],[onload],[onerror],[onmouseover]').forEach(()=>findings.push(finding('inline-handler','Inline event handler','Medium','Inline handlers complicate CSP and increase XSS risk.','Use addEventListener and a strict CSP.','A05:2021')));
    const secretish=[];
    doc.querySelectorAll('input,textarea,[data-token],[data-secret]').forEach(el=>{
      const key=[el.name,el.id,el.getAttribute('autocomplete'),...Array.from(el.attributes||[]).filter(a=>/^data-(?:token|secret|api-key)/i.test(a.name)).map(a=>a.name)].join(' ');
      const value=el.value||el.getAttribute('data-token')||el.getAttribute('data-secret')||'';
      if(/api.?key|secret|access.?token|private.?key|client.?secret/i.test(key)&&value.length>=12)secretish.push(el);
    });
    if(secretish.length)findings.push(finding('visible-secret-like-data','Secret-like value exposed in page controls','High',`${secretish.length} control(s) contain values whose field names and lengths resemble secrets. Values are not included in this report.`,'Remove server credentials and private tokens from page markup; rotate exposed credentials.','A02:2021','Low'));
    const forms=Array.from(doc.forms);
    const formsWithoutToken=forms.filter(form=>!form.querySelector('input[type="hidden"][name*="csrf" i],input[type="hidden"][name*="token" i],input[type="hidden"][name*="nonce" i]'));
    if(formsWithoutToken.length)warnings.push({id:'csrf-token-not-observed',severity:'Info',confidence:'Low',status:'UNVERIFIED',description:`${formsWithoutToken.length} form(s) have no obvious hidden CSRF-like token; server-side protections cannot be determined from page markup.`});
    const dangerous=[[/\beval\s*\(/,'eval()'],[/\bnew\s+Function\s*\(/,'new Function()'],[/\bdocument\.write(?:ln)?\s*\(/,'document.write()']].filter(([re])=>re.test(inlineCode)).map(([,name])=>name);
    if(dangerous.length)findings.push({...finding('dangerous-script','Dangerous script pattern','High',`An inline script on the page uses ${dangerous.join(', ')}.`,'Remove dynamic code execution and use safe DOM APIs.','A03:2021'),affected:dangerous});
    doc.querySelectorAll('script[src]').forEach(s=>{if(/^https?:\/\//.test(s.src)&&!s.integrity)findings.push({...finding('missing-sri','CDN script without SRI','Medium','An external script has no integrity (SRI) attribute, so a changed or hacked copy would still run.','Add a verified integrity hash and crossorigin.','A08:2021'),affected:[s.src]})});
    const resourceUrls=Array.from(doc.querySelectorAll('script[src],iframe[src],img[src],link[href]')).map(el=>el.getAttribute('src')||el.getAttribute('href')||'');
    trackerRules.forEach(([name,urlPattern,callPattern,severity])=>{
      const urls=resourceUrls.filter(u=>urlPattern.test(u));
      if(!urls.length&&!urlPattern.test(inlineCode)&&!callPattern.test(inlineCode))return;
      findings.push({...finding(`tracker-${name.toLowerCase().replace(/\W+/g,'-')}`,`${name} tracker detected`,severity,urls.length?'A third-party tracking script or pixel is loaded by this page.':'An inline script on this page sets up a third-party tracker.','Review consent, purpose and data-sharing controls.','A09:2021'),affected:urls.slice(0,10)});
    });
    const storage=[];
    for(const name of ['localStorage','sessionStorage']) {
      try {
        const store=root[name];
        if(!store) throw new Error('Storage unavailable');
        for(let i=0;i<store.length;i++) {
          const key=store.key(i)||'',val=store.getItem(key)||'';
          if(/token|secret|password|api[-_]?key|jwt|session/i.test(key+' '+val))storage.push(key);
        }
      } catch(_) {
        warnings.push({id:'storage-unavailable',component:name,status:'UNVERIFIED',description:`${name} could not be inspected because browser access is unavailable.`});
      }
    }
    if(storage.length)findings.push(finding('sensitive-storage','Sensitive data in browser storage','High',`Potential secret-bearing storage keys: ${storage.slice(0,10).join(', ')}`,'Prefer HttpOnly Secure cookies and avoid storing secrets in web storage.','A02:2021'));
    if(/new\s+WebSocket\s*\(\s*["'`]ws:/i.test(inlineCode))findings.push(finding('insecure-websocket','Unencrypted WebSocket','Medium','An inline script opens a WebSocket over plain ws:// instead of wss://.','Use wss:// for WebSocket connections.','A02:2021'));
    if(/RTCPeerConnection|\.postMessage\s*\(/.test(inlineCode))findings.push(finding('network-pattern','Cross-window or peer messaging to review','Low','An inline script uses postMessage or WebRTC. This is common and only a risk if message origins are not checked.','Validate event.origin in message handlers and review WebRTC IP exposure.','A05:2021','Low'));
    const grouped=new Map();
    for(const item of findings) {
      const key=JSON.stringify([item.id,item.severity]);
      const existing=grouped.get(key);
      if(existing) {
        existing.occurrences++;
        for(const a of item.affected||[]) if(!existing.affected.includes(a)) existing.affected.push(a);
      } else grouped.set(key,{...item,affected:[...(item.affected||[])],occurrences:1});
    }
    findings=Array.from(grouped.values());
    for(const item of findings) {
      if(!item.affected.length) delete item.affected;
      if(item.occurrences>1) item.description+=` (${item.occurrences} occurrences; scored once.)`;
    }
    // Each distinct issue costs points once (repeats are grouped above) and there is no floor, so a page with many
    // serious problems can reach 0. Any High finding keeps the score below 80, any Critical below 50.
    const severityWeight={Critical:35,High:15,Medium:5,Low:1};
    const totalPenalty=findings.reduce((n,f)=>n+(severityWeight[f.severity]??1),0);
    let score=Math.max(0,100-totalPenalty);
    if(findings.some(f=>f.severity==='High'))score=Math.min(score,79);
    if(findings.some(f=>f.severity==='Critical'))score=Math.min(score,49);
    return {score,findings,warnings,status:warnings.length?'UNVERIFIED':'COMPLETE',counts:findings.reduce((a,f)=>(a[f.severity]=(a[f.severity]||0)+1,a),{}),url:location.href,scannedAt:new Date().toISOString(),pass:findings.length===0&&warnings.length===0};
  }
  root.SFFASecurityScanner={scan};
})(window);
