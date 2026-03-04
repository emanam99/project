# Model Gratis OpenRouter & Production

Berdasarkan [OpenRouter Quickstart](https://openrouter.ai/docs/quickstart) dan [FAQ](https://openrouter.ai/docs/faq):

## API langsung

- **Endpoint:** `POST https://openrouter.ai/api/v1/chat/completions`
- **Header:** `Authorization: Bearer <API_KEY>`, `Content-Type: application/json`
- **Body:** `{ "model": "provider/model:free", "messages": [...] }`

Variant **`:free`** = model selalu gratis dengan rate limit lebih rendah. Lihat [Model variants: free](https://openrouter.ai/docs/guides/routing/model-variants/free).

## Daftar model gratis (text chat)

Daftar lengkap: [OpenRouter Models — max price $0](https://openrouter.ai/models?max_price=0) dan [Free Models](https://openrouter.ai/collections/free-models).

| Model ID | Konteks | Catatan |
|----------|---------|--------|
| `qwen/qwen3-next-80b-a3b-instruct:free` | 262K | Umum, default di app ini |
| `stepfun/step-3.5-flash:free` | 256K | Reasoning & coding |
| `arcee-ai/trinity-large-preview:free` | 131K | Creative, agentic, chat |
| `upstage/solar-pro-3:free` | 128K | MoE; **berakhir 2 Maret 2026** |
| `liquid/lfm-2.5-1.2b-thinking:free` | 33K | Ringan, reasoning |
| `liquid/lfm-2.5-1.2b-instruct:free` | 33K | Ringan, chat |

**Jangan dipakai untuk production:**  
`nvidia/nemotron-3-nano-30b-a3b:free` — prompt & output di-log untuk perbaikan model; trial only.

## Rate limit (model gratis)

- **Tanpa top-up credit:** batas harian rendah (≈ puluhan request/hari). [FAQ](https://openrouter.ai/docs/faq#how-are-rate-limits-calculated): *"free models have low rate limits and are usually not suitable for production use"*.
- **Dengan pembelian credit (minimal):** limit harian lebih tinggi (ratusan request/hari), sehingga bisa dipakai untuk production ringan.

Detail angka: [OpenRouter FAQ — rate limits](https://openrouter.ai/docs/faq#how-are-rate-limits-calculated) dan [Rate limits docs](https://openrouter.ai/docs/api-reference/limits).

## Production

- Untuk production serius: beli credit OpenRouter (walau sedikit) agar limit model gratis naik, atau pakai model berbayar.
- Free Models Router: gunakan model `openrouter/free` agar OpenRouter memilih otomatis model gratis yang tersedia.

Referensi: [OpenRouter Quickstart](https://openrouter.ai/docs/quickstart#using-the-openrouter-api-directly), [FAQ](https://openrouter.ai/docs/faq), [Free Models](https://openrouter.ai/collections/free-models).
