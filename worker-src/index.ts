interface Env {
  DB: D1Database
  STORAGE?: R2Bucket
  BOOKSHELF_TOKEN?: string
}

// Simple ID generator
function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status)
}

// Auth check
function checkAuth(request: Request, env: Env): boolean {
  if (!env.BOOKSHELF_TOKEN) return true // no token = no auth
  const auth = request.headers.get('Authorization')
  if (auth === `Bearer ${env.BOOKSHELF_TOKEN}`) return true
  // Also accept token as query param (for image/file URLs)
  const url = new URL(request.url)
  return url.searchParams.get('token') === env.BOOKSHELF_TOKEN
}

// Decompress deflated data using DecompressionStream (raw deflate)
async function inflateData(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  writer.write(compressed)
  writer.close()
  const reader = ds.readable.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

// Get file data, decompressing if needed
async function getEntryData(entry: { data: Uint8Array; compressed?: boolean }): Promise<Uint8Array> {
  if (entry.compressed) {
    return inflateData(entry.data)
  }
  return entry.data
}

// EPUB metadata extraction from ZIP
async function extractEpubMetadata(data: ArrayBuffer): Promise<{
  title?: string
  author?: string
  description?: string
  language?: string
  publisher?: string
  coverData?: ArrayBuffer
  coverType?: string
}> {
  const bytes = new Uint8Array(data)
  const files = parseZipEntries(bytes)

  // Find container.xml to locate the OPF file
  const containerEntry = files.find(f => f.name === 'META-INF/container.xml')
  if (!containerEntry) return {}

  const containerData = await getEntryData(containerEntry)
  const containerXml = new TextDecoder().decode(containerData)
  const opfPathMatch = containerXml.match(/full-path="([^"]+)"/)
  if (!opfPathMatch) return {}

  const opfPath = opfPathMatch[1]
  const opfEntry = files.find(f => f.name === opfPath)
  if (!opfEntry) return {}

  const opfData = await getEntryData(opfEntry)
  const opfXml = new TextDecoder().decode(opfData)
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : ''

  // Decode HTML entities
  function decodeEntities(str: string): string {
    return str
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
  }

  // Extract Dublin Core metadata (decode HTML entities in all fields)
  const rawTitle = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/)?.[1]
  const title = rawTitle ? decodeEntities(rawTitle).trim() : undefined
  const rawAuthor = opfXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/)?.[1]
  const author = rawAuthor ? decodeEntities(rawAuthor).trim() : undefined
  // Description may contain HTML tags or entities — use greedy match, then clean
  const rawDescription = opfXml.match(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/)?.[1]
  const description = rawDescription
    ? decodeEntities(rawDescription).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    : undefined
  const language = opfXml.match(/<dc:language[^>]*>([^<]+)<\/dc:language>/)?.[1]
  const publisher = opfXml.match(/<dc:publisher[^>]*>([^<]+)<\/dc:publisher>/)?.[1]

  // Try to find cover image
  let coverData: ArrayBuffer | undefined
  let coverType: string | undefined

  // Method 1: meta cover tag
  const coverIdMatch = opfXml.match(/<meta[^>]*name="cover"[^>]*content="([^"]+)"/)
  if (coverIdMatch) {
    const coverId = coverIdMatch[1]
    // Try both attribute orderings: id before href, and href before id
    const coverHrefMatch = opfXml.match(new RegExp(`id="${coverId}"[^>]*href="([^"]+)"`))
      || opfXml.match(new RegExp(`href="([^"]+)"[^>]*id="${coverId}"`))
    if (coverHrefMatch) {
      const coverPath = opfDir + coverHrefMatch[1]
      const coverEntry = files.find(f => f.name === coverPath)
      if (coverEntry) {
        const entryData = await getEntryData(coverEntry)
        coverData = entryData.buffer
        coverType = coverPath.endsWith('.png') ? 'image/png' : 'image/jpeg'
      }
    }
  }

  // Method 2: look for cover in manifest by properties
  if (!coverData) {
    const coverPropMatch = opfXml.match(/properties="cover-image"[^>]*href="([^"]+)"/)
      || opfXml.match(/href="([^"]+)"[^>]*properties="cover-image"/)
    if (coverPropMatch) {
      const coverPath = opfDir + coverPropMatch[1]
      const coverEntry = files.find(f => f.name === coverPath)
      if (coverEntry) {
        const entryData = await getEntryData(coverEntry)
        coverData = entryData.buffer
        coverType = coverPath.endsWith('.png') ? 'image/png' : 'image/jpeg'
      }
    }
  }

  // Method 3: look for any manifest item with id containing "cover" that's an image
  if (!coverData) {
    const coverItemMatch = opfXml.match(/id="[^"]*cover[^"]*"[^>]*href="([^"]+)"[^>]*media-type="image\/[^"]+"/i)
      || opfXml.match(/href="([^"]+)"[^>]*id="[^"]*cover[^"]*"[^>]*media-type="image\/[^"]+"/i)
      || opfXml.match(/id="[^"]*cover[^"]*"[^>]*media-type="image\/[^"]+"\s[^>]*href="([^"]+)"/i)
      || opfXml.match(/media-type="image\/[^"]+"\s[^>]*href="([^"]+)"[^>]*id="[^"]*cover[^"]*"/i)
    if (coverItemMatch) {
      const coverPath = opfDir + coverItemMatch[1]
      const coverEntry = files.find(f => f.name === coverPath)
      if (coverEntry) {
        const entryData = await getEntryData(coverEntry)
        coverData = entryData.buffer
        coverType = coverPath.endsWith('.png') ? 'image/png' : 'image/jpeg'
      }
    }
  }

  // Method 4: look for any image file named "cover" in the ZIP
  if (!coverData) {
    const coverEntry = files.find(f =>
      /cover/i.test(f.name) && /\.(jpe?g|png|gif|webp)$/i.test(f.name)
    )
    if (coverEntry) {
      const entryData = await getEntryData(coverEntry)
      coverData = entryData.buffer
      coverType = coverEntry.name.endsWith('.png') ? 'image/png' : 'image/jpeg'
    }
  }

  // Method 5: first image in manifest (many EPUBs list cover image first)
  if (!coverData) {
    const firstImageMatch = opfXml.match(/href="([^"]+)"[^>]*media-type="image\/(jpe?g|png)"/i)
      || opfXml.match(/media-type="image\/(jpe?g|png)"[^>]*href="([^"]+)"/i)
    if (firstImageMatch) {
      const href = firstImageMatch[2]?.includes('/') || firstImageMatch[2]?.includes('.') ? firstImageMatch[2] : firstImageMatch[1]
      const coverPath = opfDir + href
      const coverEntry = files.find(f => f.name === coverPath)
      if (coverEntry) {
        const entryData = await getEntryData(coverEntry)
        coverData = entryData.buffer
        coverType = coverPath.endsWith('.png') ? 'image/png' : 'image/jpeg'
      }
    }
  }

  return { title, author, description, language, publisher, coverData, coverType }
}

