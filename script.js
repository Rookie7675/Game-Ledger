/* =========================================================
   DATA MODEL
   materials: { id, name, amount, price, used }
     - amount = total you have logged
     - price  = market price per unit
     - used   = how much has been consumed by crafting so far
     - remaining = amount - used  (computed, never stored)
   recipes: { id, name, sellPrice, materials: [{ materialId, qty }] }
     - qty = how much of that material ONE unit of the craft needs
   knownMaterials / knownCraftables: { id, name, note, source }
     - source: 'researched' (I verified it) or 'manual' (you added it)
     - this is the reference library — once a list is non-empty, it's
       the only set of names Inventory / Crafting will accept
   ========================================================= */
let materials = [];
let recipes = [];
let knownMaterials = [];
let knownCraftables = [];

let currentView = 'inventory';   // 'inventory' | 'crafting' | 'reference'
let editingMaterialId = null;    // row currently being inline-edited
let editingRecipeId = null;      // recipe currently loaded into the form for editing
let editingRefMaterialId = null; // known-material row being inline-edited
let editingRefCraftableId = null;// known-craftable row being inline-edited
let draftMaterials = [];         // rows being built in the "New Craftable Item" form

/* =========================================================
   STORAGE — everything lives in memory only, plus whichever
   real file on your device you choose. Nothing is written to
   localStorage, IndexedDB, or any other browser database.

   Two ways your data reaches an actual file:
   1. LINKED SAVE FILE (Chrome/Edge/Opera only, via the File System
      Access API): once you Open or create one, every change writes
      straight to that exact file on disk automatically. The link
      itself only lives in a JS variable for this tab — reopening
      the app later means linking again, on purpose, since nothing
      is remembered behind your back.
   2. EXPORT / IMPORT (works in every browser): Export downloads a
      .json snapshot to your device; Import loads one back in. Use
      this on Firefox/Safari, or just as a manual backup anywhere.
   ========================================================= */
let linkedFileHandle = null;       // FileSystemFileHandle, in-memory only
const fsaSupported = ('showOpenFilePicker' in window) && ('showSaveFilePicker' in window);
let persistChain = Promise.resolve(); // serializes writes so they never overlap

function getFullState(){
  return {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    materials, recipes, knownMaterials, knownCraftables
  };
}
function applyFullState(state){
  materials = Array.isArray(state.materials) ? state.materials : [];
  recipes = Array.isArray(state.recipes) ? state.recipes : [];
  knownMaterials = Array.isArray(state.knownMaterials) ? state.knownMaterials : [];
  knownCraftables = Array.isArray(state.knownCraftables) ? state.knownCraftables : [];
  editingMaterialId = null;
  editingRecipeId = null;
  editingRefMaterialId = null;
  editingRefCraftableId = null;
  resetDraftMaterials();
}

function setSaveStatus(text, isLinked, isWarn){
  const el = document.getElementById('saveStatus');
  if(!el) return;
  el.textContent = text;
  el.className = 'save-status' + (isLinked ? ' linked' : '') + (isWarn ? ' warn' : '');
}
function setSaveMsg(text, isWarn){
  const el = document.getElementById('saveMsg');
  if(!el) return;
  el.textContent = text;
  el.className = 'save-msg' + (isWarn ? ' warn' : '');
}

// Every mutation in the app calls one of these four — kept as separate
// names so existing call sites didn't need to change, but they all just
// funnel into the one real persistence step below.
function saveMaterials(){ persist(); }
function saveRecipes(){ persist(); }
function saveKnownMaterials(){ persist(); }
function saveKnownCraftables(){ persist(); }

function persist(){
  persistChain = persistChain.then(doPersist, doPersist);
  return persistChain;
}
async function doPersist(){
  if(!linkedFileHandle) return; // nothing linked — data stays in memory until you Export or Link
  try{
    const writable = await linkedFileHandle.createWritable();
    await writable.write(JSON.stringify(getFullState(), null, 2));
    await writable.close();
    setSaveStatus(`Linked: ${linkedFileHandle.name} — saved`, true, false);
  }catch(err){
    console.error('Autosave failed', err);
    setSaveStatus(`Couldn't write to ${linkedFileHandle.name} — try relinking.`, false, true);
  }
}

async function linkExistingSaveFile(){
  if(!fsaSupported) return;
  try{
    const [handle] = await window.showOpenFilePicker({
      types: [{ description:'Guild Ledger Save', accept:{ 'application/json':['.json'] } }]
    });
    const file = await handle.getFile();
    const text = await file.text();
    const state = JSON.parse(text);
    applyFullState(state);

    const perm = await handle.requestPermission({ mode:'readwrite' });
    if(perm === 'granted'){
      linkedFileHandle = handle;
      document.getElementById('unlinkSaveFileBtn').style.display = 'inline-block';
      setSaveStatus(`Linked: ${handle.name} — saving automatically`, true, false);
      setSaveMsg('Loaded and linked.', false);
    } else {
      linkedFileHandle = null;
      setSaveStatus(`Loaded ${handle.name}, but write access was denied — changes won't autosave.`, false, true);
    }
    render();
  }catch(err){
    if(err.name === 'AbortError') return;
    console.error(err);
    setSaveMsg("Couldn't read that file — is it a valid save?", true);
  }
}

async function createNewSaveFile(){
  if(!fsaSupported) return;
  try{
    const handle = await window.showSaveFilePicker({
      suggestedName: 'guild-ledger-save.json',
      types: [{ description:'Guild Ledger Save', accept:{ 'application/json':['.json'] } }]
    });
    linkedFileHandle = handle;
    document.getElementById('unlinkSaveFileBtn').style.display = 'inline-block';
    await persist();
    setSaveStatus(`Linked: ${handle.name} — saving automatically`, true, false);
    setSaveMsg('New save file created and linked.', false);
  }catch(err){
    if(err.name === 'AbortError') return;
    console.error(err);
    setSaveMsg("Couldn't create that file.", true);
  }
}

