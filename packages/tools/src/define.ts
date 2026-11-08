// One way to make a tool: the input is checked against its JSON Schema, anything thrown becomes
// a ToolError, and every output (errors too) carries tools_version. Each door calls `run` as is,
// so the HTTP API, MCP, the CLI and the agent get the same answer for the same input.
import { schemas, TOOLS_VERSION } from '@petal/core';
import type { ToolError, ToolErrorCode } from '@petal/core/types';
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { fromThrown, toolError } from './errors.ts';
import type { JSONSchema, Tool, ToolContext } from './types.ts';

// ajv-formats is CommonJS; under NodeNext its default import is module.exports.
const addFormats = addFormatsModule.default;

const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true });
addFormats(ajv);

/** Compile a schema once with the tools' Ajv (draft 2020-12, formats on). */
export function compile(schema: JSONSchema): ValidateFunction {
  return ajv.compile(schema);
}

/** The flower schema's $defs (spec, interpretation, entry, ...), to embed under `$defs`. */
export const FLOWER_DEFS: Record<string, unknown> = (
  schemas.spec as { $defs: Record<string, unknown> }
).$defs;

/**
 * A schema with every local `$ref` (`#/$defs/x`) replaced by its definition, so it can be handed
 * on its own to a client that does not follow references (many model tool-call templates don't).
 */
export function inlineRefs<T>(schema: T, defs: Record<string, unknown> = FLOWER_DEFS): T {
  if (Array.isArray(schema)) return schema.map((x) => inlineRefs(x, defs)) as T;
  if (!schema || typeof schema !== 'object') return schema;
  const { $ref: ref, ...rest } = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof ref === 'string') {
    const name = /^#\/\$defs\/(.+)$/.exec(ref)?.[1];
    const def = name === undefined ? undefined : defs[name];
    if (def === undefined) throw new Error(`inlineRefs: cannot resolve ${ref}`);
    Object.assign(out, inlineRefs(def, defs));
  }
  for (const [k, v] of Object.entries(rest)) out[k] = inlineRefs(v, defs);
  return out as T;
}

/** MCP-style hints, also listed by the MCP door. */
export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export type Versioned<O> = O & { tools_version: string };

/** A registry tool, with the title, description and hints the doors list. */
export type PetalTool<I, O> = Tool<I, Versioned<O>> & {
  title: string;
  description: string;
  annotations: ToolAnnotations;
  /** true: a public site refuses it (Config.public), and a person's own agent runs it on their machine */
  onTheirMachine: boolean;
};

export interface ToolDef<I, O> {
  name: string;
  title: string;
  description: string;
  /** an object schema; `description` is set from the tool's description */
  input: JSONSchema;
  /**
   * What the door lets through, when that is looser than what `input` documents: a tool whose
   * job is to report a bad document (validate_spec) must get it, not refuse it as bad_input.
   */
  accepts?: JSONSchema;
  /** the success shape; `tools_version` is added */
  output: JSONSchema;
  annotations?: ToolAnnotations;
  /** code for an unexpected thrown error (default internal) */
  failure?: ToolErrorCode;
  /**
   * It reaches outside the site (a chain, a web page, a search, a payment route) or writes to a chain.
   * A public site does none of that for a visitor, so there it refuses with not_on_this_site, and the
   * person's own agent runs it on their machine instead.
   */
  onTheirMachine?: boolean;
  run(input: I, ctx: ToolContext): Promise<O | ToolError>;
}

const VERSION_PROP = { tools_version: { const: TOOLS_VERSION } };

export function versioned<T extends object>(out: T): Versioned<T> {
  return { ...out, tools_version: TOOLS_VERSION };
}

/** ToolError schema (tools.md, Shared rules), with tools_version. */
export const TOOL_ERROR_SCHEMA: JSONSchema = {
  type: 'object',
  required: ['error', 'tools_version'],
  additionalProperties: false,
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      additionalProperties: false,
      properties: {
        code: {
          enum: [
            'bad_input',
            'not_found',
            'cannot_read',
            'source_failed',
            'rate_limited',
            'invalid_spec',
            'unauthorised',
            'invite_required',
            'budget_exhausted',
            'not_on_this_site',
            'internal',
          ],
        },
        message: { type: 'string' },
        hint: { type: 'string' },
        retry_after_s: { type: 'number' },
      },
    },
    ...VERSION_PROP,
  },
};

/** What a public site answers for a tool that runs on the person's own machine. */
export function notOnThisSite(what: string): ToolError {
  return toolError(
    'not_on_this_site',
    `This site doesn't run ${what} for visitors: it reads no chain or web page, searches nothing and runs no model on anyone's behalf.`,
    'Your own agent does that on your machine. /connect says how to add Petals to it.',
  );
}

/** Ajv errors in plain words, at most five. */
export function describeErrors(errors: ErrorObject[] | null | undefined): string {
  const lines = (errors ?? []).slice(0, 5).map((e) => {
    const at = e.instancePath || 'input';
    const p = e.params as { allowedValues?: unknown[]; additionalProperty?: string };
    if (p.allowedValues) return `${at} must be one of ${p.allowedValues.join(', ')}`;
    if (p.additionalProperty) return `${at} has an unknown field: ${p.additionalProperty}`;
    return `${at} ${e.message ?? 'is not valid'}`;
  });
  const more = (errors?.length ?? 0) > 5 ? ` (and ${(errors?.length ?? 0) - 5} more)` : '';
  return `${lines.join('; ')}${more}`;
}

export function defineTool<I, O extends object>(def: ToolDef<I, O>): PetalTool<I, O> {
  const input: JSONSchema = { ...def.input, description: def.description };
  const output: JSONSchema = {
    ...def.output,
    required: [...((def.output.required as string[] | undefined) ?? []), 'tools_version'],
    properties: { ...((def.output.properties as object | undefined) ?? {}), ...VERSION_PROP },
  };
  const check = compile(def.accepts ?? input);
  const hint = `See the input schema of ${def.name} (MCP tools/list, or contracts/tools.md).`;
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    annotations: def.annotations ?? {},
    onTheirMachine: def.onTheirMachine === true,
    input,
    output,
    async run(raw: I, ctx: ToolContext): Promise<Versioned<O> | Versioned<ToolError>> {
      // First, so a refused call reads nothing, not even its input.
      if (def.onTheirMachine === true && ctx.config.public)
        return versioned(notOnThisSite(def.name));
      const i = raw === undefined || raw === null ? ({} as I) : raw;
      if (!check(i)) return versioned(toolError('bad_input', describeErrors(check.errors), hint));
      try {
        const out = await def.run(i, ctx);
        if (typeof out !== 'object' || out === null || Array.isArray(out)) {
          return versioned(toolError('internal', `${def.name} returned no result`));
        }
        return versioned(out);
      } catch (err) {
        return versioned(fromThrown(err, def.failure));
      }
    },
  } as PetalTool<I, O>;
}