// Basic PDF metadata extraction (title, author, subject from /Info dictionary)
function extractPdfMetadata(data: ArrayBuffer): { title?: string; author?: string; description?: string } {
  // Scan raw bytes as latin1 text — PDF metadata is usually ASCII/latin1
  const bytes = new Uint8Array(data)
  // Only scan first 64KB and last 64KB (metadata is typically near start or end)
  const headSize = Math.min(bytes.length, 65536)
  const tailStart = Math.max(0, bytes.length - 65536)
  let text = ''
  for (let i = 0; i < headSize; i++) text += String.fromCharCode(bytes[i])
  if (tailStart > headSize) {
    for (let i = tailStart; i < bytes.length; i++) text += String.fromCharCode(bytes[i])
  }

  function extractPdfString(key: string): string | undefined {
    // Match /Key (literal string) or /Key <hex string>
    const literalMatch = text.match(new RegExp(`/${key}\\s*\\(([^)]{1,500})\\)`))
    if (literalMatch) {
      return literalMatch[1]
        .replace(/\\n/g, '\n').replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t').replace(/\\\\/g, '\\')
        .replace(/\\([()])/g, '$1')
        .trim()
    }
    const hexMatch = text.match(new RegExp(`/${key}\\s*<([0-9A-Fa-f]+)>`))
    if (hexMatch) {
      const hex = hexMatch[1]
      let str = ''
      // Check for UTF-16BE BOM (FEFF)
      if (hex.length >= 4 && hex.slice(0, 4).toUpperCase() === 'FEFF') {
        for (let i = 4; i < hex.length - 3; i += 4) {
          str += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16))
        }
      } else {
        for (let i = 0; i < hex.length - 1; i += 2) {
          str += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
        }
      }
      return str.trim() || undefined
    }
    return undefined
  }

  return {
    title: extractPdfString('Title'),
    author: extractPdfString('Author'),
    description: extractPdfString('Subject'),
  }
}

