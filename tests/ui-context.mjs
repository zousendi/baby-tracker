import {releaseStorageKey} from '../lib/release-notes.mjs';
// Business regressions run as a returning reader; announcement behavior is
// independently covered by entry-ui.mjs with fresh, unmodified storage.
export async function createTestContext(browser,options){
  const context=await browser.newContext(options);
  await context.addInitScript(key=>localStorage.setItem(key,'1'),releaseStorageKey());
  return context;
}
