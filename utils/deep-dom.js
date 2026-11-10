(function(root){
  const ids=new WeakMap();let next=0;
  // Assigns a stable, incrementing identity to each node seen by this module.
  /** Assigns and returns an incrementing identity for a node. */
  const identity=node=>{if(!ids.has(node))ids.set(node,++next);return ids.get(node);};
  /** Checks computed visibility and excludes hidden or zero-sized elements. */
  function visible(el){
    if(!el?.isConnected)return false;
    for(let n=el;n;n=n.parentElement||n.getRootNode()?.host){
      if(n.hidden||n.hasAttribute('inert'))return false;
      const s=n.ownerDocument.defaultView.getComputedStyle(n);
      if(s.display==='none'||s.visibility==='hidden'||parseFloat(s.opacity)===0)return false;
    }
    const r=el.getBoundingClientRect();return r.width>0&&r.height>0;
  }
  /** Collects the document and reachable open shadow roots and same-origin frames. */
  function scopes(){
    const out=[],seen=new WeakSet();let count=0;
    /** Adds a scope and recursively visits its visible shadow roots and frames. */
    function walk(scope,depth){
      if(!scope||seen.has(scope)||depth>8)return;seen.add(scope);out.push(scope);
      for(const el of scope.querySelectorAll('*')){
        if(++count>10000)return;
        if(el.shadowRoot&&visible(el))walk(el.shadowRoot,depth+1);
        if(el.tagName==='IFRAME'&&visible(el))try{if(el.contentDocument?.documentElement)walk(el.contentDocument,depth+1);}catch (_) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
      }
    }
    walk(root.document,0);return out;
  }
  /** Queries every collected scope and returns the matching elements as an array. */
  /** Queries each collected scope and returns all matching nodes. */
  const queryAll=selector=>scopes().flatMap(s=>Array.from(s.querySelectorAll(selector)));
  /** Builds a stable locator key from an element's identifying attributes and ancestry. */
  function key(el){
    const scope=el.getRootNode();const prefix=identity(scope);
    if(el.id&&scope.querySelectorAll('#'+CSS.escape(el.id)).length===1)return `${prefix}#${el.id}`;
    const parts=[];for(let n=el;n?.nodeType===1;n=n.parentElement)parts.unshift(`${n.tagName}:${Array.from(n.parentNode?.children||[]).indexOf(n)}`);
    return prefix+':'+parts.join('/');
  }
  /** Resolves an ID in the element's root first, then falls back to its owner document. */
  function byId(el,id){return el.getRootNode().getElementById?.(id)||el.ownerDocument.getElementById(id);}
  root.SFFADeepDOM={scopes,queryAll,key,byId,visible};
})(window);
