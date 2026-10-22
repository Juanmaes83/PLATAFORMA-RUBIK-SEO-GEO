const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitizeDiagnostic(value) {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  return raw
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '<EMAIL>')
    .replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '<TOKEN>')
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/gi, '<KEY>')
    .replace(/\b(?:Bearer|apikey|password|secret|token|authorization)\s*[:=]?\s*\S+/gi, '<CREDENTIAL>')
    .replace(/https?:\/\/\S+/gi, '<URL>')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<OPAQUE>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function diagnostic(category, source, status) {
  const code = typeof source?.code === 'string' && /^[A-Z0-9]{3,12}$/i.test(source.code) ? source.code : null;
  const http = Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
  return { category, code, http, message: sanitizeDiagnostic(source?.message) };
}

export function classifyInsert(result) {
  if (result?.error) {
    const code = result.error.code;
    const definitive = Number.isInteger(result.status) && result.status >= 400 && result.status <= 599 &&
      typeof code === 'string' && code.length > 0 && code !== 'PGRST116';
    return { kind: definitive ? 'REJECTED' : 'AMBIGUOUS',
      diagnostic: diagnostic(definitive ? 'postgrest' : 'uncertain-response', result.error, result.status) };
  }
  const id = Array.isArray(result?.data) && result.data.length === 1 ? result.data[0]?.id : null;
  if (Number.isInteger(result?.status) && result.status >= 200 && result.status < 300) {
    if (UUID.test(id ?? '')) return { kind: 'CREATED', id };
    if (result.data === null || (Array.isArray(result.data) && result.data.length === 0)) {
      return { kind: 'ACCEPTED_NEEDS_LOOKUP' };
    }
  }
  return { kind: 'AMBIGUOUS', diagnostic: diagnostic('unexpected-response', { message: 'ID de respuesta ausente o inválido' }, result?.status) };
}

export async function reconcileByScope(lookup, track, ledger, caseId) {
  const result = await lookup();
  if (result?.error || !Array.isArray(result?.data) || result.data.length > 1) {
    await ledger(caseId, 'RECONCILE_FAILED');
    throw new Error('Reconciliación de fixture indisponible');
  }
  if (result.data.length === 0) {
    await ledger(caseId, 'CONFIRMED_ABSENT');
    return null;
  }
  const id = result.data[0]?.id;
  if (!UUID.test(id ?? '')) {
    await ledger(caseId, 'RECONCILE_FAILED');
    throw new Error('ID de fixture inválido');
  }
  track(id);
  await ledger(caseId, 'RECOVERED', { id });
  return id;
}

export async function createScopedFixture({ caseId, scope, insert, lookup, track, ledger }) {
  await ledger(caseId, 'PLANNED', { scope });
  let result;
  try { result = await insert(); }
  catch (error) {
    await ledger(caseId, 'AMBIGUOUS', diagnostic('transport', error, null));
    await reconcileByScope(lookup, track, ledger, caseId);
    throw new Error(`${caseId} sin respuesta verificable`);
  }
  const outcome = classifyInsert(result);
  if (outcome.kind === 'ACCEPTED_NEEDS_LOOKUP') {
    const id = await reconcileByScope(lookup, track, ledger, caseId);
    if (!id) {
      await ledger(caseId, 'AMBIGUOUS', diagnostic('unexpected-response', { message: 'Respuesta exitosa sin fila visible en la reconciliación' }, result?.status));
      throw new Error(`${caseId} sin ID verificable`);
    }
    await ledger(caseId, 'CREATED', { id });
    return id;
  }
  if (outcome.kind !== 'CREATED') {
    await ledger(caseId, outcome.kind, outcome.diagnostic);
    await reconcileByScope(lookup, track, ledger, caseId);
    throw new Error(`${caseId} ${outcome.kind === 'REJECTED' ? 'rechazada' : 'sin ID verificable'}`);
  }
  track(outcome.id);
  const confirmed = await reconcileByScope(lookup, track, ledger, caseId);
  if (confirmed !== outcome.id) {
    await ledger(caseId, 'AMBIGUOUS', diagnostic('unexpected-response', { message: 'ID de respuesta distinto al ID reconciliado' }, result?.status));
    throw new Error(`${caseId} discrepancia de ID`);
  }
  await ledger(caseId, 'CREATED', { id: outcome.id });
  return outcome.id;
}

export async function cleanupTrackedIds(ids, remove, ledger, caseId) {
  let ok = true;
  for (const id of [...new Set(ids)].reverse()) {
    let safe = false;
    let removed = null;
    try {
      const result = await remove(id);
      safe = !result?.error && Array.isArray(result?.data) &&
        result.data.length <= 1 && result.data.every(row => row.id === id);
      removed = result?.data?.length ?? null;
    } catch { safe = false; }
    if (!safe) ok = false;
    try {
      await ledger(caseId, safe ? 'PASS' : 'FAIL', { id, removed });
    } catch {
      // A broken ledger must block success, but never prevent deletion of later owned IDs.
      ok = false;
    }
  }
  return ok;
}
