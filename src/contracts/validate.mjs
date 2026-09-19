import Ajv from 'ajv/dist/2020.js';
import { schemas } from './schemas.mjs';

export class ContractError extends Error {
   constructor(message, details = []) {
      super(message);
      this.name = 'ContractError';
      this.details = details;
   }
}

const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
for (const schema of Object.values(schemas)) ajv.addSchema(schema);

export function validate(kind, value) {
   const check = ajv.getSchema(`urn:phb:${kind}:v1`);
   if (!check) throw new ContractError(`Unknown contract: ${kind}`);
   if (!check(value)) {
      const errors = structuredClone(check.errors);
      const detail = errors.map((item) => `${item.instancePath || '/'} ${item.message}${item.params.additionalProperty ? `: ${item.params.additionalProperty}` : ''}`).join('; ');
      throw new ContractError(`Invalid ${kind}: ${detail}`, errors);
   }
   return value;
}
