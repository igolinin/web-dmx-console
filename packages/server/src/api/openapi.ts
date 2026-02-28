import { Router } from 'express';

// ── OpenAPI 3.0 spec ──────────────────────────────────────────────────────────

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'DMX Console Agent API',
    version: '1.0.0',
    description:
      'REST API for LLM agents to control the DMX Console: read show state, send programmer commands, record cues, manage chases/shapes, and patch fixtures.',
  },
  servers: [{ url: '/api/agent', description: 'Agent API' }],
  tags: [
    { name: 'state', description: 'Read-only state queries' },
    { name: 'command', description: 'Unified command bus' },
  ],
  paths: {
    '/state': {
      get: {
        tags: ['state'],
        summary: 'Full show JSON',
        description:
          'Returns the complete Show object including fixtures, cue lists, chases, shapes, and settings.',
        responses: {
          200: {
            description: 'Show object',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Show' } } },
          },
        },
      },
    },
    '/output': {
      get: {
        tags: ['state'],
        summary: 'Current DMX output snapshot',
        description:
          'Returns the current 512-channel DMX values for each active universe as arrays of 0–255 integers.',
        responses: {
          200: {
            description: 'Universe DMX values',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: { type: 'array', items: { type: 'integer' } },
                  example: { 0: [0, 255, 128, 0] },
                },
              },
            },
          },
        },
      },
    },
    '/programmer': {
      get: {
        tags: ['state'],
        summary: 'Active programmer values',
        description: 'Returns the current programmer values — the "live edit" layer above cues.',
        responses: {
          200: {
            description: 'Programmer snapshot',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    fixtures: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/FixtureValues' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/command': {
      post: {
        tags: ['command'],
        summary: 'Execute an agent command',
        description:
          'Unified command bus. Send `{ action, payload }` to control any aspect of the show. Rate-limited to 100 requests per minute.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AgentCommand' },
              examples: {
                'programmer.set': {
                  summary: 'Set fixture channels',
                  value: {
                    action: 'programmer.set',
                    payload: { fixtureId: 'uuid', channels: { Red: 255, Dimmer: 200 } },
                  },
                },
                'cue.go': {
                  summary: 'Go on cue list',
                  value: { action: 'cue.go', payload: { cueListId: 'uuid' } },
                },
                'shape.create': {
                  summary: 'Create a pan/tilt circle shape',
                  value: {
                    action: 'shape.create',
                    payload: {
                      label: 'Pan swing',
                      shape2d: 'circle',
                      fixtureIds: ['id1', 'id2'],
                      speed: 0.5,
                      size: 80,
                      center: 128,
                      spread: 120,
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Command result',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { type: 'object', properties: { ok: { type: 'boolean' } } },
                    { $ref: '#/components/schemas/Cue' },
                    { $ref: '#/components/schemas/Chase' },
                    { $ref: '#/components/schemas/ShapeLayer' },
                    { $ref: '#/components/schemas/PatchedFixture' },
                  ],
                },
              },
            },
          },
          201: {
            description: 'Resource created (cue.record, chase.create, shape.create, patch.add)',
          },
          400: {
            description: 'Invalid payload',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          404: {
            description: 'Resource not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          409: {
            description: 'DMX address conflict',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          429: {
            description: 'Rate limit exceeded',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Error: {
        type: 'object',
        required: ['error', 'code'],
        properties: {
          error: { type: 'string', description: 'Human-readable error message' },
          code: {
            type: 'string',
            enum: ['INVALID_PAYLOAD', 'NOT_FOUND', 'CONFLICT', 'RATE_LIMITED'],
          },
          field: { type: 'string', nullable: true, description: 'Which field caused the error' },
        },
      },
      ChannelValues: {
        type: 'object',
        additionalProperties: { type: 'integer', minimum: 0, maximum: 255 },
        example: { Dimmer: 200, Red: 255, Green: 128, Blue: 0 },
      },
      FixtureValues: {
        type: 'object',
        required: ['fixtureId', 'channels'],
        properties: {
          fixtureId: { type: 'string', format: 'uuid' },
          channels: { $ref: '#/components/schemas/ChannelValues' },
        },
      },
      CueTiming: {
        type: 'object',
        properties: {
          fadeIn: { type: 'number', minimum: 0, description: 'Fade in time in seconds' },
          fadeOut: { type: 'number', minimum: 0, description: 'Fade out time in seconds' },
          delay: { type: 'number', minimum: 0, description: 'Delay before fade starts (seconds)' },
          follow: {
            type: 'number',
            minimum: 0,
            description: 'Auto-follow: seconds after cue before Go',
          },
        },
      },
      Cue: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          number: { type: 'number' },
          label: { type: 'string' },
          values: { type: 'array', items: { $ref: '#/components/schemas/FixtureValues' } },
          timing: { $ref: '#/components/schemas/CueTiming' },
        },
      },
      CueList: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          label: { type: 'string' },
          cues: { type: 'array', items: { $ref: '#/components/schemas/Cue' } },
        },
      },
      ChaseStep: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          values: { type: 'array', items: { $ref: '#/components/schemas/FixtureValues' } },
          timing: { $ref: '#/components/schemas/CueTiming' },
        },
      },
      Chase: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          label: { type: 'string' },
          bpm: { type: 'number' },
          direction: { type: 'string', enum: ['forward', 'backward', 'bounce', 'random'] },
          steps: { type: 'array', items: { $ref: '#/components/schemas/ChaseStep' } },
        },
      },
      ShapeLayer: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          label: { type: 'string' },
          waveform: {
            type: 'string',
            enum: ['sine', 'cosine', 'triangle', 'square', 'ramp', 'random'],
          },
          target: { type: 'string' },
          shape2d: { type: 'string', enum: ['circle', 'figure8', 'lissajous'] },
          fixtureIds: { type: 'array', items: { type: 'string' } },
          speed: { type: 'number' },
          size: { type: 'number' },
          center: { type: 'number' },
          spread: { type: 'number' },
          phaseOffset: { type: 'number' },
          active: { type: 'boolean' },
        },
      },
      PatchedFixture: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          defId: { type: 'string' },
          universe: { type: 'integer' },
          address: { type: 'integer', minimum: 1, maximum: 512 },
          label: { type: 'string' },
          modeIndex: { type: 'integer' },
          groupIds: { type: 'array', items: { type: 'string' } },
        },
      },
      Show: {
        type: 'object',
        properties: {
          version: { type: 'string', enum: ['1'] },
          meta: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              author: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
              modifiedAt: { type: 'string', format: 'date-time' },
            },
          },
          fixtures: { type: 'array', items: { $ref: '#/components/schemas/PatchedFixture' } },
          cueLists: { type: 'array', items: { $ref: '#/components/schemas/CueList' } },
          chases: { type: 'array', items: { $ref: '#/components/schemas/Chase' } },
          shapes: { type: 'array', items: { $ref: '#/components/schemas/ShapeLayer' } },
        },
      },
      AgentCommand: {
        type: 'object',
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: [
              'programmer.set',
              'programmer.setGroup',
              'programmer.clear',
              'cue.record',
              'cue.go',
              'cue.back',
              'cue.pause',
              'chase.create',
              'chase.play',
              'chase.stop',
              'shape.create',
              'shape.update',
              'shape.delete',
              'patch.add',
              'patch.remove',
            ],
          },
          payload: { type: 'object', description: 'Action-specific payload (see examples)' },
        },
      },
    },
  },
};

// ── Swagger UI HTML ───────────────────────────────────────────────────────────

const SWAGGER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DMX Console Agent API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
  SwaggerUIBundle({
    url: '/api/docs/json',
    dom_id: '#swagger-ui',
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
    layout: 'StandaloneLayout',
    deepLinking: true,
  });
</script>
</body>
</html>`;

// ── Router ────────────────────────────────────────────────────────────────────

export const docsRouter = Router();

/** GET /api/docs — Swagger UI */
docsRouter.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(SWAGGER_HTML);
});

/** GET /api/docs/json — raw OpenAPI JSON */
docsRouter.get('/json', (_req, res) => {
  res.json(spec);
});
