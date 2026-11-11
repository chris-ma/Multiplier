import { z } from 'zod';
import { FIELDS, type FieldDef } from '../engine/fields';

/** Zod type for one coerced field value, generated from the field registry. */
function zodFor(def: FieldDef): z.ZodTypeAny {
  let t: z.ZodTypeAny;
  switch (def.type) {
    case 'string': case 'url': t = z.string().min(1); break;
    case 'industry': t = z.string().regex(/^[A-S]\d{3,4}$/); break;
    case 'number': t = z.number().finite(); break;
    case 'integer': t = z.number().int(); break;
    case 'percent': t = z.number().min(0, 'Percentage below 0').max(100, 'Percentage outside 0–100'); break;
    case 'signed_percent': t = z.number().min(-100).max(1000); break;
    case 'score05': t = z.number().min(0).max(5, 'Score must be 0–5'); break;
    case 'boolean': t = z.boolean(); break;
    case 'date': t = z.string().regex(/^\d{4}-\d{2}-\d{2}$/); break;
    case 'enum': t = z.enum(def.options as [string, ...string[]]); break;
  }
  if (def.key === 'abnormal_year') t = z.number().int().min(1).max(3);
  return def.required === true ? t : t.optional();
}

const shape: Record<string, z.ZodTypeAny> = Object.fromEntries(FIELDS.map((d) => [d.key, zodFor(d)]));

/** Record schema: field types + the cross-field rules from spec §6. `requirePrice: false` is for the sell side, where the price is the output. */
export const makeRecordSchema = ({ requirePrice = true }: { requirePrice?: boolean } = {}) => z
  .object(shape)
  .superRefine((r, ctx) => {
    const status = r.status as string | undefined;
    if (requirePrice && (status === 'listed' || status === 'under_offer') && r.asking_price === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['asking_price'], message: 'Required when status is listed' });
    }
    if (status === 'sold' && r.sale_price === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sale_price'], message: '`sold` without `sale_price`' });
    }
    for (const n of [1, 2, 3]) {
      const rev = r[`revenue_y${n}`] as number | undefined;
      const np = r[`net_profit_y${n}`] as number | undefined;
      if (rev !== undefined && np !== undefined && np > rev) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [`net_profit_y${n}`], message: 'Net profit above revenue' });
      }
    }
  });

export const RecordSchema = makeRecordSchema();

export const JSON_SCHEMA_VERSION = '1.0';