// Minimal ZIP parser for EPUB extraction
function parseZipEntries(data: Uint8Array): Array<{ name: string; data: Uint8Array; compressed?: boolean }> {
  const entries: Array<{ name: string; data: Uint8Array; compressed?: boolean }> = []
  let offset = 0

  while (offset < data.length - 4) {
    const sig = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)
    if (sig !== 0x04034b50) break // Not a local file header

    const compressionMethod = data[offset + 8] | (data[offset + 9] << 8)
    const compressedSize = data[offset + 18] | (data[offset + 19] << 8) | (data[offset + 20] << 16) | (data[offset + 21] << 24)
    const uncompressedSize = data[offset + 22] | (data[offset + 23] << 8) | (data[offset + 24] << 16) | (data[offset + 25] << 24)
    const nameLength = data[offset + 26] | (data[offset + 27] << 8)
    const extraLength = data[offset + 28] | (data[offset + 29] << 8)

    const nameStart = offset + 30
    const name = new TextDecoder().decode(data.slice(nameStart, nameStart + nameLength))
    const dataStart = nameStart + nameLength + extraLength
    const dataSize = compressedSize || uncompressedSize

    if (compressionMethod === 0 && dataSize > 0) {
      entries.push({ name, data: data.slice(dataStart, dataStart + dataSize), compressed: false })
    } else if (compressionMethod === 8 && compressedSize > 0) {
      entries.push({ name, data: data.slice(dataStart, dataStart + compressedSize), compressed: true })
    }

    offset = dataStart + (compressedSize || dataSize)
  }

  return entries
}

