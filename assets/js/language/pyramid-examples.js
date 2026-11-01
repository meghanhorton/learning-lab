(function(){
  function sync(){const link=document.getElementById('pyramid-examples-link');if(!link)return;const url=new URL('pyramid_links.html',location.href);const params=new URLSearchParams(location.hash.slice(1));if(params.has('create'))url.hash='create='+params.get('create');link.href=url.href;}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync);else sync();
  window.addEventListener('hashchange',sync);
})();
