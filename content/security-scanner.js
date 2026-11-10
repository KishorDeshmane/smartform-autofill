(function(root){
  const trackerRules=[['Google Analytics','google-analytics|googletagmanager|gtag','Medium'],['Meta Pixel','connect.facebook.net|fbq','Medium'],['Hotjar','hotjar','High'],['FullStory','fullstory','High'],['Mixpanel','mixpanel','Medium'],['TikTok Pixel','analytics.tiktok.com|ttq','Medium'],['Intercom','intercom','Medium'],['Clarity','clarity.ms','Medium']];
  /** Creates a finding record with the supplied severity, remediation, and OWASP category. */
  const finding=(id,title,severity,description,remediation,owasp='A05:2021',confidence='Medium')=>({id,title,severity,confidence,description,remediation,owasp});
  /** Runs heuristic page checks and returns findings, warnings, and a bounded score. */
  function scan(){
    let findings=[];
    const warnings=[], doc=root.document, html=doc.documentElement?.outerHTML||'';
    const secure=location.protocol==='https:';
    if(!secure&&doc.querySelector('input[type=password],input[autocomplete*=cc- i]')) findings.push(finding('insecure-credentials','Credentials or payment fields on HTTP','High','Sensitive fields are present on a non-HTTPS page.','Serve the page over HTTPS.','A02:2021'));
    doc.querySelectorAll('form').forEach(f=>{try{if(new URL(f.getAttribute('action')||location.href,location.href).protocol==='http:')findings.push(finding('mixed-form','Form submits over HTTP','High','The form action uses an unencrypted HTTP URL.','Use an HTTPS form action.','A02:2021'))}catch (_) { /* Best-effort fallback: failure is intentionally non-fatal. */ }});
    doc.querySelectorAll('input[type="password"]').forEach(input=>{
      const autocomplete=(input.getAttribute('autocomplete')||'').toLowerCase();
      if(!autocomplete||autocomplete==='off')findings.push(finding('password-autocomplete','Password field has missing or disabled autocomplete guidance','Low','Password autocomplete settings may interfere with password managers or safe credential handling.','Use an appropriate autocomplete token such as current-password or new-password.','A07:2021','Low'));
    });
    doc.querySelectorAll('a[target="_blank"]').forEach(link=>{
      const rel=new Set((link.getAttribute('rel')||'').toLowerCase().split(/\s+/));
      if(!rel.has('noopener'))findings.push(finding('blank-target-noopener','New-tab link lacks rel=noopener','Medium','A target="_blank" link does not declare opener isolation.','Add rel="noopener" (and noreferrer if referrer removal is desired).','A05:2021'));
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
    if(/\beval\s*\(|new\s+Function\s*\(|document\.write\s*\(/.test(html))findings.push(finding('dangerous-script','Dangerous script pattern','High','The page source contains eval, Function or document.write patterns.','Remove dynamic code execution and use safe DOM APIs.','A03:2021'));
    doc.querySelectorAll('script[src]').forEach(s=>{if(/^https?:\/\//.test(s.src)&&!s.integrity)findings.push({...finding('missing-sri','CDN script without SRI','Medium','An external script has no integrity (SRI) attribute, so a changed or hacked copy would still run.','Add a verified integrity hash and crossorigin.','A08:2021'),affected:[s.src]})});
    trackerRules.forEach(([name,pattern,severity])=>{if(new RegExp(pattern,'i').test(html))findings.push(finding(`tracker-${name.toLowerCase().replace(/\W+/g,'-')}`,`${name} tracker detected`,severity,'A third-party tracking pattern was found in page resources.','Review consent, purpose and data-sharing controls.','A09:2021'))});
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
    const scripts=Array.from(doc.scripts).map(s=>s.textContent||'').join('\n');
    if(/new\s+WebSocket\s*\(\s*["'`]ws:|WebRTC|RTCPeerConnection|postMessage\s*\(/i.test(scripts))findings.push(finding('network-pattern','Risky client network pattern','Medium','Insecure WebSocket, WebRTC or postMessage usage requires review.','Use wss, validate event.origin and review IP exposure.','A05:2021'));
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
    const severityWeight={Critical:30,High:18,Medium:4,Low:2};
    const totalPenalty=findings.reduce((n,f)=>n+(severityWeight[f.severity]||2),0);
    const score=Math.max(0, 100 - Math.min(60, totalPenalty));
    return {score,findings,warnings,status:warnings.length?'UNVERIFIED':'COMPLETE',counts:findings.reduce((a,f)=>(a[f.severity]=(a[f.severity]||0)+1,a),{}),url:location.href,scannedAt:new Date().toISOString(),pass:findings.length===0&&warnings.length===0};
  }
  root.SFFASecurityScanner={scan};
})(window);
