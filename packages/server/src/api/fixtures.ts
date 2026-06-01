import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import type { FixtureType } from '@dmx-console/shared';
import { addFixtureToLibrary, getFixtureDef, queryFixtures } from '../fixtures/loader.js';
import { extractPdfText } from '../fixtures/pdfText.js';
import { saveUserFixture } from '../fixtures/userStore.js';
import { generateFixtureFromPdf } from '../llm/fixtureGen.js';
import { FixtureDefSchema } from '../llm/fixtureSchema.js';
import { slugify } from '../fixtures/parser.js';
import {
  DEFAULT_MODELS,
  LlmError,
  PROVIDER_NAMES,
  isProviderConfigured,
  type ProviderName,
} from '../llm/providers.js';

export const fixturesRouter = Router();

// ── PDF → fixture generation ────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

const generateLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', code: 'RATE_LIMITED' },
});

const GenerateBodySchema = z.object({
  provider: z.enum(PROVIDER_NAMES as [ProviderName, ...ProviderName[]]),
  model: z.string().min(1).optional(),
});

/** GET /api/fixtures/providers — which providers are configured (have an API key). */
fixturesRouter.get('/providers', (_req, res) => {
  res.json(
    PROVIDER_NAMES.map((name) => ({
      name,
      configured: isProviderConfigured(name),
      defaultModel: DEFAULT_MODELS[name],
    })),
  );
});

/** POST /api/fixtures/generate — extract a PDF manual and generate a FixtureDef preview (not saved). */
fixturesRouter.post('/generate', generateLimiter, upload.single('pdf'), (req, res) => {
  const parsed = GenerateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'Missing PDF upload (field "pdf")' });
    return;
  }

  const { provider } = parsed.data;
  if (!isProviderConfigured(provider)) {
    res.status(400).json({ error: `Provider "${provider}" is not configured on the server` });
    return;
  }
  const model = parsed.data.model ?? DEFAULT_MODELS[provider];
  const buffer = req.file.buffer;

  void (async () => {
    try {
      const text = await extractPdfText(buffer);
      const fixture = await generateFixtureFromPdf({ text, provider, model });
      res.json({ fixture });
    } catch (err) {
      if (err instanceof LlmError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: `Failed to process PDF: ${(err as Error).message}` });
    }
  })();
});

/** POST /api/fixtures — save a (reviewed) fixture definition to the library. */
fixturesRouter.post('/', (req, res) => {
  const parsed = FixtureDefSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid fixture definition', details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const id =
    data.id && data.id.length > 0
      ? data.id
      : `${slugify(data.manufacturer)}_${slugify(data.model)}`;
  const def = { ...data, id, source: data.source ?? 'user' } as Parameters<
    typeof addFixtureToLibrary
  >[0];

  saveUserFixture(def)
    .then(() => {
      addFixtureToLibrary(def);
      res.status(201).json({ fixture: def });
    })
    .catch((err: unknown) => {
      res.status(500).json({ error: `Failed to save fixture: ${(err as Error).message}` });
    });
});

const FIXTURE_TYPES: FixtureType[] = [
  'Dimmer',
  'Color Changer',
  'Moving Head',
  'Scanner',
  'LED Bar (Beams)',
  'LED Bar (Pixels)',
  'Strobe',
  'Effect',
  'Other',
];

const QuerySchema = z.object({
  type: z.enum(FIXTURE_TYPES as [FixtureType, ...FixtureType[]]).optional(),
  manufacturer: z.string().optional(),
  search: z.string().optional(),
});

/** GET /api/fixtures — list fixture library */
fixturesRouter.get('/', (req, res) => {
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.issues });
    return;
  }

  const { type, manufacturer, search } = parsed.data;
  const fixtures = queryFixtures({
    ...(type !== undefined && { type }),
    ...(manufacturer !== undefined && { manufacturer }),
    ...(search !== undefined && { search }),
  });
  res.json(fixtures);
});

/** GET /api/fixtures/:id — single fixture definition */
fixturesRouter.get('/:id', (req, res) => {
  const def = getFixtureDef(req.params.id ?? '');
  if (!def) {
    res.status(404).json({ error: 'Fixture not found' });
    return;
  }
  res.json(def);
});
