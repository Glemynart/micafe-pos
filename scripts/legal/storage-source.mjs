export function createStorageReader({ bucket, getAccessToken, fetchImpl = fetch, maxAssets = 10000 }) {
  if (typeof bucket !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,221}$/.test(bucket)) throw new Error('EXPORT_INVALID_BUCKET');
  async function get(url) {
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${await getAccessToken()}` }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`EXPORT_STORAGE_HTTP_${response.status}`);
    return response;
  }
  return Object.freeze({
    async list({ tenant }) {
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(tenant)) throw new Error('EXPORT_INVALID_TENANT');
      const prefix = `tenants/${tenant}/`, items = [], seen = new Set();
      let pageToken;
      do {
        const query = new URLSearchParams({ prefix, maxResults: '1000', fields: 'items(name,generation,size),nextPageToken' });
        if (pageToken) query.set('pageToken', pageToken);
        const page = await (await get(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o?${query}`)).json();
        if (page.items !== undefined && !Array.isArray(page.items)) throw new Error('EXPORT_INVALID_ASSET_INVENTORY');
        for (const item of page.items ?? []) {
          if (typeof item.name !== 'string' || !item.name.startsWith(prefix) || typeof item.generation !== 'string' || !/^\d+$/.test(item.generation) || !/^\d+$/.test(String(item.size))) throw new Error('EXPORT_INVALID_ASSET');
          const bytes = Number(item.size);
          if (!Number.isSafeInteger(bytes)) throw new Error('EXPORT_ASSET_TOO_LARGE');
          items.push({ name: item.name, generation: item.generation, bytes });
          if (items.length > maxAssets) throw new Error('EXPORT_ASSET_BUDGET_EXCEEDED');
        }
        pageToken = page.nextPageToken;
        if (pageToken && seen.has(pageToken)) throw new Error('EXPORT_REPEATED_PAGE_TOKEN');
        if (pageToken) seen.add(pageToken);
      } while (pageToken);
      return items;
    },
    async read({ tenant, name, generation }) {
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(tenant) || typeof name !== 'string' || !name.startsWith(`tenants/${tenant}/`) || !/^\d+$/.test(generation)) throw new Error('EXPORT_INVALID_ASSET');
      const params = new URLSearchParams({ alt: 'media', generation, ifGenerationMatch: generation });
      const response = await get(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}?${params}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  });
}
