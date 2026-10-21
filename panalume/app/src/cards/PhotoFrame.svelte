<script module>
  export const meta = {
    type: 'photo-frame', name: 'Photo frame', icon: 'mdi:image-multiple', category: 'Media',
    size: { w: 420, h: 300 }, tap: 'none',
    defaults: { folder: '', interval: 15, order: 'shuffle', fit: 'cover', zoom: true, subfolders: false, caption: false },
    fields: [
      { key: 'folder', label: 'Folder or album', type: 'media-folder', hint: 'From Home Assistant\'s media browser: your own media folders, Immich albums (with the Immich integration) and other photo sources.' },
      { key: 'subfolders', label: 'Include photos in folders inside it', type: 'bool' },
      { key: 'interval', label: 'Seconds per photo', type: 'number' },
      { key: 'order', label: 'Order', type: 'select', options: [{ value: 'shuffle', label: 'Shuffle' }, { value: 'order', label: 'In order' }] },
      { key: 'fit', label: 'Fit', type: 'select', options: [{ value: 'cover', label: 'Fill the card (crops edges)' }, { value: 'contain', label: 'Whole photo' }] },
      { key: 'zoom', label: 'Slow zoom', type: 'bool' },
      { key: 'caption', label: 'Show the photo\'s name', type: 'bool' },
    ],
  };
</script>

<script>
  // A photo frame: cycles through the photos in a folder or album from Home
  // Assistant's media browser, fading from one to the next. Tap for the next
  // photo. The list is re-read every half hour, so new photos appear on their own.
  import { send, conn } from '../lib/ha.svelte.js';
  let { props } = $props();

  const isPhoto = (c) => !c.can_expand && (c.media_class === 'image' || String(c.media_content_type || '').startsWith('image/'));
  let photos = $state([]);
  let loaded = $state(false);
  let error = $state('');
  let refresh = $state(0);
  $effect(() => {
    const i = setInterval(() => refresh++, 30 * 60e3);
    return () => clearInterval(i);
  });
  $effect(() => {
    refresh;
    const folder = props.folder, deep = !!props.subfolders, shuffle = props.order !== 'order';
    if (!folder || !conn.connected) return;
    let alive = true;
    const browse = (id) => send({ type: 'media_source/browse_media', media_content_id: id }).then((r) => r.children || []);
    (async () => {
      try {
        const top = await browse(folder);
        let list = top.filter(isPhoto);
        if (deep) for (const f of top.filter((c) => c.can_expand).slice(0, 25)) list = list.concat((await browse(f.media_content_id).catch(() => [])).filter(isPhoto));
        list = list.slice(0, 2000).map((c) => ({ id: c.media_content_id, title: c.title }));
        if (shuffle) for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
        if (alive) { photos = list; error = ''; loaded = true; }
      } catch (e) {
        if (alive) { error = e?.message || 'Could not open this folder'; loaded = true; }
      }
    })();
    return () => (alive = false);
  });

  // Two layers: the next photo loads behind the current one, then fades in.
  let layers = $state([{ src: '', title: '', key: 0 }, { src: '', title: '', key: 0 }]);
  let front = $state(0);
  let index = -1;
  let busy = false;
  async function next() {
    if (busy || !photos.length) return;
    busy = true;
    for (let tries = 0; tries < Math.min(5, photos.length); tries++) {
      index = (index + 1) % photos.length;
      const p = photos[index];
      try {
        const r = await send({ type: 'media_source/resolve_media', media_content_id: p.id });
        const src = /^https?:/.test(r.url) ? r.url : 'ha' + r.url;
        await new Promise((ok, bad) => { const im = new Image(); im.onload = ok; im.onerror = bad; im.src = src; });
        const back = 1 - front;
        layers[back] = { src, title: p.title, key: Date.now() };
        front = back;
        break;
      } catch {
        // A photo that won't load is skipped.
      }
    }
    busy = false;
  }
  const secs = $derived(Math.max(3, Number(props.interval) || 15));
  $effect(() => {
    if (!photos.length) return;
    index = -1;
    next();
    const i = setInterval(() => { if (document.visibilityState === 'visible') next(); }, secs * 1000);
    return () => clearInterval(i);
  });
  const cur = $derived(layers[front]);
</script>

<div class="pf" class:dark={photos.length > 0} class:contain={props.fit === 'contain'} class:zoom={props.zoom !== false} style="--secs:{secs + 2}s">
  {#each layers as l, i (i)}
    {#if l.src}
      {#key l.key}<img src={l.src} alt={l.title} class:on={i === front} />{/key}
    {/if}
  {/each}
  {#if !props.folder}
    <div class="msg">Choose a folder or album in the card's settings.</div>
  {:else if error}
    <div class="msg">{error}</div>
  {:else if loaded && !photos.length}
    <div class="msg">No photos in this folder</div>
  {:else if props.caption && cur.title}
    <div class="cap">{cur.title.replace(/\.(jpe?g|png|heic|webp|gif)$/i, '')}</div>
  {/if}
  {#if photos.length > 1}<button class="tap" data-stop onclick={next} aria-label="Next photo"></button>{/if}
</div>

<style>
  .pf { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; }
  .pf.dark { background: #000; }
  img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 1.2s ease; }
  .contain img { object-fit: contain; }
  img.on { opacity: 1; }
  .zoom:not(.contain) img.on { animation: drift var(--secs) ease-out both; }
  @keyframes drift { from { transform: scale(1.0); } to { transform: scale(1.06); } }
  .msg { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); font-size: .85em; padding: 16px; text-align: center; }
  .cap { position: absolute; left: 0; right: 0; bottom: 0; padding: 22px 14px 10px; background: linear-gradient(transparent, rgba(0,0,0,.55)); color: #fff; font-size: .85em; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tap { position: absolute; inset: 0; background: none; border: 0; padding: 0; cursor: pointer; }
</style>
