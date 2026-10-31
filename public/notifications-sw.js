/* Push only: deliberately no fetch handler, offline cache, or forced reload. */
self.addEventListener('push', event => {
  let data={};
  try{data=event.data?.json()||{};}catch{/* Always show a generic visible notification. */}
  const title='こもれび';
  const body=typeof data.body==='string'?data.body.slice(0,160):'育児記録をご確認ください。';
  event.waitUntil(self.registration.showNotification(title,{
    body,icon:'/app-icon-192.png',badge:'/app-icon-192.png',
    tag:typeof data.tag==='string'?data.tag:'komorebi',data:{url:'/'},
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const app=windows.find(client=>new URL(client.url).origin===self.location.origin);
    if(app)return app.focus();
    return self.clients.openWindow('/');
  })());
});