function unlinkSaveFile(){
  linkedFileHandle = null;
  document.getElementById('unlinkSaveFileBtn').style.display = 'none';
  setSaveStatus('Not linked — nothing is saved to disk yet.', false, false);
  setSaveMsg('Unlinked. Export before closing this tab if you want to keep your changes.', false);
}

function exportBackup(){
  const data = JSON.stringify(getFullState(), null, 2);
  const blob = new Blob([data], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `guild-ledger-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setSaveMsg('Backup downloaded to your device.', false);
}

/* Merges an imported backup INTO the current ledger instead of replacing
   it: anything whose name doesn't already exist gets added; anything
   whose name matches something you already have is left alone so your
   current data is never overwritten. Recipe material references are
   remapped by name so they still point at the right (possibly pre-
   existing) material afterward. */
function mergeImportedState(state){
  const incomingMaterials = Array.isArray(state.materials) ? state.materials : [];
  const incomingRecipes = Array.isArray(state.recipes) ? state.recipes : [];
  const incomingKnownMaterials = Array.isArray(state.knownMaterials) ? state.knownMaterials : [];
  const incomingKnownCraftables = Array.isArray(state.knownCraftables) ? state.knownCraftables : [];

  const counts = {
    materialsAdded:0, materialsSkipped:0,
    recipesAdded:0, recipesSkipped:0,
    knownMatAdded:0, knownMatSkipped:0,
    knownCraftAdded:0, knownCraftSkipped:0
  };
  const byName = (list, name) => list.find(x => x.name && x.name.trim().toLowerCase() === (name||'').trim().toLowerCase());

  // Materials first, and remember old-id -> new/existing-id so recipes can be remapped below.
  const materialIdMap = {};
  incomingMaterials.forEach(im=>{
    const existing = byName(materials, im.name);
    if(existing){
      materialIdMap[im.id] = existing.id;
      counts.materialsSkipped++;
    } else {
      const newId = 'mat_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
      materials.push({
        id: newId,
        name: im.name,
        amount: typeof im.amount === 'number' ? im.amount : 0,
        price: typeof im.price === 'number' ? im.price : 0,
        used: typeof im.used === 'number' ? im.used : 0
      });
      materialIdMap[im.id] = newId;
      counts.materialsAdded++;
    }
  });

  incomingRecipes.forEach(ir=>{
    if(byName(recipes, ir.name)){ counts.recipesSkipped++; return; }
    const remapped = Array.isArray(ir.materials) ? ir.materials.map(line=>({
      materialId: materialIdMap[line.materialId] || line.materialId, // unresolved refs just show as "missing material" — already handled by the UI
      qty: typeof line.qty === 'number' ? line.qty : 0
    })) : [];
    recipes.push({
      id: 'rec_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
      name: ir.name,
      sellPrice: typeof ir.sellPrice === 'number' ? ir.sellPrice : 0,
      materials: remapped
    });
    counts.recipesAdded++;
  });

  incomingKnownMaterials.forEach(ik=>{
    if(byName(knownMaterials, ik.name)){ counts.knownMatSkipped++; return; }
    knownMaterials.push({
      id: 'refmat_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
      name: ik.name, note: ik.note || '',
      source: ik.source === 'researched' ? 'researched' : 'manual'
    });
    counts.knownMatAdded++;
  });

  incomingKnownCraftables.forEach(ik=>{
    if(byName(knownCraftables, ik.name)){ counts.knownCraftSkipped++; return; }
    knownCraftables.push({
      id: 'refcraft_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
      name: ik.name, note: ik.note || '',
      source: ik.source === 'researched' ? 'researched' : 'manual'
    });
    counts.knownCraftAdded++;
  });

  editingMaterialId = null;
  editingRecipeId = null;
  editingRefMaterialId = null;
  editingRefCraftableId = null;
  resetDraftMaterials();

  return counts;
}

function importBackupFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const state = JSON.parse(reader.result);
      const c = mergeImportedState(state);
      render();
      persist(); // keep the linked save file (if any) in sync with what was just added

      const parts = [];
      if(c.materialsAdded || c.materialsSkipped) parts.push(`Materials +${c.materialsAdded}${c.materialsSkipped ? ` (${c.materialsSkipped} already had that name)` : ''}`);
      if(c.recipesAdded || c.recipesSkipped) parts.push(`Recipes +${c.recipesAdded}${c.recipesSkipped ? ` (${c.recipesSkipped} already had that name)` : ''}`);
      if(c.knownMatAdded || c.knownMatSkipped) parts.push(`Known Materials +${c.knownMatAdded}${c.knownMatSkipped ? ` (${c.knownMatSkipped} already had that name)` : ''}`);
      if(c.knownCraftAdded || c.knownCraftSkipped) parts.push(`Known Craftables +${c.knownCraftAdded}${c.knownCraftSkipped ? ` (${c.knownCraftSkipped} already had that name)` : ''}`);
      setSaveMsg(parts.length ? parts.join(' · ') : 'Nothing new — everything in that file was already here.', false);
    }catch(err){
      console.error(err);
      setSaveMsg("That file isn't a valid backup.", true);
    }
  };
  reader.onerror = () => setSaveMsg("Couldn't read that file.", true);
  reader.readAsText(file);
}

function updateFsaUI(){
  document.getElementById('fsaButtons').style.display = fsaSupported ? 'flex' : 'none';
  document.getElementById('fsaUnsupportedNote').style.display = fsaSupported ? 'none' : 'block';
}

function loadData(){
  // Fresh in-memory state every load — on purpose. Link a save file or
  // Import a backup to bring your data back in.
  resetDraftMaterials();
  updateFsaUI();
  render();
}

/* =========================================================
   HELPERS
   ========================================================= */
function fmt(n){
  if(!isFinite(n)) return '—';
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString(undefined, {maximumFractionDigits:2});
}
function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}
function populateKnownDatalists(){
  document.getElementById('knownMaterialsList').innerHTML =
    knownMaterials.map(k=>`<option value="${escapeHtml(k.name)}">`).join('');
  document.getElementById('knownCraftablesList').innerHTML =
    knownCraftables.map(k=>`<option value="${escapeHtml(k.name)}">`).join('');
}
function matchesKnown(list, name){
  return list.find(k => k.name.trim().toLowerCase() === name.trim().toLowerCase());
}

function getMaterial(id){ return materials.find(m => m.id === id); }
function remaining(mat){ return mat.amount - mat.used; }
function remainingValue(mat){ return remaining(mat) * mat.price; }
function usedValue(mat){ return mat.used * mat.price; }

/* =========================================================
   ARROW-KEY FIELD NAVIGATION
   Pressing Left at the very start of a field (or Right at the very
   end) moves focus to the previous/next field in the list, instead
   of doing nothing. Cursor movement WITHIN a field's text still
   works normally everywhere else.
   ========================================================= */
function caretAtStart(el){
  if(!el) return false;
  if(el.tagName === 'SELECT') return true;
  return el.selectionStart === 0 && el.selectionEnd === 0;
}
function caretAtEnd(el){
  if(!el) return false;
  if(el.tagName === 'SELECT') return true;
  const len = el.value.length;
  return el.selectionStart === len && el.selectionEnd === len;
}
function focusAndPlaceCaret(el, atEnd){
  if(!el) return;
  el.focus();
  if(el.tagName !== 'SELECT' && typeof el.setSelectionRange === 'function'){
    const pos = atEnd ? el.value.length : 0;
    try{ el.setSelectionRange(pos, pos); }catch(e){ /* not all input types support this */ }
  }
}
function wireArrowNav(fields){
  fields = fields.filter(Boolean);
  fields.forEach((el, idx)=>{
    el.addEventListener('keydown', (e)=>{
      if(e.key === 'ArrowLeft' && caretAtStart(el) && idx > 0){
        e.preventDefault();
        focusAndPlaceCaret(fields[idx-1], true);
      } else if(e.key === 'ArrowRight' && caretAtEnd(el) && idx < fields.length - 1){
        e.preventDefault();
        focusAndPlaceCaret(fields[idx+1], false);
      }
    });
  });
}

function recipeCost(recipe){
  return recipe.materials.reduce((sum, line)=>{
    const mat = getMaterial(line.materialId);
    return sum + (mat ? mat.price * line.qty : 0);
  }, 0);
}
function recipeHasMissingMaterial(recipe){
  return recipe.materials.some(line => !getMaterial(line.materialId));
}
function recipeMaxCraftable(recipe){
  if(recipe.materials.length === 0) return 0;
  if(recipeHasMissingMaterial(recipe)) return 0;
  let max = Infinity;
  recipe.materials.forEach(line=>{
    const mat = getMaterial(line.materialId);
    if(!mat || line.qty <= 0){ max = 0; return; }
    max = Math.min(max, Math.floor(remaining(mat) / line.qty));
  });
  return Math.max(0, max);
}
function recipeProfitPerUnit(recipe){ return recipe.sellPrice - recipeCost(recipe); }
function recipePotentialProfit(recipe){ return recipeProfitPerUnit(recipe) * recipeMaxCraftable(recipe); }

/* =========================================================
   TOP-LEVEL RENDER
   ========================================================= */
function render(){
  renderNav();
  renderHero();
  populateKnownDatalists();
  if(currentView === 'inventory'){
    renderMaterialsTable();
  } else if(currentView === 'crafting'){
    renderDraftMaterials();
    renderRecipesTable();
    renderOpportunity();
  } else {
    renderReferenceTables();
  }
}

function renderNav(){
  document.querySelectorAll('.nav-item').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.view === currentView);
  });

  const itemCount = materials.length;
  const storeVal = materials.reduce((s,m)=>s+remainingValue(m),0);
  document.getElementById('navInventoryStats').innerHTML =
    `${itemCount} item${itemCount===1?'':'s'} · ${fmt(storeVal)} value`;

  const recipeCount = recipes.length;
  const totalPotential = recipes.reduce((s,r)=>s+recipePotentialProfit(r),0);
  document.getElementById('navCraftingStats').innerHTML =
    `${recipeCount} recipe${recipeCount===1?'':'s'} · <span class="${totalPotential>=0?'profit-pos':'profit-neg'}">${totalPotential>=0?'+':''}${fmt(totalPotential)} potential</span>`;

  document.getElementById('navReferenceStats').innerHTML =
    `${knownMaterials.length} materials · ${knownCraftables.length} craftables`;

  document.getElementById('view-inventory').classList.toggle('active', currentView==='inventory');
  document.getElementById('view-crafting').classList.toggle('active', currentView==='crafting');
  document.getElementById('view-reference').classList.toggle('active', currentView==='reference');

  const titles = {
    inventory: ['Storeroom Inventory', "Everything the guild has on hand, and what's already spoken for."],
    crafting: ['Crafting Bench', "What you can build from what's left in storage — and which one pays best."],
    reference: ['Game Data Library', "The confirmed names that keep your Inventory and Crafting honest to the real game."]
  };
  document.getElementById('pageTitle').textContent = titles[currentView][0];
  document.getElementById('pageSub').textContent = titles[currentView][1];
}

function renderHero(){
  const storeValue = materials.reduce((s,m)=>s+remainingValue(m),0);
  const usedVal = materials.reduce((s,m)=>s+usedValue(m),0);
  const craftProfit = recipes.reduce((s,r)=>s+recipePotentialProfit(r),0);

  document.getElementById('totalStoreValue').textContent = fmt(storeValue);
  document.getElementById('totalUsedValue').textContent = fmt(usedVal);

  const profitEl = document.getElementById('totalCraftProfit');
  profitEl.textContent = fmt(craftProfit);
  profitEl.className = 'num ' + (craftProfit >= 0 ? 'gold' : 'red');

  document.getElementById('totalEntries').textContent = `${materials.length} · ${recipes.length}`;
}

/* =========================================================
   INVENTORY VIEW
   ========================================================= */
function renderMaterialsTable(){
  const body = document.getElementById('materialsBody');

  if(materials.length === 0){
    body.innerHTML = '<tr class="empty-row"><td colspan="7">No materials logged yet.</td></tr>';
    return;
  }

  body.innerHTML = materials.map(mat=>{
    const rem = remaining(mat);
    const val = remainingValue(mat);

    if(editingMaterialId === mat.id){
      // ---- INLINE EDIT MODE: amount & price become editable, no delete+recreate needed ----
      return `<tr data-mat-id="${mat.id}">
        <td class="al name-cell">${escapeHtml(mat.name)}</td>
        <td><input class="cell-input" type="text" inputmode="decimal" autocomplete="off" id="editAmount_${mat.id}" value="${mat.amount}"></td>
        <td><input class="cell-input" type="text" inputmode="decimal" autocomplete="off" id="editPrice_${mat.id}" value="${mat.price}"></td>
        <td>${fmt(mat.used)}</td>
        <td>${fmt(rem)}</td>
        <td>${fmt(val)}</td>
        <td class="al row-actions">
          <button class="icon-btn" onclick="saveEditMaterial('${mat.id}')" title="Save">💾</button>
          <button class="icon-btn" onclick="cancelEditMaterial()" title="Cancel">✕</button>
        </td>
      </tr>`;
    }

    const remClass = rem < 0 ? 'profit-neg' : '';
    return `<tr class="${rem < 0 ? 'warn' : ''}" data-mat-id="${mat.id}">
      <td class="al name-cell">${escapeHtml(mat.name)}</td>
      <td>${fmt(mat.amount)}</td>
      <td>${fmt(mat.price)}</td>
      <td>${fmt(mat.used)}</td>
      <td class="${remClass}">${fmt(rem)}</td>
      <td>${fmt(val)}</td>
      <td class="al row-actions">
        <button class="icon-btn" onclick="startEditMaterial('${mat.id}')" title="Edit">✎</button>
        <button class="icon-btn danger" onclick="deleteMaterial('${mat.id}')" title="Delete">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function addMaterial(){
  const msg = document.getElementById('materialMsg');
  const name = document.getElementById('matName').value.trim();
  const amount = parseFloat(document.getElementById('matAmount').value);
  const price = parseFloat(document.getElementById('matPrice').value);

  if(!name){ msg.textContent = 'Give the material a name.'; msg.className='form-msg'; return; }
  if(isNaN(amount) || isNaN(price)){ msg.textContent = 'Amount and market price both need numbers.'; msg.className='form-msg'; return; }

  if(knownMaterials.length > 0 && !matchesKnown(knownMaterials, name)){
    msg.textContent = `"${name}" isn't in your Known Materials list yet. Add it in Game Data first if it's really from the game — or check your spelling.`;
    msg.className = 'form-msg';
    return;
  }

  const existing = materials.find(m => m.name.trim().toLowerCase() === name.toLowerCase());
  if(existing){
    msg.textContent = `"${existing.name}" is already in your inventory — edit that row instead of adding it again.`;
    msg.className = 'form-msg';
    flashExistingMaterial(existing.id);
    return;
  }

  materials.push({ id: 'mat_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), name, amount, price, used:0 });
  saveMaterials();
  msg.textContent = ''; msg.className='form-msg';
  render();

  document.getElementById('matName').value = '';
  document.getElementById('matAmount').value = '';
  document.getElementById('matPrice').value = '';
  document.getElementById('matName').focus();
}

function flashExistingMaterial(id){
  if(currentView !== 'inventory'){ currentView = 'inventory'; render(); }
  const row = document.querySelector(`tr[data-mat-id="${id}"]`);
  if(!row) return;
  row.scrollIntoView({behavior:'smooth', block:'center'});
  row.classList.remove('flash-row'); // restart animation if triggered twice in a row
  void row.offsetWidth; // force reflow so the animation restarts
  row.classList.add('flash-row');
}

function startEditMaterial(id){
  editingMaterialId = id;
  renderMaterialsTable();
  wireArrowNav([document.getElementById('editAmount_'+id), document.getElementById('editPrice_'+id)]);
}
function cancelEditMaterial(){
  editingMaterialId = null;
  renderMaterialsTable();
}
function saveEditMaterial(id){
  const mat = getMaterial(id);
  if(!mat) return;
  const newAmount = parseFloat(document.getElementById('editAmount_'+id).value);
  const newPrice = parseFloat(document.getElementById('editPrice_'+id).value);
  if(isNaN(newAmount) || isNaN(newPrice)) return;
  mat.amount = newAmount;
  mat.price = newPrice;
  editingMaterialId = null;
  saveMaterials();
  render(); // recipes' max-craftable / cost depend on materials, so refresh everything
}
function deleteMaterial(id){
  materials = materials.filter(m => m.id !== id);
  // clean up any recipes that referenced this material
  recipes.forEach(r=>{ r.materials = r.materials.filter(line => line.materialId !== id); });
  saveMaterials();
  saveRecipes();
  render();
}

/* =========================================================
   CRAFTING VIEW — draft form (new or edit)
   ========================================================= */
function resetDraftMaterials(){
  draftMaterials = materials.length ? [{ materialId: materials[0].id, qty: 1 }] : [];
}

function renderDraftMaterials(){
  const wrap = document.getElementById('draftMaterials');

  if(materials.length === 0){
    wrap.innerHTML = '<div class="form-msg" style="color:var(--text-dim);margin:0;">Add materials to the Inventory first — a recipe is built from what\'s in storage.</div>';
    return;
  }

  wrap.innerHTML = draftMaterials.map((line, i)=>{
    const options = materials.map(m=>`<option value="${m.id}" ${m.id===line.materialId?'selected':''}>${escapeHtml(m.name)}</option>`).join('');
    return `<div class="draft-row">
      <select id="draftMat_${i}" onchange="updateDraftRow(${i}, 'materialId', this.value)">${options}</select>
      <input type="text" inputmode="decimal" autocomplete="off" id="draftQty_${i}" placeholder="qty needed" value="${line.qty}" onchange="updateDraftRow(${i}, 'qty', this.value)">
      <button class="remove-line-btn" onclick="removeDraftRow(${i})" title="Remove">✕</button>
    </div>`;
  }).join('');

  // arrow-key navigation across every select/qty pair in the draft list, row by row
  const draftFields = [];
  draftMaterials.forEach((line, i)=>{
    draftFields.push(document.getElementById('draftMat_'+i), document.getElementById('draftQty_'+i));
  });
  wireArrowNav(draftFields);
}

function addDraftRow(){
  if(materials.length === 0) return;
  draftMaterials.push({ materialId: materials[0].id, qty: 1 });
  renderDraftMaterials();
}
function removeDraftRow(i){
  draftMaterials.splice(i,1);
  renderDraftMaterials();
}
function updateDraftRow(i, field, value){
  draftMaterials[i][field] = field === 'qty' ? parseFloat(value) : value;
}

function saveRecipe(){
  const msg = document.getElementById('recipeMsg');
  const name = document.getElementById('recName').value.trim();
  const sellPrice = parseFloat(document.getElementById('recSellPrice').value);
  const cleanMaterials = draftMaterials.filter(l => l.materialId && !isNaN(l.qty) && l.qty > 0);

  if(!name){ msg.textContent = 'Give the craftable item a name.'; msg.className='form-msg'; return; }
  if(isNaN(sellPrice)){ msg.textContent = 'Sell price needs a number.'; msg.className='form-msg'; return; }
  if(cleanMaterials.length === 0){ msg.textContent = 'Add at least one material with a quantity above zero.'; msg.className='form-msg'; return; }

  if(knownCraftables.length > 0 && !matchesKnown(knownCraftables, name)){
    msg.textContent = `"${name}" isn't in your Known Craftable Items list yet. Add it in Game Data first if it's really from the game — or check your spelling.`;
    msg.className = 'form-msg';
    return;
  }

  if(editingRecipeId){
    const recipe = recipes.find(r=>r.id === editingRecipeId);
    recipe.name = name;
    recipe.sellPrice = sellPrice;
    recipe.materials = cleanMaterials;
    msg.textContent = 'Recipe updated.'; msg.className='form-msg ok';
  } else {
    recipes.push({ id:'rec_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), name, sellPrice, materials: cleanMaterials });
    msg.textContent = 'Recipe saved.'; msg.className='form-msg ok';
  }

  saveRecipes();
  cancelEditRecipe(); // resets the form back to "new" state
  render();
}

function startEditRecipe(id){
  const recipe = recipes.find(r=>r.id===id);
  if(!recipe) return;
  editingRecipeId = id;
  document.getElementById('recName').value = recipe.name;
  document.getElementById('recSellPrice').value = recipe.sellPrice;
  draftMaterials = recipe.materials.map(l=>({...l}));
  document.getElementById('recipeFormTitle').textContent = 'Edit Craftable Item';
  document.getElementById('saveRecipeBtn').textContent = 'Update Recipe';
  document.getElementById('cancelRecipeBtn').style.display = 'inline-block';
  renderDraftMaterials();
  window.scrollTo({top:0, behavior:'smooth'});
}
function cancelEditRecipe(){
  editingRecipeId = null;
  document.getElementById('recName').value = '';
  document.getElementById('recSellPrice').value = '';
  document.getElementById('recipeFormTitle').textContent = 'New Craftable Item';
  document.getElementById('saveRecipeBtn').textContent = 'Save Recipe';
  document.getElementById('cancelRecipeBtn').style.display = 'none';
  resetDraftMaterials();
  renderDraftMaterials();
}
function deleteRecipe(id){
  recipes = recipes.filter(r=>r.id !== id);
  saveRecipes();
  render();
}

/* =========================================================
   CRAFTING VIEW — recipes table
   ========================================================= */
function renderRecipesTable(){
  const body = document.getElementById('recipesBody');

  if(recipes.length === 0){
    body.innerHTML = '<tr class="empty-row"><td colspan="8">No craftable items yet.</td></tr>';
    return;
  }

  const withCalc = recipes.map(r=>({
    recipe:r,
    cost: recipeCost(r),
    profitUnit: recipeProfitPerUnit(r),
    max: recipeMaxCraftable(r),
    potential: recipePotentialProfit(r),
    missing: recipeHasMissingMaterial(r)
  }));

  let bestId = null, bestPotential = -Infinity;
  withCalc.forEach(x=>{ if(x.potential > bestPotential){ bestPotential = x.potential; bestId = x.recipe.id; } });

  body.innerHTML = withCalc.map(x=>{
    const r = x.recipe;
    const matList = r.materials.map(line=>{
      const mat = getMaterial(line.materialId);
      return mat ? `${escapeHtml(mat.name)} x${fmt(line.qty)}` : `<span class="missing">missing material</span>`;
    }).join(', ');

    const profitClass = x.profitUnit >= 0 ? 'profit-pos' : 'profit-neg';
    const isBest = r.id === bestId && bestPotential > 0;
    const canCraft = x.max > 0 && !x.missing;

    return `<tr class="${isBest ? 'best' : ''} ${x.missing ? 'warn' : ''}">
      <td class="al name-cell">${escapeHtml(r.name)} ${isBest ? '<span class="badge">Best</span>' : ''} ${x.missing ? '<span class="badge warn-badge">Fix recipe</span>' : ''}</td>
      <td class="al mat-list">${matList}</td>
      <td>${fmt(x.cost)}</td>
      <td>${fmt(r.sellPrice)}</td>
      <td class="${profitClass}">${x.profitUnit>=0?'+':''}${fmt(x.profitUnit)}</td>
      <td>${fmt(x.max)}</td>
      <td class="${x.potential>=0?'profit-pos':'profit-neg'}">${x.potential>=0?'+':''}${fmt(x.potential)}</td>
      <td class="al">
        <div class="row-actions" style="margin-bottom:6px;">
          <button class="icon-btn" onclick="startEditRecipe('${r.id}')" title="Edit">✎</button>
          <button class="icon-btn danger" onclick="deleteRecipe('${r.id}')" title="Delete">✕</button>
        </div>
        <div class="craft-batch-row">
          <input type="number" min="1" max="${x.max}" value="${Math.max(1, x.max)}" id="craftQty_${r.id}" ${canCraft?'':'disabled'}>
          <button class="craft-btn" onclick="doCraft('${r.id}')" ${canCraft?'':'disabled'}>Craft</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function doCraft(id){
  const recipe = recipes.find(r=>r.id===id);
  if(!recipe) return;
  const max = recipeMaxCraftable(recipe);
  if(max <= 0) return;

  const input = document.getElementById('craftQty_'+id);
  let batches = parseInt(input.value, 10);
  if(isNaN(batches) || batches < 1) batches = 1;
  batches = Math.min(batches, max); // hard cap — can never exceed what's left in storage

  recipe.materials.forEach(line=>{
    const mat = getMaterial(line.materialId);
    if(mat) mat.used += line.qty * batches;
  });

  saveMaterials();
  render();
}

/* =========================================================
   BEST TO SELL — grouped by material.
   For every material that feeds at least one recipe, show every
   recipe that consumes it, ranked by potential profit, so you can
   see — material by material — what's the best thing to make with it.
   ========================================================= */
function renderOpportunity(){
  const panel = document.getElementById('oppPanel');

  if(recipes.length === 0){
    panel.innerHTML = '<div class="opp-empty">Add craftable items to see, material by material, which recipe is the best use of it.</div>';
    return;
  }

  // only materials actually referenced by at least one recipe
  const usedMaterialIds = new Set();
  recipes.forEach(r => r.materials.forEach(line => usedMaterialIds.add(line.materialId)));
  const usedMaterials = materials.filter(m => usedMaterialIds.has(m.id));

  if(usedMaterials.length === 0){
    panel.innerHTML = '<div class="opp-empty">None of your recipes use a material yet — add materials to a recipe to see this breakdown.</div>';
    return;
  }

  panel.innerHTML = usedMaterials.map(mat=>{
    const related = recipes
      .filter(r => r.materials.some(line => line.materialId === mat.id))
      .map(r => ({ name:r.name, potential: recipePotentialProfit(r) }));

    related.sort((a,b) => b.potential - a.potential);
    const maxAbs = Math.max(...related.map(x => Math.abs(x.potential)), 1);

    const rows = related.map((x, i)=>{
      const widthPct = Math.min(100, (Math.abs(x.potential)/maxAbs)*100);
      const negClass = x.potential < 0 ? 'neg' : '';
      const bestBadge = (i === 0 && x.potential > 0) ? '<span class="badge">Best</span>' : '';
      return `<div class="opp-row">
        <div class="opp-name">${escapeHtml(x.name)} ${bestBadge}</div>
        <div class="opp-track"><div class="opp-fill ${negClass}" style="width:${widthPct}%"></div></div>
        <div class="opp-val ${x.potential<0?'profit-neg':'profit-pos'}">${x.potential>=0?'+':''}${fmt(x.potential)}</div>
      </div>`;
    }).join('');

    return `<div class="material-group">
      <div class="material-group-head">
        <span class="material-group-name">${escapeHtml(mat.name)}</span>
        <span class="material-group-meta">${fmt(remaining(mat))} remaining · ${fmt(mat.price)}/unit</span>
      </div>
      ${rows}
    </div>`;
  }).join('');

  const unusedCount = materials.length - usedMaterials.length;
  if(unusedCount > 0){
    panel.innerHTML += `<div class="opp-empty" style="padding-top:4px;font-size:12px;">${unusedCount} other material${unusedCount===1?'':'s'} not used in any recipe yet.</div>`;
  }
}

/* =========================================================
   GAME DATA — reference library of confirmed names.
   Once a list is non-empty, addMaterial()/saveRecipe() (above)
   refuse any name that isn't an exact case-insensitive match here.
   ========================================================= */
function renderReferenceTables(){
  renderKnownMaterialsTable();
  renderKnownCraftablesTable();
}

function flashRow(selector){
  const row = document.querySelector(selector);
  if(!row) return;
  row.scrollIntoView({behavior:'smooth', block:'center'});
  row.classList.remove('flash-row');
  void row.offsetWidth; // force reflow so the animation restarts if triggered twice in a row
  row.classList.add('flash-row');
}

function renderKnownMaterialsTable(){
  const body = document.getElementById('refMaterialsBody');
  if(knownMaterials.length === 0){
    body.innerHTML = '<tr class="empty-row"><td colspan="4">No known materials yet.</td></tr>';
    return;
  }
  body.innerHTML = knownMaterials.map(k=>{
    if(editingRefMaterialId === k.id){
      return `<tr data-ref-mat-id="${k.id}">
        <td class="al"><input class="cell-input" style="width:150px;text-align:left;" type="text" id="editRefMatName_${k.id}" value="${escapeHtml(k.name)}"></td>
        <td class="al"><input class="cell-input" style="width:240px;text-align:left;" type="text" id="editRefMatNote_${k.id}" value="${escapeHtml(k.note||'')}"></td>
        <td class="al"><span class="source-tag source-${k.source}">${k.source}</span></td>
        <td class="al row-actions">
          <button class="icon-btn" onclick="saveEditRefMaterial('${k.id}')" title="Save">💾</button>
          <button class="icon-btn" onclick="cancelEditRefMaterial()" title="Cancel">✕</button>
        </td>
      </tr>`;
    }
    return `<tr data-ref-mat-id="${k.id}">
      <td class="al name-cell">${escapeHtml(k.name)}</td>
      <td class="al">${escapeHtml(k.note || '—')}</td>
      <td class="al"><span class="source-tag source-${k.source}">${k.source}</span></td>
      <td class="al row-actions">
        <button class="icon-btn" onclick="startEditRefMaterial('${k.id}')" title="Edit">✎</button>
        <button class="icon-btn danger" onclick="deleteKnownMaterial('${k.id}')" title="Delete">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function addKnownMaterial(){
  const msg = document.getElementById('refMaterialMsg');
  const name = document.getElementById('refMatName').value.trim();
  const note = document.getElementById('refMatNote').value.trim();
  if(!name){ msg.textContent = 'Give it a name.'; msg.className='form-msg'; return; }

  const existing = knownMaterials.find(k => k.name.trim().toLowerCase() === name.toLowerCase());
  if(existing){
    msg.textContent = `"${existing.name}" is already in your Known Materials list.`;
    msg.className = 'form-msg';
    flashRow(`tr[data-ref-mat-id="${existing.id}"]`);
    return;
  }

  knownMaterials.push({ id:'refmat_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), name, note, source:'manual' });
  saveKnownMaterials();
  msg.textContent = ''; msg.className = 'form-msg';
  render();
  document.getElementById('refMatName').value = '';
  document.getElementById('refMatNote').value = '';
  document.getElementById('refMatName').focus();
}

function startEditRefMaterial(id){
  editingRefMaterialId = id;
  renderKnownMaterialsTable();
  wireArrowNav([document.getElementById('editRefMatName_'+id), document.getElementById('editRefMatNote_'+id)]);
}
function cancelEditRefMaterial(){
  editingRefMaterialId = null;
  renderKnownMaterialsTable();
}
function saveEditRefMaterial(id){
  const k = knownMaterials.find(x=>x.id===id);
  if(!k) return;
  const newName = document.getElementById('editRefMatName_'+id).value.trim();
  const newNote = document.getElementById('editRefMatNote_'+id).value.trim();
  if(!newName) return;
  k.name = newName;
  k.note = newNote;
  editingRefMaterialId = null;
  saveKnownMaterials();
  render();
}
function deleteKnownMaterial(id){
  knownMaterials = knownMaterials.filter(k=>k.id !== id);
  saveKnownMaterials();
  render();
}

function renderKnownCraftablesTable(){
  const body = document.getElementById('refCraftablesBody');
  if(knownCraftables.length === 0){
    body.innerHTML = '<tr class="empty-row"><td colspan="4">No known craftable items yet.</td></tr>';
    return;
  }
  body.innerHTML = knownCraftables.map(k=>{
    if(editingRefCraftableId === k.id){
      return `<tr data-ref-craft-id="${k.id}">
        <td class="al"><input class="cell-input" style="width:150px;text-align:left;" type="text" id="editRefCraftName_${k.id}" value="${escapeHtml(k.name)}"></td>
        <td class="al"><input class="cell-input" style="width:240px;text-align:left;" type="text" id="editRefCraftNote_${k.id}" value="${escapeHtml(k.note||'')}"></td>
        <td class="al"><span class="source-tag source-${k.source}">${k.source}</span></td>
        <td class="al row-actions">
          <button class="icon-btn" onclick="saveEditRefCraftable('${k.id}')" title="Save">💾</button>
          <button class="icon-btn" onclick="cancelEditRefCraftable()" title="Cancel">✕</button>
        </td>
      </tr>`;
    }
    return `<tr data-ref-craft-id="${k.id}">
      <td class="al name-cell">${escapeHtml(k.name)}</td>
      <td class="al">${escapeHtml(k.note || '—')}</td>
      <td class="al"><span class="source-tag source-${k.source}">${k.source}</span></td>
      <td class="al row-actions">
        <button class="icon-btn" onclick="startEditRefCraftable('${k.id}')" title="Edit">✎</button>
        <button class="icon-btn danger" onclick="deleteKnownCraftable('${k.id}')" title="Delete">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function addKnownCraftable(){
  const msg = document.getElementById('refCraftableMsg');
  const name = document.getElementById('refCraftName').value.trim();
  const note = document.getElementById('refCraftNote').value.trim();
  if(!name){ msg.textContent = 'Give it a name.'; msg.className='form-msg'; return; }

  const existing = knownCraftables.find(k => k.name.trim().toLowerCase() === name.toLowerCase());
  if(existing){
    msg.textContent = `"${existing.name}" is already in your Known Craftable Items list.`;
    msg.className = 'form-msg';
    flashRow(`tr[data-ref-craft-id="${existing.id}"]`);
    return;
  }

  knownCraftables.push({ id:'refcraft_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), name, note, source:'manual' });
  saveKnownCraftables();
  msg.textContent = ''; msg.className = 'form-msg';
  render();
  document.getElementById('refCraftName').value = '';
  document.getElementById('refCraftNote').value = '';
  document.getElementById('refCraftName').focus();
}

function startEditRefCraftable(id){
  editingRefCraftableId = id;
  renderKnownCraftablesTable();
  wireArrowNav([document.getElementById('editRefCraftName_'+id), document.getElementById('editRefCraftNote_'+id)]);
}
function cancelEditRefCraftable(){
  editingRefCraftableId = null;
  renderKnownCraftablesTable();
}
function saveEditRefCraftable(id){
  const k = knownCraftables.find(x=>x.id===id);
  if(!k) return;
  const newName = document.getElementById('editRefCraftName_'+id).value.trim();
  const newNote = document.getElementById('editRefCraftNote_'+id).value.trim();
  if(!newName) return;
  k.name = newName;
  k.note = newNote;
  editingRefCraftableId = null;
  saveKnownCraftables();
  render();
}
function deleteKnownCraftable(id){
  knownCraftables = knownCraftables.filter(k=>k.id !== id);
  saveKnownCraftables();
  render();
}

/* =========================================================
   EVENT WIRING
   ========================================================= */
function openSidebar(){
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarBackdrop').classList.add('open');
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('open');
}
document.getElementById('sidebarToggleBtn').addEventListener('click', ()=>{
  const isOpen = document.getElementById('sidebar').classList.contains('open');
  if(isOpen) closeSidebar(); else openSidebar();
});
document.getElementById('sidebarBackdrop').addEventListener('click', closeSidebar);

document.querySelectorAll('.nav-item').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    currentView = btn.dataset.view;
    render();
    closeSidebar(); // picking a page closes the drawer so you see it full-width
  });
});

document.getElementById('addMaterialBtn').addEventListener('click', addMaterial);
[document.getElementById('matName'), document.getElementById('matAmount'), document.getElementById('matPrice')].forEach(el=>{
  el.addEventListener('keydown', e=>{ if(e.key==='Enter') addMaterial(); });
});

document.getElementById('addDraftRowBtn').addEventListener('click', addDraftRow);
document.getElementById('saveRecipeBtn').addEventListener('click', saveRecipe);
document.getElementById('cancelRecipeBtn').addEventListener('click', cancelEditRecipe);

document.getElementById('addRefMaterialBtn').addEventListener('click', addKnownMaterial);
[document.getElementById('refMatName'), document.getElementById('refMatNote')].forEach(el=>{
  el.addEventListener('keydown', e=>{ if(e.key==='Enter') addKnownMaterial(); });
});

document.getElementById('addRefCraftableBtn').addEventListener('click', addKnownCraftable);
[document.getElementById('refCraftName'), document.getElementById('refCraftNote')].forEach(el=>{
  el.addEventListener('keydown', e=>{ if(e.key==='Enter') addKnownCraftable(); });
});

// Left/Right arrow navigation between the fields of each form
wireArrowNav([
  document.getElementById('matName'),
  document.getElementById('matAmount'),
  document.getElementById('matPrice')
]);
wireArrowNav([
  document.getElementById('recName'),
  document.getElementById('recSellPrice')
]);
wireArrowNav([
  document.getElementById('refMatName'),
  document.getElementById('refMatNote')
]);
wireArrowNav([
  document.getElementById('refCraftName'),
  document.getElementById('refCraftNote')
]);

document.getElementById('openSaveFileBtn').addEventListener('click', linkExistingSaveFile);
document.getElementById('newSaveFileBtn').addEventListener('click', createNewSaveFile);
document.getElementById('unlinkSaveFileBtn').addEventListener('click', unlinkSaveFile);
document.getElementById('exportBtn').addEventListener('click', exportBackup);
document.getElementById('importBtn').addEventListener('click', ()=>{
  document.getElementById('importFileInput').click();
});
document.getElementById('importFileInput').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(file) importBackupFile(file);
  e.target.value = ''; // allow re-selecting the same file later
});

/* =========================================================
   INIT
   ========================================================= */
loadData();

// Offline support — only activates once this is hosted over HTTPS (or
// localhost); browsers refuse to register service workers from a plain
// file:// page, so this silently does nothing until then.
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').then((registration) => {
      registration.update(); // check for a newer service-worker.js right away, don't wait for the browser's own timer

      let hasReloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if(hasReloaded) return; // guard against a reload loop
        hasReloaded = true;
        window.location.reload();
      });
    }).catch((err) => {
      console.log('Service worker not active (expected if opened as a local file):', err.message);
    });
  });
}