// Route handler
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method

  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Health check
  if (path === '/health') {
    return json({ status: 'ok', service: 'catalouge-api', version: '1.0.0' })
  }

  // Info
  if (path === '/' && method === 'GET') {
    return json({
      service: 'Catalouge API',
      version: '1.0.0',
      description: "Neko's cozy library",
      r2Enabled: !!env.STORAGE,
    })
  }

  // Auth check for all /api routes
  if (path.startsWith('/api') && !checkAuth(request, env)) {
    return error('Unauthorized', 401)
  }

  // --- BOOKS ---

  // GET /api/books
  if (path === '/api/books' && method === 'GET') {
    const shelf = url.searchParams.get('shelf')
    const search = url.searchParams.get('search')
    const tag = url.searchParams.get('tag')

    let query = `
      SELECT b.*, rp.progress_percent, rp.current_chapter, rp.last_read_at,
        (SELECT GROUP_CONCAT(bs2.shelf_id) FROM book_shelves bs2 WHERE bs2.book_id = b.id) as shelf_ids
      FROM books b
      LEFT JOIN reading_progress rp ON b.id = rp.book_id
    `
    const params: string[] = []

    if (shelf) {
      query += ` INNER JOIN book_shelves bs ON b.id = bs.book_id WHERE bs.shelf_id = ?`
      params.push(shelf)
    } else if (tag) {
      query += ` INNER JOIN book_tags bt ON b.id = bt.book_id INNER JOIN tags t ON bt.tag_id = t.id WHERE t.name = ?`
      params.push(tag)
    } else if (search) {
      query += ` WHERE b.title LIKE ? OR b.author LIKE ?`
      params.push(`%${search}%`, `%${search}%`)
    }

    query += ` ORDER BY b.added_at DESC`

    const result = await env.DB.prepare(query).bind(...params).all()
    return json(result.results)
  }

  // GET /api/books/:id
  const bookMatch = path.match(/^\/api\/books\/([^/]+)$/)
  if (bookMatch && method === 'GET') {
    const id = bookMatch[1]
    const book = await env.DB.prepare(`
      SELECT b.*, rp.progress_percent, rp.current_chapter, rp.current_cfi, rp.last_read_at, rp.started_at, rp.finished_at
      FROM books b
      LEFT JOIN reading_progress rp ON b.id = rp.book_id
      WHERE b.id = ?
    `).bind(id).first()

    if (!book) return error('Book not found', 404)

    // Get shelves
    const shelves = await env.DB.prepare(
      `SELECT s.* FROM shelves s INNER JOIN book_shelves bs ON s.id = bs.shelf_id WHERE bs.book_id = ?`
    ).bind(id).all()

    // Get tags
    const tags = await env.DB.prepare(
      `SELECT t.* FROM tags t INNER JOIN book_tags bt ON t.id = bt.tag_id WHERE bt.book_id = ?`
    ).bind(id).all()

    // Get review
    const review = await env.DB.prepare(
      `SELECT * FROM reviews WHERE book_id = ?`
    ).bind(id).first()

    return json({ ...book, shelves: shelves.results, tags: tags.results, review })
  }

  // POST /api/books (upload)
  if (path === '/api/books' && method === 'POST') {
    const contentType = request.headers.get('content-type') || ''

    let title = 'Untitled'
    let author: string | null = null
    let description: string | null = null
    let language = 'en'
    let publisher: string | null = null
    let fileType = 'epub'
    let fileSize = 0
    let fileData: ArrayBuffer | null = null
    let coverData: ArrayBuffer | null = null
    let coverType = 'image/jpeg'

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null

      if (!file) return error('No file provided')

      fileData = await file.arrayBuffer()
      fileSize = fileData.byteLength
      fileType = file.name.endsWith('.pdf') ? 'pdf' : 'epub'

      // Override metadata from form if provided
      title = (formData.get('title') as string) || title
      author = (formData.get('author') as string) || author

      // Extract EPUB metadata
      if (fileType === 'epub') {
        try {
          const meta = await extractEpubMetadata(fileData)
          title = (formData.get('title') as string) || meta.title || file.name.replace('.epub', '')
          author = (formData.get('author') as string) || meta.author || null
          description = meta.description || null
          language = meta.language || 'en'
          publisher = meta.publisher || null
          if (meta.coverData) {
            coverData = meta.coverData
            coverType = meta.coverType || 'image/jpeg'
          }
        } catch {
          title = (formData.get('title') as string) || file.name.replace('.epub', '')
        }
      } else {
        // Extract PDF metadata (title, author, subject)
        try {
          const pdfMeta = extractPdfMetadata(fileData)
          title = (formData.get('title') as string) || pdfMeta.title || file.name.replace('.pdf', '')
          author = (formData.get('author') as string) || pdfMeta.author || null
          description = pdfMeta.description || null
        } catch {
          title = (formData.get('title') as string) || file.name.replace('.pdf', '')
        }
      }

      // Check for cover image from form (used by frontend for PDF first-page renders)
      const coverFile = formData.get('cover') as File | null
      if (coverFile && !coverData) {
        coverData = await coverFile.arrayBuffer()
        coverType = coverFile.type || 'image/jpeg'
      }
    } else {
      return error('Expected multipart/form-data')
    }

    // Auto-delete duplicate: same title + author (case-insensitive)
    const dupeQuery = author
      ? `SELECT id, file_key, cover_key FROM books WHERE LOWER(title) = LOWER(?) AND LOWER(author) = LOWER(?)`
      : `SELECT id, file_key, cover_key FROM books WHERE LOWER(title) = LOWER(?) AND author IS NULL`
    const dupeParams = author ? [title, author] : [title]
    const dupes = await env.DB.prepare(dupeQuery).bind(...dupeParams).all()
    for (const dupe of dupes.results as any[]) {
      if (env.STORAGE) {
        if (dupe.file_key) await env.STORAGE.delete(dupe.file_key)
        if (dupe.cover_key) await env.STORAGE.delete(dupe.cover_key)
      }
      await env.DB.prepare('DELETE FROM books WHERE id = ?').bind(dupe.id).run()
    }

    // Discard cover if too small (likely empty or corrupt)
    if (coverData && coverData.byteLength < 1000) {
      coverData = null
    }

    const id = generateId()
    const fileKey = `books/${id}.${fileType}`
    const coverKey = coverData ? `covers/${id}.jpg` : null

    // Store in R2 if available
    if (env.STORAGE && fileData) {
      await env.STORAGE.put(fileKey, fileData)
      if (coverData && coverKey) {
        await env.STORAGE.put(coverKey, coverData, {
          httpMetadata: { contentType: coverType },
        })
      }
    }

    // Insert into D1
    await env.DB.prepare(`
      INSERT INTO books (id, title, author, description, cover_key, file_key, file_type, file_size, language, publisher)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, title, author, description, coverKey, fileKey, fileType, fileSize, language, publisher).run()

    return json({ id, title, author, fileType, fileSize }, 201)
  }

  // PATCH /api/books/:id
  if (bookMatch && method === 'PATCH') {
    const id = bookMatch[1]
    const body = await request.json() as Record<string, unknown>
    const allowed = ['title', 'author', 'description', 'language', 'publisher']
    const updates: string[] = []
    const values: unknown[] = []

    for (const key of allowed) {
      if (key in body) {
        updates.push(`${key} = ?`)
        values.push(body[key])
      }
    }

    if (updates.length === 0) return error('No valid fields to update')

    updates.push(`updated_at = datetime('now')`)
    values.push(id)

    await env.DB.prepare(`UPDATE books SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
    return json({ ok: true })
  }

  // DELETE /api/books/:id
  if (bookMatch && method === 'DELETE') {
    const id = bookMatch[1]

    // Get file keys for R2 cleanup
    const book = await env.DB.prepare('SELECT file_key, cover_key FROM books WHERE id = ?').bind(id).first() as any
    if (!book) return error('Book not found', 404)

    if (env.STORAGE) {
      if (book.file_key) await env.STORAGE.delete(book.file_key)
      if (book.cover_key) await env.STORAGE.delete(book.cover_key)
    }

    await env.DB.prepare('DELETE FROM books WHERE id = ?').bind(id).run()
    return json({ ok: true })
  }

  // GET /api/books/:id/file
  const fileMatch = path.match(/^\/api\/books\/([^/]+)\/file$/)
  if (fileMatch && method === 'GET') {
    const id = fileMatch[1]
    const book = await env.DB.prepare('SELECT file_key, file_type FROM books WHERE id = ?').bind(id).first() as any
    if (!book) return error('Book not found', 404)

    if (!env.STORAGE) return error('R2 storage not configured', 503)

    const object = await env.STORAGE.get(book.file_key)
    if (!object) return error('File not found in storage', 404)

    const contentType = book.file_type === 'pdf' ? 'application/pdf' : 'application/epub+zip'
    return new Response(object.body, {
      headers: { 'Content-Type': contentType, ...corsHeaders },
    })
  }

  // GET /api/books/:id/cover
  const coverMatch = path.match(/^\/api\/books\/([^/]+)\/cover$/)
  if (coverMatch && method === 'GET') {
    const id = coverMatch[1]
    const book = await env.DB.prepare('SELECT cover_key FROM books WHERE id = ?').bind(id).first() as any
    if (!book?.cover_key) return error('No cover available', 404)

    if (!env.STORAGE) return error('R2 storage not configured', 503)

    const object = await env.STORAGE.get(book.cover_key)
    if (!object) return error('Cover not found in storage', 404)

    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        ...corsHeaders,
      },
    })
  }

  // --- SHELVES ---

  // GET /api/shelves
  if (path === '/api/shelves' && method === 'GET') {
    const result = await env.DB.prepare(`
      SELECT s.*, COUNT(bs.book_id) as book_count
      FROM shelves s
      LEFT JOIN book_shelves bs ON s.id = bs.shelf_id
      GROUP BY s.id
      ORDER BY s.sort_order
    `).all()
    return json(result.results)
  }

  // POST /api/shelves
  if (path === '/api/shelves' && method === 'POST') {
    const body = await request.json() as { name: string; icon?: string }
    const id = generateId()
    await env.DB.prepare(
      `INSERT INTO shelves (id, name, icon, sort_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM shelves))`
    ).bind(id, body.name, body.icon || null).run()
    return json({ id, name: body.name }, 201)
  }

  // POST /api/books/:id/shelves
  const shelfAssignMatch = path.match(/^\/api\/books\/([^/]+)\/shelves$/)
  if (shelfAssignMatch && method === 'POST') {
    const bookId = shelfAssignMatch[1]
    const body = await request.json() as { shelf_id?: string; shelf_ids?: string[] }
    const ids = body.shelf_ids || (body.shelf_id ? [body.shelf_id] : [])
    if (ids.length === 0) return error('No shelf_id or shelf_ids provided')
    const batch = ids.map(sid =>
      env.DB.prepare('INSERT OR IGNORE INTO book_shelves (book_id, shelf_id) VALUES (?, ?)').bind(bookId, sid)
    )
    await env.DB.batch(batch)
    return json({ ok: true })
  }

  // DELETE /api/books/:id/shelves/:sid
  const shelfRemoveMatch = path.match(/^\/api\/books\/([^/]+)\/shelves\/([^/]+)$/)
  if (shelfRemoveMatch && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM book_shelves WHERE book_id = ? AND shelf_id = ?')
      .bind(shelfRemoveMatch[1], shelfRemoveMatch[2]).run()
    return json({ ok: true })
  }

  // --- PROGRESS ---

  const progressMatch = path.match(/^\/api\/books\/([^/]+)\/progress$/)

  // GET /api/books/:id/progress
  if (progressMatch && method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT * FROM reading_progress WHERE book_id = ?'
    ).bind(progressMatch[1]).first()
    if (!row) return error('No progress found', 404)
    return json(row)
  }

  // PUT /api/books/:id/progress
  if (progressMatch && (method === 'PUT' || method === 'PATCH')) {
    const bookId = progressMatch[1]
    const body = await request.json() as {
      current_cfi?: string; current_chapter?: string; progress_percent?: number;
      cfi?: string; chapter?: string; percent?: number;
      current_page?: number; total_pages?: number;
    }
    // Accept both field name conventions
    const cfi = body.current_cfi || body.cfi || null
    const chapter = body.current_chapter || body.chapter || null
    const percent = body.progress_percent ?? body.percent ?? 0
    const page = body.current_page || null
    const totalPages = body.total_pages || null

    await env.DB.prepare(`
      INSERT INTO reading_progress (book_id, current_cfi, current_chapter, progress_percent, current_page, total_pages, started_at, last_read_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(book_id) DO UPDATE SET
        current_cfi = COALESCE(?, current_cfi),
        current_chapter = COALESCE(?, current_chapter),
        progress_percent = COALESCE(?, progress_percent),
        current_page = COALESCE(?, current_page),
        total_pages = COALESCE(?, total_pages),
        started_at = COALESCE(started_at, datetime('now')),
        last_read_at = datetime('now')
    `).bind(
      bookId, cfi, chapter, percent, page, totalPages,
      cfi, chapter, percent || null, page, totalPages
    ).run()

    return json({ ok: true })
  }

  // --- BOOKMARKS ---

  // GET /api/books/:id/bookmarks
  const bookmarksMatch = path.match(/^\/api\/books\/([^/]+)\/bookmarks$/)
  if (bookmarksMatch && method === 'GET') {
    const result = await env.DB.prepare(
      'SELECT * FROM bookmarks WHERE book_id = ? ORDER BY created_at DESC'
    ).bind(bookmarksMatch[1]).all()
    return json(result.results)
  }

  // POST /api/books/:id/bookmarks
  if (bookmarksMatch && method === 'POST') {
    const body = await request.json() as { cfi: string; label?: string; color?: string }
    const id = generateId()
    await env.DB.prepare(
      'INSERT INTO bookmarks (id, book_id, cfi, label, color) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, bookmarksMatch[1], body.cfi, body.label || null, body.color || '#d4748a').run()
    return json({ id }, 201)
  }

  // DELETE /api/bookmarks/:id
  const bookmarkDeleteMatch = path.match(/^\/api\/bookmarks\/([^/]+)$/)
  if (bookmarkDeleteMatch && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM bookmarks WHERE id = ?').bind(bookmarkDeleteMatch[1]).run()
    return json({ ok: true })
  }

  // --- REVIEWS ---

  // POST /api/books/:id/review
  const reviewMatch = path.match(/^\/api\/books\/([^/]+)\/review$/)
  if (reviewMatch && method === 'POST') {
    const bookId = reviewMatch[1]
    const body = await request.json() as { rating?: number; text?: string }
    const id = generateId()

    await env.DB.prepare(`
      INSERT INTO reviews (id, book_id, rating, review_text)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(book_id) DO UPDATE SET
        rating = COALESCE(?, rating),
        review_text = COALESCE(?, review_text),
        updated_at = datetime('now')
    `).bind(id, bookId, body.rating || null, body.text || null, body.rating || null, body.text || null).run()

    return json({ ok: true })
  }

  // --- TAGS ---

  // GET /api/tags
  if (path === '/api/tags' && method === 'GET') {
    const result = await env.DB.prepare(`
      SELECT t.*, COUNT(bt.book_id) as book_count
      FROM tags t
      LEFT JOIN book_tags bt ON t.id = bt.tag_id
      GROUP BY t.id
      ORDER BY t.name
    `).all()
    return json(result.results)
  }

  // POST /api/books/:id/tags
  const tagAssignMatch = path.match(/^\/api\/books\/([^/]+)\/tags$/)
  if (tagAssignMatch && method === 'POST') {
    const bookId = tagAssignMatch[1]
    const body = await request.json() as { tags: string[] }

    for (const tagName of body.tags) {
      const tagId = tagName.toLowerCase().replace(/\s+/g, '-')
      await env.DB.prepare('INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)').bind(tagId, tagName).run()
      await env.DB.prepare('INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)').bind(bookId, tagId).run()
    }

    return json({ ok: true })
  }

  // --- STATS ---

  // GET /api/stats
  if (path === '/api/stats' && method === 'GET') {
    const total = await env.DB.prepare('SELECT COUNT(*) as count FROM books').first() as any
    const reading = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM book_shelves WHERE shelf_id = ?'
    ).bind('reading').first() as any
    const finished = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM book_shelves WHERE shelf_id = ?'
    ).bind('finished').first() as any
    const reviewed = await env.DB.prepare('SELECT COUNT(*) as count FROM reviews WHERE rating IS NOT NULL').first() as any
    const avgRating = await env.DB.prepare('SELECT AVG(rating) as avg FROM reviews WHERE rating IS NOT NULL').first() as any

    return json({
      total_books: total?.count || 0,
      currently_reading: reading?.count || 0,
      finished: finished?.count || 0,
      reviewed: reviewed?.count || 0,
      average_rating: avgRating?.avg ? Math.round(avgRating.avg * 10) / 10 : null,
    })
  }

  // --- ANNOTATIONS ---

  // GET /api/books/:id/annotations
  const annotationsMatch = path.match(/^\/api\/books\/([^/]+)\/annotations$/)
  if (annotationsMatch && method === 'GET') {
    const result = await env.DB.prepare(
      'SELECT * FROM annotations WHERE book_id = ? ORDER BY created_at DESC'
    ).bind(annotationsMatch[1]).all()
    return json(result.results)
  }

  // POST /api/books/:id/annotations
  if (annotationsMatch && method === 'POST') {
    const bookId = annotationsMatch[1]
    const body = await request.json() as { cfi_range: string; selected_text?: string; comment?: string; color?: string }
    const id = generateId()
    await env.DB.prepare(
      'INSERT INTO annotations (id, book_id, cfi_range, selected_text, comment, color) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, bookId, body.cfi_range, body.selected_text || null, body.comment || null, body.color || '#d4748a').run()
    return json({ id, book_id: bookId, cfi_range: body.cfi_range, selected_text: body.selected_text, comment: body.comment, color: body.color || '#d4748a' }, 201)
  }

  // PUT /api/annotations/:id
  const annotationUpdateMatch = path.match(/^\/api\/annotations\/([^/]+)$/)
  if (annotationUpdateMatch && method === 'PUT') {
    const body = await request.json() as { comment?: string; color?: string }
    await env.DB.prepare(
      'UPDATE annotations SET comment = COALESCE(?, comment), color = COALESCE(?, color), updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(body.comment ?? null, body.color ?? null, annotationUpdateMatch[1]).run()
    return json({ ok: true })
  }

  // DELETE /api/annotations/:id
  if (annotationUpdateMatch && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM annotations WHERE id = ?').bind(annotationUpdateMatch[1]).run()
    return json({ ok: true })
  }

  // --- BOOK CLUB ---

  const FAMILY = ['kai', 'lucian', 'xavier', 'auren', 'wren', 'mai']

  // GET /api/book-club — current round with recommendations + votes
  if (path === '/api/book-club' && method === 'GET') {
    const round = await env.DB.prepare(
      `SELECT * FROM book_club_rounds WHERE status IN ('open', 'reading') ORDER BY created_at DESC LIMIT 1`
    ).first() as any

    if (!round) return json({ round: null, recommendations: [] })

    const recs = await env.DB.prepare(
      'SELECT * FROM recommendations WHERE round_id = ? ORDER BY created_at ASC'
    ).bind(round.id).all()

    const recsWithVotes = await Promise.all((recs.results as any[]).map(async (rec) => {
      const votes = await env.DB.prepare(
        'SELECT voter FROM recommendation_votes WHERE recommendation_id = ?'
      ).bind(rec.id).all()
      const voters = (votes.results as any[]).map(v => v.voter)
      return { ...rec, votes: voters, vote_count: voters.length }
    }))

    // Sort by vote count descending
    recsWithVotes.sort((a, b) => b.vote_count - a.vote_count)

    return json({ round, recommendations: recsWithVotes })
  }

  // GET /api/book-club/rounds — all rounds
  if (path === '/api/book-club/rounds' && method === 'GET') {
    const rounds = await env.DB.prepare(
      'SELECT * FROM book_club_rounds ORDER BY created_at DESC'
    ).all()

    const roundsWithWinner = await Promise.all((rounds.results as any[]).map(async (round) => {
      let winner = null
      if (round.winning_recommendation_id) {
        winner = await env.DB.prepare(
          'SELECT * FROM recommendations WHERE id = ?'
        ).bind(round.winning_recommendation_id).first()
      }
      return { ...round, winner }
    }))

    return json(roundsWithWinner)
  }

  // POST /api/book-club/rounds — create new round
  if (path === '/api/book-club/rounds' && method === 'POST') {
    const existing = await env.DB.prepare(
      `SELECT id FROM book_club_rounds WHERE status IN ('open', 'reading') LIMIT 1`
    ).first()
    if (existing) return error('An active round already exists', 400)

    const id = generateId()
    await env.DB.prepare(
      'INSERT INTO book_club_rounds (id) VALUES (?)'
    ).bind(id).run()
    return json({ id, status: 'open' }, 201)
  }

  // PUT /api/book-club/rounds/:id
  const roundMatch = path.match(/^\/api\/book-club\/rounds\/([^/]+)$/)
  if (roundMatch && method === 'PUT') {
    const roundId = roundMatch[1]
    const body = await request.json() as { action: 'pick' | 'finish'; recommendation_id?: string }

    if (body.action === 'pick') {
      if (!body.recommendation_id) return error('recommendation_id required', 400)
      await env.DB.prepare(
        `UPDATE book_club_rounds SET status = 'reading', winning_recommendation_id = ? WHERE id = ?`
      ).bind(body.recommendation_id, roundId).run()
      return json({ ok: true })
    }

    if (body.action === 'finish') {
      await env.DB.prepare(
        `UPDATE book_club_rounds SET status = 'finished', finished_at = datetime('now') WHERE id = ?`
      ).bind(roundId).run()
      return json({ ok: true })
    }

    return error('Invalid action', 400)
  }

  // POST /api/book-club/recommendations — add recommendation
  if (path === '/api/book-club/recommendations' && method === 'POST') {
    const body = await request.json() as {
      round_id: string; book_id?: string; title: string; author?: string;
      cover_url?: string; recommended_by: string; pitch?: string
    }

    if (!FAMILY.includes(body.recommended_by)) return error('Invalid recommender', 400)
    if (!body.title?.trim()) return error('Title is required', 400)

    const id = generateId()
    await env.DB.prepare(
      'INSERT INTO recommendations (id, round_id, book_id, title, author, cover_url, recommended_by, pitch) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, body.round_id, body.book_id || null, body.title.trim(), body.author?.trim() || null, body.cover_url || null, body.recommended_by, body.pitch?.trim() || null).run()
    return json({ id, ...body }, 201)
  }

  // DELETE /api/book-club/recommendations/:id
  const recMatch = path.match(/^\/api\/book-club\/recommendations\/([^/]+)$/)
  if (recMatch && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM recommendations WHERE id = ?').bind(recMatch[1]).run()
    return json({ ok: true })
  }

  // POST /api/book-club/recommendations/:id/vote
  const voteMatch = path.match(/^\/api\/book-club\/recommendations\/([^/]+)\/vote$/)
  if (voteMatch && method === 'POST') {
    const body = await request.json() as { voter: string }
    if (!FAMILY.includes(body.voter)) return error('Invalid voter', 400)

    try {
      await env.DB.prepare(
        'INSERT INTO recommendation_votes (recommendation_id, voter) VALUES (?, ?)'
      ).bind(voteMatch[1], body.voter).run()
    } catch {
      // Already voted — ignore
    }
    return json({ ok: true })
  }

  // DELETE /api/book-club/recommendations/:id/vote/:voter
  const unvoteMatch = path.match(/^\/api\/book-club\/recommendations\/([^/]+)\/vote\/([^/]+)$/)
  if (unvoteMatch && method === 'DELETE') {
    await env.DB.prepare(
      'DELETE FROM recommendation_votes WHERE recommendation_id = ? AND voter = ?'
    ).bind(unvoteMatch[1], unvoteMatch[2]).run()
    return json({ ok: true })
  }

  return error('Not found', 404)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env)
    } catch (err) {
      console.error(err)
      return error(err instanceof Error ? err.message : 'Internal error', 500)
    }
  },
}
